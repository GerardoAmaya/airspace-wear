'use client';

import { Shadow, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, type ReactNode, type RefObject, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Box3, Color, type DirectionalLight, type Group, MathUtils, NeutralToneMapping, type Object3D } from 'three';
import { StudioEnvironment } from '@/components/three/kit/StudioEnvironment';
import { LIGHT_PRESETS } from '@/components/three/kit/StudioLights';
import { gsap } from '@/lib/motion/gsap';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { useThemeStore } from '@/lib/theme';
import { fitBox, modelBox, POSTER_POSE, posterBoxOnCanvas } from '@/lib/three/poster-match';
import { enterHost, FLOOR_Y, FOV, type Host, mix, type Pose, POSES, resumeNow, type Spin, stepSpin, TAN_HALF } from './rig';

// Escenario 3D del tablero y del Hangar 360°. Hay un canvas por base (vista
// previa y plataforma), pero solo dibuja el que el director de render elige
// (frameloop "never" en el otro), así que nunca hay dos dibujando a la vez.
// Lo que cambia por cuadro (giro, cámara, luces) vive en refs y se escribe en
// useFrame; React solo se entera de cambios discretos (modelo listo).

export type SceneStatus = 'loading' | 'idle' | 'error';

export interface ModelRequest {
  url: string;
  foot: 'left' | 'right' | null;
}

export interface SceneProps {
  host: Host;
  active: boolean;
  request: ModelRequest | null;
  lite: boolean;
  reducedMotion: boolean;
  spin: RefObject<Spin>;
  onStatus(status: SceneStatus): void;
  onReady(): void;
  // Plataforma: el zapato ya aterrizó (true) o está bajando (false).
  onLanded?(landed: boolean): void;
  // Plataforma: pose de cámara y giro de cada cuadro (anillos y lectura ROT).
  onFrame?(pose: Pose, size: { width: number; height: number }, angle: number): void;
  // Vista previa: contenedor del póster de respaldo y estado compartido. Si
  // el póster ya se ve (la carga tardó), el primer modelo entra con su pose y
  // en su lugar (ver lib/three/poster-match); decidePoster avisa que la escena ya
  // eligió cómo entrar (el póster ya no aparece) y dice si el póster se ve.
  posterRef?: RefObject<HTMLElement | null>;
  decidePoster?(): boolean;
}

// Entrada de la vista previa (primera vez y al cambiar de modelo): el zapato
// llega girando y acercándose con una curva de salida, ya en movimiento en el
// primer cuadro visible, mientras el lienzo aparece con un fundido.
const ENTER = { turn: 1.4, k: 0.9, duration: 2.2, ease: 'power3.out' };

