'use client';

import { useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box3, Color, type Group, MathUtils, NeutralToneMapping, type PerspectiveCamera, Vector3 } from 'three';
import { StudioEnvironment } from '@/components/three/kit/StudioEnvironment';
import { LIGHT_PRESETS } from '@/components/three/kit/StudioLights';
import { gsap } from '@/lib/motion/gsap';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { useThemeStore } from '@/lib/theme';
import { fitBox, modelBox, POSTER_POSE, posterBoxOnCanvas } from '@/lib/three/poster-match';
import { TILT_Z } from './ball-axis';

// Foco 3D de la sección Balones: un solo balón que gira sobre un eje
// inclinado, con las luces de estudio del tema. Igual que el prototipo
// (design/prototype/sections/baggage/focus.js), pero el canvas cubre solo el
// foco: la banda usa los pósters como fotos.
//
// Valores por cuadro (giro, escala del cambio) en refs; React solo se entera
// de qué modelo se muestra.

const BALL_M = 0.22; // diámetro real (m), pose canónica de los balones
const FOV = 22;
const ELEVATION = MathUtils.degToRad(7); // cámara apenas sobre el ecuador
const TILT_X = 0.21; // eje inclinado hacia la cámara
const SPIN = 0.42; // giro libre (rad/s)

export interface BallControls {
  // Giro pedido por arrastre o teclado (rad); la escena lo alcanza suave.
  dragYaw: number;
  // Giro que se ve (salida, para la lectura "Giro" del panel).
  yaw: number;
  // Redibuja un cuadro (con movimiento reducido el lienzo dibuja a pedido).
  invalidate: (() => void) | null;
}

interface SceneProps {
  url: string;
  active: boolean;
  lite: boolean;
  reducedMotion: boolean;
  controlsRef: RefObject<BallControls>;
  onReady(): void;
  // Contenedor del póster de respaldo y estado compartido: si el póster ya se
  // ve (la carga tardó), el primer balón entra con su pose y en su lugar;
  // decidePoster avisa que la escena ya eligió
  // cómo entrar (el póster ya no aparece) y dice si el póster se ve.
  posterRef?: RefObject<HTMLElement | null>;
  decidePoster?(): boolean;
}

// Entrada (primera vez y al cambiar de balón): llega girando rápido y un poco
// más chico, y frena con una curva de salida mientras el lienzo aparece; ya
// está en movimiento en el primer cuadro visible.
const ENTER = { boost: 5, scale: 0.88, duration: 2.2, ease: 'power3.out' };

export default function BallScene(props: SceneProps) {
  const { active, lite, reducedMotion } = props;
  return (
    <Canvas
      dpr={lite ? 1 : [1, 1.5]}
      frameloop={active ? (reducedMotion ? 'demand' : 'always') : 'never'}
      camera={{ fov: FOV, near: 0.05, far: 20, position: [0, 0, 2] }}
      gl={{ antialias: !lite, alpha: true, toneMapping: NeutralToneMapping, powerPreference: 'high-performance' }}
    >
      <StudioEnvironment />
      <BallLights />
      <Suspense fallback={null}>
        <Rig {...props} />
      </Suspense>
    </Canvas>
  );
}

// Luces del tema (LIGHT_PRESETS del kit) ajustadas para balones, como en el
// prototipo: sobre un balón blanco el contraluz lima se lee como una mancha,
// así que queda como un filo; el relleno sube un poco.
const RIM = 0.4;
const FILL = 1.25;
const tokenColor = (name: string) => new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'white');

function BallLights() {
  const theme = useThemeStore((state) => state.theme);
  const preset = LIGHT_PRESETS[theme];
  const get = useThree((state) => state.get);
  const rimColor = useMemo(() => tokenColor('--color-primary-fill'), []);

  useEffect(() => {
    const { gl, scene, invalidate } = get();
    gl.toneMappingExposure = preset.exposure;
    scene.environmentIntensity = preset.environment;
    invalidate();
  }, [get, preset]);

  return (
    <>
      <directionalLight position={[0.6, 1.2, 1]} intensity={preset.key} />
      <directionalLight position={[-1, 0.3, 0.8]} intensity={preset.fill * FILL} />
      <directionalLight position={[-0.8, 0.6, -1.2]} intensity={preset.rim * RIM} color={rimColor} />
      <directionalLight position={[0.9, 1, -1]} intensity={preset.kicker} />
    </>
  );
}

// Inclinación de entrada que compensa la diferencia de elevación entre esta
// cámara y la del póster: el balón se ve como en la foto.
const ENTRY_TILT_X = -(ELEVATION - POSTER_POSE.ballElevation);

