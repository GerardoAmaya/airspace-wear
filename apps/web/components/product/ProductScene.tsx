'use client';

import type { Hotspot, HotspotView, Model3D } from '@airspace/contracts';
import { Shadow, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react';
import { Box3, type Group, MathUtils, NeutralToneMapping, type PerspectiveCamera, Vector3 } from 'three';
import { StudioEnvironment } from '@/components/three/kit/StudioEnvironment';
import { LIGHT_PRESETS, StudioLights } from '@/components/three/kit/StudioLights';
import { gsap } from '@/lib/motion/gsap';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { useThemeStore } from '@/lib/theme';
import { fitBox, modelBox, POSTER_POSE, posterBoxOnCanvas } from '@/lib/three/poster-match';

// Escena 3D de la ficha de producto. Todo lo que cambia por cuadro (giro,
// cámara, posición de las etiquetas) vive en refs y se escribe en useFrame;
// React solo se entera de cambios discretos (detalle activo, modelo listo).

export interface SceneControls {
  // Giro pedido por arrastre o teclado (radianes); la escena lo alcanza suave.
  dragYaw: number;
  // Momento del último gesto: el giro libre se pausa unos segundos después.
  lastInteraction: number;
}

// Vista general: tres cuartos desde el lado externo, cámara apenas elevada.
const OVERVIEW: HotspotView = {
  pose: { yaw: 0.35, pitch: 0, bank: 0 },
  camera: { zoom: 1, elev: 0.1, focus: 0, shift: 0 },
  slot: { side: 'right', y: 0.5 },
  mobile: { zoom: 1, yaw: 0.35 },
};

interface SceneProps {
  model: Model3D;
  lite: boolean;
  active: boolean;
  reducedMotion: boolean;
  hotspots: Hotspot[];
  activeKey: string | null;
  controls: RefObject<SceneControls>;
  markers: RefObject<Map<string, HTMLElement>>;
  onReady(): void;
  // Contenedor del póster de respaldo y estado compartido con el visor: si el
  // póster ya se ve (la carga tardó), el modelo entra con su pose y en su
  // lugar; decidePoster avisa que la escena ya eligió
  // cómo entrar (el póster ya no aparece) y dice si el póster se ve.
  posterRef?: RefObject<HTMLElement | null>;
  decidePoster?(): boolean;
}

// Entrada normal (sin póster): el zapato llega girando y acercándose con una
// curva de salida, ya en movimiento en el primer cuadro visible, mientras el
// lienzo aparece con un fundido (--duration-reveal).
const ENTER = { turn: 0.9, zoom: 0.9, duration: 2.4, ease: 'power3.out' };

export default function ProductScene(props: SceneProps) {
  return (
    <Canvas
      dpr={props.lite ? 1 : [1, 1.5]}
      frameloop={props.active ? 'always' : 'never'}
      camera={{ fov: 28, near: 0.01, far: 20, position: [0, 0.12, 0.9] }}
      gl={{ antialias: !props.lite, alpha: true, toneMapping: NeutralToneMapping, powerPreference: 'high-performance' }}
    >
      <StudioEnvironment />
      <StudioLights />
      <Suspense fallback={null}>
        <Rig {...props} />
      </Suspense>
    </Canvas>
  );
}

function Rig({ model, lite, reducedMotion, hotspots, activeKey, controls, markers, onReady, posterRef, decidePoster }: SceneProps) {
  const { scene } = useGLTF(lite ? model.liteUrl : model.heroUrl);
  // Copia propia de la escena: el mismo GLB puede estar en otro canvas.
  const object = useMemo(() => scene.clone(true), [scene]);
  const height = useMemo(() => {
    const box = new Box3().setFromObject(object, true);
    return box.max.y - box.min.y;
  }, [object]);

  const pivot = useRef<Group>(null);
  const shadow = useRef<Group>(null);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const get = useThree((state) => state.get);
  const size = useThree((state) => state.size);
  const theme = useThemeStore((state) => state.theme);

  // Orientación: el lado externo a la cámara (+Z). Un zapato con el lado
  // externo hacia -Z (izquierdo) se gira media vuelta; el signo del giro que
  // acerca la punta a la cámara y el del balanceo cambian con él.
  const facesMinusZ = model.lateralSideFacing === '-z';
  const baseYaw = facesMinusZ ? Math.PI : 0;
  const yawSign = facesMinusZ ? 1 : -1;
  const bankSign = facesMinusZ ? -1 : 1;

  // Estado animado (lo mueve GSAP por tiempo; useFrame lo aplica).
  // Empieza con la vista del póster (giro y elevación de su cámara); al
  // revelarse se asienta en la vista general (ver settle).
  // Un balón (sin pie) se fotografió girado al revés y con la cámara más cerca.
  const isBall = model.foot === null;
  const view = useRef({
    yaw: isBall ? -POSTER_POSE.ballYaw : POSTER_POSE.sneakerYaw,
    bank: 0,
    zoom: 1,
    elev: Math.tan(isBall ? POSTER_POSE.ballElevation : POSTER_POSE.sneakerElevation),
    focus: 0,
    shadow: 1,
  });
  // Ajuste de pantalla de la entrada (escala y desplazamiento en px) y ritmo
  // del giro libre (0 quieto, 1 normal).
  const entry = useRef({ zoom: 1, dx: 0, dy: 0, run: 0 });
  const entryState = useRef<'measure' | 'reveal' | 'settled'>('measure');
  const posterBox = useRef<Awaited<ReturnType<typeof posterBoxOnCanvas>> | undefined>(undefined);
  const drawn = useRef(0);
  const targetView = useRef(OVERVIEW);
  const withPoster = useRef(false);
  const focusPoint = useRef(new Vector3(0, height / 2, 0));
  const drag = useRef(0);
  const target = useRef(new Vector3());
  const scratch = useRef(new Vector3());

  // Materiales compilados antes de mostrar; el póster se mide en paralelo.
  useEffect(() => {
    const { gl, scene: root, camera: view } = get();
    gl.compile(root, view);
    // El modelo ya está: desde aquí el póster de respaldo no aparece.
    withPoster.current = decidePoster?.() ?? false;
    if (!withPoster.current) {
      posterBox.current = null;
      return;
    }
    void posterBoxOnCanvas(posterRef?.current ?? null, gl.domElement).then((box) => {
      posterBox.current = box;
    });
  }, [get, posterRef, decidePoster]);
  useEffect(() => () => void gsap.killTweensOf(entry.current), []);

  // Al cambiar de detalle, cámara y pose se mueven por tiempo (no por scroll).
  useEffect(() => {
    const hotspot = hotspots.find((item) => item.key === activeKey);
    const next = hotspot?.view ?? OVERVIEW;
    if (hotspot) focusPoint.current.set(...hotspot.position);
    else focusPoint.current.set(0, height / 2, 0);
    // Elegir un detalle cancela el giro manual: la vista lo muestra de frente.
    if (hotspot) controls.current.dragYaw = drag.current = 0;
    targetView.current = next;
    // Antes de revelarse, la vista queda en la del póster (settle la mueve).
    if (entryState.current !== 'settled') return;
    const tween = gsap.to(view.current, {
      yaw: next.pose.yaw,
      bank: next.pose.bank,
      zoom: next.camera.zoom,
      elev: next.camera.elev,
      focus: next.camera.focus,
      shadow: next.pose.shadow ?? 1,
      duration: reducedMotion ? 0 : DURATION.cinematic * 0.75,
      ease: EASE.inOut.gsap,
      overwrite: true,
    });
    return () => {
      tween.kill();
    };
  }, [activeKey, hotspots, height, reducedMotion, controls]);

  // Distancia base: el zapato (0.30 m) y su alto entran con aire en el cuadro.
  const baseDistance = useMemo(() => {
    const vertical = MathUtils.degToRad(28) / 2;
    const horizontal = Math.atan(Math.tan(vertical) * (size.width / Math.max(size.height, 1)));
    return Math.max((0.3 * 1.35) / 2 / Math.tan(horizontal), (height * 2.1) / 2 / Math.tan(vertical));
  }, [size.width, size.height, height]);

  const preset = LIGHT_PRESETS[theme];

  // Con póster: el póster se apaga y luego aparece el lienzo (DURATION.ui
  // cada uno); con el lienzo visible, la vista pasa a la general. Sin póster:
  // la entrada arranca ya, junto con el fundido del lienzo. Con movimiento
  // reducido la vista queda quieta.
  const settle = () => {
    entryState.current = 'settled';
    onReady();
    if (reducedMotion) return;
    const next = targetView.current;
    if (!withPoster.current) {
      gsap.to(view.current, { yaw: next.pose.yaw, zoom: next.camera.zoom, duration: ENTER.duration, ease: ENTER.ease, overwrite: true });
      gsap.to(entry.current, { run: 1, duration: DURATION.cinematic, delay: ENTER.duration * 0.6, ease: 'power2.in' });
      return;
    }
    const delay = DURATION.ui * 2;
    gsap.to(view.current, {
      yaw: next.pose.yaw,
      bank: next.pose.bank,
      zoom: next.camera.zoom,
      elev: next.camera.elev,
      focus: next.camera.focus,
      shadow: next.pose.shadow ?? 1,
      duration: DURATION.cinematic,
      delay,
      ease: EASE.inOut.gsap,
      overwrite: true,
    });
    gsap.to(entry.current, { zoom: 1, dx: 0, dy: 0, duration: DURATION.cinematic, delay, ease: EASE.inOut.gsap });
    gsap.to(entry.current, { run: 1, duration: DURATION.cinematic, delay: delay + DURATION.ui, ease: 'power2.in' });
  };

  useFrame((state, delta) => {
    const current = view.current;
    const control = controls.current;
    // Giro libre lento en la vista general, salvo con movimiento reducido o
    // justo después de un gesto.
    const idle = !activeKey && !reducedMotion && performance.now() - control.lastInteraction > 4000;
    if (idle) control.dragYaw += delta * 0.18 * entry.current.run;
    drag.current = MathUtils.damp(drag.current, control.dragYaw, 8, delta);

    const yaw = baseYaw + yawSign * current.yaw + drag.current;
    pivot.current?.rotation.set(current.bank * bankSign, yaw, 0, 'YXZ');
    if (shadow.current) {
      shadow.current.rotation.y = yaw;
      const material = (shadow.current.children[0] as unknown as { material?: { opacity: number } })?.material;
      if (material) material.opacity = preset.shadow * current.shadow * Math.max(0, 1 - Math.abs(current.bank) * 1.2);
    }

    // Cámara: mira a un punto entre el centro del zapato y el detalle activo.
    const center = scratch.current.set(0, height / 2, 0);
    const focusWorld = target.current.copy(focusPoint.current);
    object.localToWorld(focusWorld);
    focusWorld.lerpVectors(center, focusWorld, current.focus);
    const distance = baseDistance / current.zoom;
    camera.position.set(focusWorld.x, focusWorld.y + current.elev * distance, focusWorld.z + distance);
    camera.lookAt(focusWorld);
    camera.updateMatrixWorld();

    // Ajuste de pantalla de la entrada (escala y desplazamiento de la lente).
    const pose = entry.current;
    const lens = state.camera as PerspectiveCamera;
    if (pose.zoom !== 1 || pose.dx || pose.dy) {
      lens.zoom = pose.zoom;
      lens.setViewOffset(size.width, size.height, -pose.dx, -pose.dy, size.width, size.height);
    } else if (lens.view?.enabled || lens.zoom !== 1) {
      lens.zoom = 1;
      lens.clearViewOffset();
    }

    // Entrada: con la vista del póster aplicada se mide la silueta y se
    // corrige el encuadre; dos cuadros después (shaders listos) se revela.
    if (entryState.current === 'reveal') {
      if (++drawn.current >= 2) settle();
    } else if (entryState.current === 'measure' && posterBox.current !== undefined && pivot.current) {
      const target = posterBox.current;
      const box = target ? modelBox(pivot.current, camera, size.width, size.height) : null;
      const fit = box && target ? fitBox(box, target, { x: size.width / 2, y: size.height / 2 }) : null;
      const next = targetView.current;
      if (fit) Object.assign(pose, { zoom: fit.scale, dx: fit.dx, dy: fit.dy });
      // Sin póster: vista general, con el giro y la distancia de partida de
      // la entrada (con movimiento reducido, la vista general tal cual).
      else {
        withPoster.current = false;
        Object.assign(current, { yaw: next.pose.yaw, bank: next.pose.bank, elev: next.camera.elev, focus: next.camera.focus, zoom: next.camera.zoom });
        if (!reducedMotion) Object.assign(current, { yaw: next.pose.yaw + ENTER.turn, zoom: next.camera.zoom * ENTER.zoom });
      }
      drawn.current = 0;
      entryState.current = 'reveal';
    }

    // Etiquetas: cada marcador sigue su punto en pantalla (escritura directa al DOM).
    const map = markers.current;
    if (map.size) {
      for (const hotspot of hotspots) {
        const element = map.get(hotspot.key);
        if (!element) continue;
        const point = scratch.current.set(...hotspot.position);
        object.localToWorld(point);
        point.project(camera);
        const x = ((point.x + 1) / 2) * size.width;
        const y = ((1 - point.y) / 2) * size.height;
        element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
    }
  });

  return (
    <>
      <group ref={pivot} position={[0, height / 2, 0]}>
        <primitive object={object} position={[0, -height / 2, 0]} />
      </group>
      <group ref={shadow} position={[0, 0.001, 0]}>
        <Shadow scale={[0.42, 0.2, 1]} rotation-x={-Math.PI / 2} color="black" colorStop={0} opacity={preset.shadow} fog={false} />
      </group>
    </>
  );
}
