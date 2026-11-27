'use client';

import type { Hotspot, Model3D } from '@airspace/contracts';
import { Shadow, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react';
import { Box3, Color, type DirectionalLight, type Group, MathUtils, NeutralToneMapping, type PerspectiveCamera, Vector3 } from 'three';
import { StudioEnvironment } from '@/components/three/kit/StudioEnvironment';
import { LIGHT_PRESETS } from '@/components/three/kit/StudioLights';
import { FLOOR_Y, FOV, type Pose, type Spin, stepSpin, TAN_HALF } from '@/components/three/turntable/rig';
import { useThemeStore } from '@/lib/theme';
import { baseYawOf, hotspotFrames, type HotspotFrame, objectCenterY, productPose } from './turntable-geometry';

// Escena 3D de la plataforma en la ficha. Lo que cambia por cuadro (giro,
// cámara, marcadores) vive en refs y se escribe en useFrame; React solo se
// entera de cambios discretos (modelo listo, geometría medida).

// Estado de cámara que el visor anima por tiempo (GSAP): elevación en grados.
export interface TurntableView {
  elevation: number;
}

export interface TurntableGeometry {
  baseYaw: number;
  frames: HotspotFrame[];
}

interface SceneProps {
  model: Model3D;
  lite: boolean;
  active: boolean;
  reducedMotion: boolean;
  spin: RefObject<Spin>;
  view: RefObject<TurntableView>;
  hotspots: Hotspot[];
  activeKey: string | null;
  markers: RefObject<Map<string, HTMLElement>>;
  onReady(): void;
  onGeometry(geometry: TurntableGeometry): void;
  onFrame(pose: Pose, size: { width: number; height: number }, angle: number): void;
}

// Geometría de las etiquetas (igual que ProductTurntable.module.css):
// separación del punto, desfase vertical y margen con el borde del visor (px).
const LABEL = { gap: 18, top: -12, margin: 8 };

// Color de marca desde los tokens (nunca un hex en el componente).
const tokenColor = (name: string) => new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'white');

export default function ProductTurntableScene(props: SceneProps) {
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
      <Suspense fallback={null}>
        <Rig {...props} />
      </Suspense>
    </Canvas>
  );
}