function Rig({ url, reducedMotion, controlsRef, onReady, posterRef, decidePoster }: SceneProps) {
  // Modelo que se ve; el pedido (url) carga aparte y se cambia al estar listo.
  const [shownUrl, setShownUrl] = useState<string | null>(null);
  const shown = useRef<string | null>(null);
  const anim = useRef({ scale: 0, boost: 0, float: reducedMotion ? 0 : 1 });
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const pivot = useRef<Group>(null);
  const spin = useRef(0);
  const drag = useRef(0);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const get = useThree((state) => state.get);
  // Entrada desde el póster: inclinación, ritmo del giro (0 quieto, 1
  // normal) y ajuste de pantalla (escala y desplazamiento en px) que pone la
  // silueta del balón sobre la del póster. Todo vuelve a su valor por tiempo.
  const entry = useRef({ tiltX: TILT_X, tiltZ: TILT_Z, run: reducedMotion ? 0 : 1, zoom: 1, dx: 0, dy: 0 });
  const entryState = useRef<'idle' | 'measure' | 'reveal' | 'settled'>('idle');
  const posterBox = useRef<Awaited<ReturnType<typeof posterBoxOnCanvas>> | undefined>(undefined);
  const drawn = useRef(0);
  const withPoster = useRef(false);
  // Cambio de balón: el lienzo se apaga, se cambia y, con dos cuadros del
  // nuevo ya dibujados, vuelve a entrar en movimiento.
  const swapState = useRef<'none' | 'wait'>('none');
  const swapDrawn = useRef(0);

  useEffect(() => {
    const controls = controlsRef.current;
    controls.invalidate = invalidate;
    return () => {
      controls.invalidate = null;
    };
  }, [controlsRef, invalidate]);

  useEffect(
    () => () => {
      timeline.current?.kill();
      gsap.killTweensOf(entry.current);
    },
    [],
  );

  // Compila los materiales del balón nuevo antes de mostrarlo.
  useEffect(() => {
    if (!shownUrl) return;
    const { gl, scene, camera: view } = get();
    gl.compile(scene, view);
    invalidate();
  }, [shownUrl, get, invalidate]);

  // Cambio de balón por tiempo (nunca por scroll): el actual se encoge
  // girando rápido y el nuevo crece en su lugar. Con movimiento reducido, al
  // instante. Pedidos rápidos: siempre termina en el último.
  const onLoaded = useCallback(
    (next: string) => {
      if (next === shown.current) return;
      const state = anim.current;
      timeline.current?.kill();
      const first = shown.current === null;
      const show = () => {
        shown.current = next;
        setShownUrl(next);
      };
      if (first) {
        withPoster.current = decidePoster?.() ?? false;
        if (!withPoster.current) {
          // Camino normal (escenario vacío): se revela en dos cuadros, ya
          // con la pose de partida de la entrada.
          show();
          Object.assign(state, reducedMotion ? { scale: 1, boost: 0 } : { scale: ENTER.scale, boost: ENTER.boost });
          drawn.current = 0;
          entryState.current = 'reveal';
          invalidate();
          return;
        }
        // Con el póster a la vista: tamaño completo y pose del póster; se
        // mide en el primer cuadro y se revela (ver useFrame).
        show();
        Object.assign(state, { scale: 1, boost: 0 });
        spin.current = POSTER_POSE.ballYaw;
        Object.assign(entry.current, { tiltX: ENTRY_TILT_X, tiltZ: 0, run: 0 });
        entryState.current = 'measure';
        posterBox.current = undefined;
        void posterBoxOnCanvas(posterRef?.current ?? null, get().gl.domElement).then((box) => {
          posterBox.current = box;
          invalidate();
        });
        invalidate();
        return;
      }
      if (reducedMotion) {
        show();
        Object.assign(state, { scale: 1, boost: 0 });
        invalidate();
        return;
      }
      // Fundido corto del lienzo (GSAP solo anima la opacidad del <canvas>;
      // la de su contenedor es del CSS) mientras acelera; ya oculto, el cambio.
      const canvas = get().gl.domElement;
      gsap.killTweensOf(state);
      timeline.current = gsap
        .timeline()
        .to(canvas, { opacity: 0, duration: DURATION.ui, ease: 'power2.in' }, 0)
        .to(state, { boost: ENTER.boost, duration: DURATION.ui, ease: 'power2.in' }, 0)
        .add(() => {
          show();
          swapDrawn.current = 0;
          swapState.current = 'wait';
        });
    },
    [reducedMotion, invalidate, get, posterRef, decidePoster],
  );

  // Entrada en movimiento: frena el giro rápido y crece hasta su tamaño.
  const enterMoving = () => {
    const state = anim.current;
    gsap.killTweensOf(state);
    Object.assign(state, { scale: ENTER.scale, boost: ENTER.boost });
    gsap.to(state, { scale: 1, boost: 0, duration: ENTER.duration, ease: ENTER.ease });
  };

  // El póster se apaga y luego aparece el lienzo (DURATION.ui cada uno);
  // con el lienzo ya visible, el balón se inclina, gira y vuelve a su
  // encuadre propio. Con movimiento reducido queda la pose del póster.
  const settle = () => {
    entryState.current = 'settled';
    onReady();
    if (reducedMotion) return;
    if (!withPoster.current) return enterMoving();
    gsap.to(entry.current, { tiltX: TILT_X, tiltZ: TILT_Z, zoom: 1, dx: 0, dy: 0, duration: DURATION.cinematic, delay: DURATION.ui * 2, ease: EASE.inOut.gsap });
    gsap.to(entry.current, { run: 1, duration: DURATION.cinematic, delay: DURATION.ui * 2, ease: 'power2.in' });
  };

  // Distancia de cámara: el balón ocupa D px del lienzo (tope de tamaño como
  // en el prototipo: las texturas lite no aguantan un primer plano).
  const distance = useMemo(() => {
    const diameter = Math.min(size.width * 0.56, size.height * 0.66, 300);
    const focal = size.height / 2 / Math.tan(MathUtils.degToRad(FOV / 2));
    return (focal * BALL_M) / Math.max(diameter, 1);
  }, [size.width, size.height]);

  useEffect(() => {
    camera.position.set(0, distance * Math.sin(ELEVATION), distance * Math.cos(ELEVATION));
    camera.lookAt(0, 0, 0);
    invalidate();
  }, [camera, distance, invalidate]);

  useFrame((state, delta) => {
    const group = pivot.current;
    if (!group) return;
    const control = controlsRef.current;
    const current = anim.current;
    const pose = entry.current;
    if (!reducedMotion) spin.current += delta * (SPIN * pose.run + current.boost);
    drag.current = MathUtils.damp(drag.current, control.dragYaw, 8, delta);
    const yaw = spin.current + drag.current;
    control.yaw = yaw;
    group.rotation.set(pose.tiltX, yaw, pose.tiltZ, 'XZY');
    group.scale.setScalar(Math.max(current.scale, 0.0001));
    group.position.y = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 1.15) * BALL_M * 0.014 * current.float * pose.run;

    // Ajuste de pantalla de la entrada (escala y desplazamiento de la lente).
    const { width, height } = state.size;
    const lens = state.camera as PerspectiveCamera;
    if (pose.zoom !== 1 || pose.dx || pose.dy) {
      lens.zoom = pose.zoom;
      lens.setViewOffset(width, height, -pose.dx, -pose.dy, width, height);
    } else if (lens.view?.enabled || lens.zoom !== 1) {
      lens.zoom = 1;
      lens.clearViewOffset();
    }

    if (swapState.current === 'wait' && ++swapDrawn.current >= 2) {
      swapState.current = 'none';
      enterMoving();
      timeline.current = gsap.timeline().to(state.gl.domElement, { opacity: 1, duration: DURATION.reveal, ease: EASE.out.gsap });
    }

    if (entryState.current === 'reveal') {
      if (++drawn.current >= 2) settle();
      else state.invalidate();
    } else if (entryState.current === 'measure' && posterBox.current !== undefined) {
      const target = posterBox.current;
      const box = target ? modelBox(group, camera, width, height) : null;
      const fit = box && target ? fitBox(box, target, { x: width / 2, y: height / 2 }) : null;
      if (fit) Object.assign(pose, { zoom: fit.scale, dx: fit.dx, dy: fit.dy });
      else if (!reducedMotion) Object.assign(pose, { tiltX: TILT_X, tiltZ: TILT_Z });
      drawn.current = 0;
      entryState.current = 'reveal';
      // Con frameloop "demand" hace falta pedir los cuadros siguientes.
      state.invalidate();
    }
    // A pedido: sigue dibujando hasta que el giro manual se asienta.
    if (reducedMotion && Math.abs(drag.current - control.dragYaw) > 0.0005) state.invalidate();
  });

  return (
    <>
      <group ref={pivot}>{shownUrl && <BallModel url={shownUrl} />}</group>
      <Suspense fallback={null}>
        <Loader url={url} onLoaded={onLoaded} />
      </Suspense>
    </>
  );
}

// Carga el modelo pedido (suspende hasta tenerlo) y avisa al terminar.
function Loader({ url, onLoaded }: { url: string; onLoaded(url: string): void }) {
  useGLTF(url);
  useEffect(() => onLoaded(url), [url, onLoaded]);
  return null;
}

// Copia propia del modelo, centrada con precisión: la caja se mide con los
// vértices (setFromObject preciso), no con las cajas de cada malla, para que
// el balón gire sobre su centro real y no "orbite" (ver focus.js, prepare).
function BallModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => {
    const copy = scene.clone(true);
    copy.updateMatrixWorld(true);
    const center = new Box3().setFromObject(copy, true).getCenter(new Vector3());
    copy.position.sub(center);
    return copy;
  }, [scene]);
  return <primitive object={object} />;
}