export default function BoardScene(props: SceneProps) {
  return (
    <Canvas
      dpr={props.lite ? 1 : [1, 1.5]}
      frameloop={props.active ? 'always' : 'never'}
      camera={{ fov: FOV, near: 0.01, far: 20, position: [0, 0.02, 1.4] }}
      gl={{ antialias: !props.lite, alpha: true, toneMapping: NeutralToneMapping, powerPreference: 'high-performance' }}
      style={{ pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <StudioEnvironment />
      <Rig {...props} />
    </Canvas>
  );
}

interface Entry {
  object: Object3D;
  height: number;
  foot: 'left' | 'right' | null;
}

// Carga un GLB con la caché de drei (un mismo archivo se descarga una vez
// aunque lo usen varias escenas) y entrega una copia propia de la escena.
function ModelLoader({ request, onLoad }: { request: ModelRequest; onLoad(url: string, entry: Entry): void }) {
  const { scene } = useGLTF(request.url);
  const entry = useMemo(() => {
    const object = scene.clone(true);
    // Caja precisa (por vértice): con nodos rotados, la aproximada queda holgada.
    const box = new Box3().setFromObject(object, true);
    return { object, height: box.max.y - box.min.y, foot: request.foot };
  }, [scene, request.foot]);
  useEffect(() => onLoad(request.url, entry), [onLoad, request.url, entry]);
  return null;
}

class LoadBoundary extends Component<{ onError(): void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Color de marca desde los tokens (nunca un hex en el componente).
const tokenColor = (name: string) => new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'white');

// Giro base de la vista previa (rad) respecto del lado externo.
const BOARD_YAW = 0.42;
const RAD_TO_DEG = 180 / Math.PI;

function Rig({ host, active, request, reducedMotion, spin, onStatus, onReady, onLanded, onFrame, posterRef, decidePoster }: SceneProps) {
  const [entries, setEntries] = useState(() => new Map<string, Entry>());
  const [shown, setShown] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const sneaker = useRef<Group>(null);
  const swapper = useRef<Group>(null);
  const shadow = useRef<Group>(null);
  const keyLight = useRef<DirectionalLight>(null);
  const fillLight = useRef<DirectionalLight>(null);
  const rimLight = useRef<DirectionalLight>(null);
  const kickerLight = useRef<DirectionalLight>(null);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const get = useThree((state) => state.get);
  const theme = useThemeStore((state) => state.theme);
  const rimColor = useMemo(() => tokenColor('--color-primary-fill'), []);
  const cam = useRef<Pose>(POSES[host](size.width || 1, size.height || 1));
  const swap = useRef<gsap.core.Timeline | null>(null);
  // Entrada desde el póster: desfase de giro (rad) y vaivén (0 quieto, 1
  // normal). El vaivén cuenta desde que el modelo aparece (fase 0), así el
  // primer cuadro coincide con el póster.
  const entryMotion = useRef({ yaw: 0, sway: 1, since: 0 });
  // idle: aún no hay modelo; measure: falta medir; settled: ya se mostró.
  const entryState = useRef<'idle' | 'measure' | 'reveal' | 'settled'>('idle');
  const withPoster = useRef(false);
  // Cambio de modelo en la vista previa: el lienzo se apaga, se cambia el
  // modelo y, con dos cuadros ya dibujados, vuelve a entrar en movimiento.
  const swapState = useRef<'none' | 'out' | 'wait'>('none');
  const swapDrawn = useRef(0);
  const posterBox = useRef<Awaited<ReturnType<typeof posterBoxOnCanvas>> | undefined>(undefined);
  const gl = useThree((state) => state.gl);

  const onLoad = useMemo(
    () => (url: string, entry: Entry) =>
      setEntries((current) => {
        if (current.get(url) === entry) return current;
        const next = new Map(current);
        next.set(url, entry);
        return next;
      }),
    [],
  );

  // Exposición e intensidad del entorno por tema (propiedades del renderizador).
  useEffect(() => {
    const { gl, scene, invalidate } = get();
    const preset = LIGHT_PRESETS[theme];
    gl.toneMappingExposure = preset.exposure;
    scene.environmentIntensity = preset.environment;
    invalidate();
  }, [get, theme]);

  // Sin transición en curso, la pose sigue al tamaño del canvas.
  useEffect(() => {
    if (!size.width || !size.height || gsap.isTweening(cam.current)) return;
    if (entryState.current === 'measure' || entryState.current === 'reveal') return;
    Object.assign(cam.current, POSES[host](size.width, size.height));
  }, [host, size.width, size.height]);

  // Cambio de modelo: siempre termina en el último pedido. El actual se
  // encoge y gira, se cambia y el nuevo crece (como swapModel del prototipo).
  const url = request?.url ?? null;
  const ready = url !== null && entries.has(url);
  useEffect(() => {
    if (!url || !ready || shown === url) return;
    const group = swapper.current;
    swap.current?.kill();
    if (!shown || reducedMotion || !group) {
      if (group) {
        group.scale.setScalar(1);
        group.rotation.y = 0;
      }
      setShown(url);
      return;
    }
    if (host === 'board') {
      // Fundido corto del lienzo (GSAP solo anima la opacidad del <canvas>;
      // la de su contenedor es del CSS) y, ya oculto, el cambio.
      swapState.current = 'out';
      gsap.killTweensOf(gl.domElement);
      swap.current = gsap.timeline().to(gl.domElement, { opacity: 0, duration: DURATION.ui, ease: 'power2.in' }).add(() => {
        swapDrawn.current = 0;
        swapState.current = 'wait';
        setShown(url);
      });
      return;
    }
    const half = 0.4;
    swap.current = gsap
      .timeline()
      .to(group.scale, { x: 0.001, y: 0.001, z: 0.001, duration: half, ease: 'power3.in' }, 0)
      .to(group.rotation, { y: '+=1.2', duration: half, ease: 'power3.in' }, 0)
      .add(() => setShown(url))
      .set(group.rotation, { y: -1.2 })
      .to(group.scale, { x: 1, y: 1, z: 1, duration: half, ease: 'power3.out' })
      .to(group.rotation, { y: 0, duration: half, ease: 'power3.out' }, '<');
  }, [url, ready, shown, reducedMotion, host, gl]);
  useEffect(() => () => void swap.current?.kill(), []);

  // Entrada en movimiento: parte girada y un poco más lejos y llega a la pose
  // de la vista previa con una curva de salida; el vaivén entra con ella.
  const enterMoving = () => {
    const target = POSES[host](size.width || 1, size.height || 1);
    gsap.killTweensOf(cam.current);
    gsap.killTweensOf(entryMotion.current);
    Object.assign(cam.current, { ...target, k: target.k * ENTER.k });
    const sign = entries.get(url ?? '')?.foot === 'right' ? 1 : -1;
    Object.assign(entryMotion.current, { yaw: sign * ENTER.turn, sway: 0 });
    gsap.to(cam.current, { ...target, duration: ENTER.duration, ease: ENTER.ease });
    gsap.to(entryMotion.current, { yaw: 0, sway: 1, duration: ENTER.duration, ease: ENTER.ease });
  };

  // Estado de carga visible en la base.
  const status: SceneStatus = url && failed === url ? 'error' : url && (!ready || shown !== url) ? 'loading' : 'idle';
  useEffect(() => onStatus(status), [onStatus, status]);
  const hasModel = shown !== null;
  const matchPoster = host === 'board' && !!posterRef;
  // Cuadros dibujados con el modelo: "listo" llega en el segundo, con los
  // shaders compilados y las texturas en la GPU, así esa pausa ocurre con el
  // lienzo todavía oculto y nunca en medio del fundido.
  const drawn = useRef(0);

  // Cambio de base (por tiempo, nunca por scroll): al empezar a dibujar aquí
  // después de que dibujó la otra base, la plataforma hace "aterrizar" el
  // zapato y la vista previa lo asienta. La primera vez no hay transición.
  useEffect(() => {
    if (!active || !hasModel) return;
    const previous = enterHost(spin.current, host);
    const target = POSES[host](size.width || 1, size.height || 1);
    gsap.killTweensOf(cam.current);
    if (matchPoster && entryState.current === 'idle') {
      // Primera vez en la vista previa. Camino normal (escenario vacío): se
      // revela en dos cuadros y entra en movimiento. Con el póster de
      // respaldo a la vista: pose del póster, se mide, se calza y se revela.
      entryState.current = 'measure';
      withPoster.current = decidePoster?.() ?? false;
      Object.assign(cam.current, target);
      Object.assign(entryMotion.current, { yaw: 0, sway: 0 });
      if (!withPoster.current) {
        posterBox.current = null;
        return;
      }
      const sign = entries.get(url!)?.foot === 'right' ? -1 : 1;
      Object.assign(entryMotion.current, { yaw: sign * (POSTER_POSE.sneakerYaw - BOARD_YAW) });
      cam.current.elevation = POSTER_POSE.sneakerElevation * RAD_TO_DEG;
      posterBox.current = undefined;
      void posterBoxOnCanvas(posterRef!.current, gl.domElement).then((box) => {
        posterBox.current = box;
      });
      return;
    }
    if (previous === host || previous === null || reducedMotion) {
      Object.assign(cam.current, target);
      onLanded?.(true);
      return;
    }
    if (host === 'hangar') {
      // Aterrizaje: el zapato baja sobre la plataforma mientras la cámara sube.
      onLanded?.(false);
      Object.assign(cam.current, { ...target, k: target.k * 0.74, elevation: 4, lift: 0.07, hangar: 0 });
      gsap.to(cam.current, { ...target, duration: DURATION.cinematic, ease: EASE.inOut.gsap, onComplete: () => onLanded?.(true) });
      resumeNow(spin.current);
    } else {
      Object.assign(cam.current, { ...target, k: target.k * 0.88, lift: 0.035, hangar: 1 });
      gsap.to(cam.current, { ...target, duration: 1.1, ease: EASE.out.gsap });
    }
    // Lo que sigue depende solo de la activación; el tamaño se sigue aparte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hasModel, host]);

  // Revela el lienzo (fundido sobre el póster) y luego asienta la pose por
  // tiempo: encuadre propio, giro base y vaivén. Con movimiento reducido la
  // pose del póster queda como estado fijo.
  // El póster se apaga (DURATION.ui) y luego aparece el lienzo (otro tanto):
  // nunca se ven los dos a la vez. El asiento empieza con el lienzo visible.
  const settle = () => {
    entryState.current = 'settled';
    onReady();
    if (reducedMotion) return;
    if (!withPoster.current) return enterMoving();
    const target = POSES[host](size.width || 1, size.height || 1);
    const delay = DURATION.ui * 2;
    gsap.to(cam.current, { ...target, duration: DURATION.cinematic * 0.75, delay, ease: EASE.inOut.gsap });
    gsap.to(entryMotion.current, { yaw: 0, sway: 1, duration: DURATION.cinematic, delay, ease: EASE.inOut.gsap });
  };
  useEffect(() => () => void gsap.killTweensOf(entryMotion.current), []);
  useEffect(() => () => void gsap.killTweensOf(cam.current), []);

  const entry = shown ? entries.get(shown) : undefined;

  // Compila los materiales del modelo nuevo antes de mostrarlo.
  const entryObject = entry?.object;
  useEffect(() => {
    if (!entryObject) return;
    const { gl: renderer, scene, camera: view } = get();
    renderer.compile(scene, view);
  }, [entryObject, get]);

  useFrame((state, delta) => {
    const width = state.size.width;
    const height = state.size.height;
    if (!width || !height) return;
    const dt = Math.min(0.05, delta || 0.016);
    const time = state.clock.elapsedTime;
    const pose = cam.current;
    const spinState = spin.current;

    // Cámara: orbita el origen y la lente ubica el zapato en (ax, ay).
    const focal = height / 2 / TAN_HALF;
    const distance = focal / pose.k;
    const elevation = MathUtils.degToRad(pose.elevation);
    camera.position.set(0, distance * Math.sin(elevation), distance * Math.cos(elevation));
    (camera as unknown as { setViewOffset(...args: number[]): void }).setViewOffset(width, height, width / 2 - pose.ax, height / 2 - pose.ay, width, height);
    camera.lookAt(0, 0, 0);

    stepSpin(spinState, host, dt, reducedMotion);
    const motion = entryMotion.current;
    if (motion.sway === 0) motion.since = time;

    // Orientación: el lado externo a la cámara (como yawFor del prototipo).
    const baseYaw = entry?.foot === 'right' ? -BOARD_YAW : Math.PI + BOARD_YAW;
    const idle = reducedMotion ? 0 : motion.sway;
    const swayTime = time - motion.since;
    // En la vista previa: vaivén suave más lo que el usuario haya girado.
    const boardYaw = baseYaw + motion.yaw + spinState.angle + idle * Math.sin(swayTime * 0.42) * 0.34;
    const hangarYaw = baseYaw + spinState.angle;
    const yaw = mix(boardYaw, hangarYaw, pose.hangar);
    const shoeHeight = entry?.height ?? 0.15;
    if (sneaker.current) {
      sneaker.current.rotation.y = yaw;
      sneaker.current.position.y = FLOOR_Y + shoeHeight / 2 + pose.lift + idle * Math.sin(swayTime * 1.1) * 0.004 * (1 - pose.hangar);
    }
    if (shadow.current && swapper.current) {
      shadow.current.rotation.y = yaw + swapper.current.rotation.y;
      const lift = Math.max(0, pose.lift);
      const material = (shadow.current.children[0] as unknown as { material?: { opacity: number } })?.material;
      if (material) material.opacity = LIGHT_PRESETS[theme].shadow * Math.max(0, 1 - lift * 6) * swapper.current.scale.x;
      shadow.current.scale.setScalar(1 + lift * 2);
    }

    // Luces: el preset del tema es la base. En la plataforma baja un poco la
    // principal y sube el contorno; en claro el contraluz lima casi se apaga.
    const preset = LIGHT_PRESETS[theme];
    const e = pose.hangar;
    const light = theme === 'light';
    if (keyLight.current) keyLight.current.intensity = preset.key * mix(1, 0.9, e);
    if (fillLight.current) fillLight.current.intensity = preset.fill * mix(1, 0.85, e);
    if (rimLight.current) rimLight.current.intensity = preset.rim * mix(light ? 0.7 : 1, light ? 0.2 : 0.85, e);
    if (kickerLight.current) kickerLight.current.intensity = preset.kicker * mix(1, 1.12, e);

    onFrame?.(pose, { width, height }, spinState.angle);

    // Entrada desde el póster: con la pose del póster ya aplicada, se mide la
    // silueta del modelo y se corrige el encuadre para que caiga sobre la del
    // póster. El cuadro siguiente ya se dibuja así y entonces se revela.
    if (!hasModel) return;
    // Cambio de modelo: con dos cuadros del nuevo ya dibujados (oculto),
    // vuelve a aparecer en movimiento.
    if (swapState.current === 'wait' && ++swapDrawn.current >= 2) {
      swapState.current = 'none';
      enterMoving();
      swap.current = gsap.timeline().to(gl.domElement, { opacity: 1, duration: DURATION.reveal, ease: EASE.out.gsap });
    }
    if (!matchPoster) {
      if (drawn.current < 2 && ++drawn.current === 2) onReady();
    } else if (entryState.current === 'reveal') {
      if (++drawn.current >= 2) settle();
    } else if (entryState.current === 'measure' && posterBox.current !== undefined && sneaker.current) {
      const target = posterBox.current;
      // Camino normal: primer cuadro ya con la pose de partida de la entrada.
      if (!target && !reducedMotion) {
        const base = POSES[host](width, height);
        Object.assign(pose, base, { k: base.k * ENTER.k });
        const sign = entry?.foot === 'right' ? 1 : -1;
        Object.assign(entryMotion.current, { yaw: sign * ENTER.turn, sway: 0 });
        drawn.current = 0;
        entryState.current = 'reveal';
        return;
      }
      const box = target ? modelBox(sneaker.current, camera, width, height) : null;
      const fit = box && target ? fitBox(box, target, { x: pose.ax, y: pose.ay }) : null;
      if (fit) Object.assign(pose, { k: pose.k * fit.scale, ax: pose.ax + fit.dx, ay: pose.ay + fit.dy });
      // Sin póster que calzar: el lienzo entra con un fundido y su pose propia.
      else {
        Object.assign(pose, POSES[host](width, height));
        entryMotion.current.yaw = 0;
      }
      drawn.current = 0;
      entryState.current = 'reveal';
    }
  });

  return (
    <>
      <directionalLight ref={keyLight} position={[0.6, 1.2, 1]} />
      <directionalLight ref={fillLight} position={[-1, 0.3, 0.8]} />
      <directionalLight ref={rimLight} position={[-0.8, 0.6, -1.2]} color={rimColor} />
      <directionalLight ref={kickerLight} position={[0.9, 1, -1]} />
      <group ref={sneaker} rotation-order="YXZ">
        <group ref={swapper}>{entry && <primitive object={entry.object} position={[0, -entry.height / 2, 0]} />}</group>
      </group>
      <group ref={shadow} position={[0, FLOOR_Y + 0.0005, 0]}>
        <Shadow scale={[0.42, 0.2, 1]} rotation-x={-Math.PI / 2} color="black" colorStop={0} opacity={LIGHT_PRESETS[theme].shadow} fog={false} />
      </group>
      {request && !entries.has(request.url) && failed !== request.url && (
        <LoadBoundary key={request.url} onError={() => setFailed(request.url)}>
          <Suspense fallback={null}>
            <ModelLoader request={request} onLoad={onLoad} />
          </Suspense>
        </LoadBoundary>
      )}
    </>
  );
}