function Rig({ model, lite, reducedMotion, spin, view, hotspots, activeKey, markers, onReady, onGeometry, onFrame }: SceneProps) {
  const { scene } = useGLTF(lite ? model.liteUrl : model.heroUrl);
  // Copia propia de la escena: el mismo GLB puede estar en otro canvas.
  const object = useMemo(() => scene.clone(true), [scene]);
  // Caja precisa (por vértice) en la pose canónica: alto y medio largo y
  // ancho para orientar los detalles.
  const extent = useMemo(() => {
    const box = new Box3().setFromObject(object, true);
    return {
      height: box.max.y - box.min.y,
      halfLength: Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
      halfWidth: Math.max(Math.abs(box.min.z), Math.abs(box.max.z)),
    };
  }, [object]);
  const baseYaw = baseYawOf(model);
  const frames = useMemo(() => hotspotFrames(hotspots, model, extent), [hotspots, model, extent]);
  const sides = useMemo(() => new Map(hotspots.map((hotspot) => [hotspot.key, hotspot.view.slot.side])), [hotspots]);
  useEffect(() => onGeometry({ baseYaw, frames }), [onGeometry, baseYaw, frames]);

  const turntable = useRef<Group>(null);
  const shadow = useRef<Group>(null);
  const keyLight = useRef<DirectionalLight>(null);
  const fillLight = useRef<DirectionalLight>(null);
  const rimLight = useRef<DirectionalLight>(null);
  const kickerLight = useRef<DirectionalLight>(null);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const get = useThree((state) => state.get);
  const theme = useThemeStore((state) => state.theme);
  const rimColor = useMemo(() => tokenColor('--color-primary-fill'), []);
  const drawn = useRef(0);
  const point = useRef(new Vector3());
  // Último valor escrito en cada marcador y medidas de su etiqueta (se miden
  // una vez), para tocar el DOM solo cuando cambia.
  const written = useRef(new Map<HTMLElement, { opacity: string; facing: boolean; width: number; height: number; side: string; shift: string }>());

  // Exposición e intensidad del entorno por tema (propiedades del renderizador).
  useEffect(() => {
    const { gl, scene: root, invalidate } = get();
    const preset = LIGHT_PRESETS[theme];
    gl.toneMappingExposure = preset.exposure;
    root.environmentIntensity = preset.environment;
    invalidate();
  }, [get, theme]);

  // Materiales compilados antes de mostrar.
  useEffect(() => {
    const { gl, scene: root, camera: lens } = get();
    gl.compile(root, lens);
  }, [get, object]);

  // Al cambiar de detalle o de idioma, las etiquetas se vuelven a medir.
  useEffect(() => {
    written.current.clear();
  }, [activeKey, hotspots]);

  // La etiqueta queda dentro del visor: si no cabe de su lado se pasa al
  // otro; si no cabe de ninguno (pantallas angostas) se corre hasta el borde.
  const placeLabel = (element: HTMLElement, info: { width: number; height: number; side: string; shift: string }, preferred: 'left' | 'right', x: number, y: number, size: { width: number; height: number }) => {
    const label = element.lastElementChild as HTMLElement | null;
    if (!label) return;
    if (!info.width) {
      info.width = label.offsetWidth;
      info.height = label.offsetHeight;
    }
    const room = { right: size.width - LABEL.margin - (x + LABEL.gap), left: x - LABEL.gap - LABEL.margin };
    const other = preferred === 'right' ? 'left' : 'right';
    const side = room[preferred] >= info.width || room[preferred] >= room[other] ? preferred : other;
    const dx = side === 'right' ? Math.min(0, room.right - info.width) : Math.max(0, info.width - room.left);
    const top = y + LABEL.top;
    const dy = top < LABEL.margin ? LABEL.margin - top : Math.min(0, size.height - LABEL.margin - (top + info.height));
    const shift = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    if (info.side !== side || element.dataset.side !== side) element.dataset.side = info.side = side;
    if (info.shift !== shift) label.style.transform = info.shift = shift;
  };

  useFrame((state, delta) => {
    const width = state.size.width;
    const height = state.size.height;
    if (!width || !height) return;
    const dt = Math.min(0.05, delta || 0.016);
    const spinState = spin.current;
    const pose = productPose(width, height, view.current.elevation);

    // Cámara: orbita el origen y la lente ubica el objeto en (ax, ay).
    const focal = height / 2 / TAN_HALF;
    const distance = focal / pose.k;
    const elevation = MathUtils.degToRad(pose.elevation);
    camera.position.set(0, distance * Math.sin(elevation), distance * Math.cos(elevation));
    camera.setViewOffset(width, height, width / 2 - pose.ax, height / 2 - pose.ay, width, height);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    // Giro: automático solo sin movimiento reducido (stepSpin respeta
    // arrastre, inercia y los tweens de flechas o detalles).
    stepSpin(spinState, dt, !reducedMotion);
    const yaw = baseYaw + spinState.angle;
    if (turntable.current) turntable.current.rotation.y = yaw;
    if (shadow.current) shadow.current.rotation.y = yaw;

    // Luces: el preset del tema es la base, como la plataforma de la home
    // (baja un poco la principal y sube el contorno; en claro el contraluz
    // lima casi se apaga).
    const preset = LIGHT_PRESETS[theme];
    const light = theme === 'light';
    if (keyLight.current) keyLight.current.intensity = preset.key * 0.9;
    if (fillLight.current) fillLight.current.intensity = preset.fill * 0.85;
    if (rimLight.current) rimLight.current.intensity = preset.rim * (light ? 0.2 : 0.85);
    if (kickerLight.current) kickerLight.current.intensity = preset.kicker * 1.12;

    onFrame(pose, { width, height }, spinState.angle);

    // Listo en el segundo cuadro: shaders compilados y texturas en la GPU,
    // así esa pausa ocurre con el lienzo todavía oculto.
    if (drawn.current < 2 && ++drawn.current === 2) onReady();

    // Marcadores: siguen su punto en pantalla y se ven solo cuando el
    // detalle mira a la cámara (escritura directa al DOM, solo si cambia).
    const map = markers.current;
    if (!map.size) return;
    for (const frame of frames) {
      const element = map.get(frame.key);
      if (!element) continue;
      let info = written.current.get(element);
      if (!info) {
        info = { opacity: '', facing: false, width: 0, height: 0, side: '', shift: '' };
        written.current.set(element, info);
      }
      const facing = Math.cos(frame.azimuth + yaw);
      const opacity = MathUtils.clamp((facing - 0.15) / 0.35, 0, 1).toFixed(2);
      if (opacity !== info.opacity) element.style.opacity = info.opacity = opacity;
      const isFacing = facing > 0.4;
      if (isFacing !== info.facing) {
        info.facing = isFacing;
        if (isFacing) element.dataset.facing = '';
        else delete element.dataset.facing;
      }
      if (opacity === '0.00') continue;
      const target = point.current.set(...frame.anchor);
      object.localToWorld(target);
      target.project(camera);
      const x = ((target.x + 1) / 2) * width;
      const y = ((1 - target.y) / 2) * height;
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      if (element.dataset.active !== undefined) placeLabel(element, info, sides.get(frame.key) ?? 'right', x, y, { width, height });
    }
  });

  return (
    <>
      <directionalLight ref={keyLight} position={[0.6, 1.2, 1]} />
      <directionalLight ref={fillLight} position={[-1, 0.3, 0.8]} />
      <directionalLight ref={rimLight} position={[-0.8, 0.6, -1.2]} color={rimColor} />
      <directionalLight ref={kickerLight} position={[0.9, 1, -1]} />
      <group ref={turntable} position={[0, objectCenterY(extent.height), 0]}>
        <primitive object={object} position={[0, -extent.height / 2, 0]} />
      </group>
      <group ref={shadow} position={[0, FLOOR_Y + 0.0005, 0]}>
        {/* Sombra a la medida del objeto: alargada bajo un zapato, redonda bajo un balón. */}
        <Shadow scale={[extent.halfLength * 2.8, Math.min(extent.halfWidth * 3.6, extent.halfLength * 2.8), 1]} rotation-x={-Math.PI / 2} color="black" colorStop={0} opacity={LIGHT_PRESETS[theme].shadow} fog={false} />
      </group>
    </>
  );
}
