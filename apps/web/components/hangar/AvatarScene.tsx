'use client';

import { Shadow, useAnimations, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, type ReactNode, type RefObject, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AnimationAction,
  type AnimationMixer,
  AxesHelper,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Group,
  Group as GroupObject,
  type InterleavedBufferAttribute,
  type Material,
  MathUtils,
  Matrix4,
  type Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  type Object3D,
  type PerspectiveCamera,
  type SkinnedMesh,
  Vector3,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { StudioEnvironment } from '@/components/three/kit/StudioEnvironment';
import { LIGHT_PRESETS } from '@/components/three/kit/StudioLights';
import { type Spin, stepSpin } from '@/components/home/board/rig';
import { AVATAR_LITE_URL, AVATAR_URL, type Clip, CROSSFADE, FOOT_BONES, TURN_SECONDS, WALK_SPEED } from '@/lib/avatar/avatar';
import { type Fitting, resolveFit } from '@/lib/avatar/fitting';
import { CATALOG_FIT } from '@/lib/avatar/catalog-fit';
import { OUTFIT_RULES, type OutfitLook } from '@/lib/avatar/outfit';
import { gsap } from '@/lib/motion/gsap';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { type Theme, useThemeStore } from '@/lib/theme';
import { AvatarCatalog, type WornGarment } from './AvatarCatalog';
import { AvatarOutfit } from './AvatarOutfit';
import { BodyMask } from './body-mask';
import { addLegCut, heightOnShin, LEG_CUT, legFrames, makeBodyCuttable } from './leg-cut';
import { CAP_ROUND, LegCaps } from './LegCaps';
import { type AvatarView, FOV, type StagePose, TAN_HALF, VIEWS } from './rig';
import { WalkBelt } from './WalkBelt';

// Escena 3D del Hangar 360°: el avatar de Mixamo con el sneaker elegido en
// los dos pies (docs/avatar-fitting.md), en presentación de zapato flotante:
// la pierna termina en la canilla y el par queda entero a la vista (sección 11). Un solo canvas, que dibuja solo
// cuando el director de render lo elige (frameloop "never" fuera de vista).
// Lo que cambia por cuadro (giro, cámara, sombras) vive en refs y se escribe
// en useFrame; React solo se entera de cambios discretos (modelo listo).

export type Foot = 'left' | 'right';
export type AvatarStatus = 'loading' | 'idle' | 'error';
export type OutfitStatus = 'loading' | 'ready' | 'error';

// Vestuario: GLB de las prendas (según el modo liviano) y lo que lleva puesto.
export interface AvatarOutfitSpec {
  url: string;
  look: OutfitLook;
}

export interface AvatarShoe {
  slug: string;
  url: string;
  foot: Foot;
}

// Control de reproducción de la herramienta de calibración: pausa, tiempo
// fijo del clip (s) y velocidad. Vive en un ref (se lee por cuadro).
export interface AvatarPlayback {
  paused: boolean;
  time: number;
  speed: number;
}

export interface AvatarSceneProps {
  active: boolean;
  lite: boolean;
  reducedMotion: boolean;
  shoe: AvatarShoe | null;
  clip: Clip;
  fitting: Fitting;
  view: AvatarView;
  spin: RefObject<Spin>;
  // Giro automático de la plataforma (nunca con movimiento reducido).
  autoRotate: boolean;
  playback?: RefObject<AvatarPlayback>;
  // Sin vestuario (null), el maniquí va sin ropa.
  outfit?: AvatarOutfitSpec | null;
  onOutfitStatus?(status: OutfitStatus): void;
  // Prendas del catálogo pedidas y aviso de las que ya están a la vista (slugs).
  wear?: WornGarment[];
  onWear?(slugs: string[]): void;
  // Ayudas de calibración: plano del piso y ejes del zapato.
  debug?: { grid: boolean; axes: boolean };
  onReady(): void;
  onStatus?(status: AvatarStatus): void;
  // Pose de cámara y giro de cada cuadro (anillos y lectura de giro).
  onFrame?(pose: StagePose, size: { width: number; height: number }, angle: number): void;
}

export default function AvatarScene(props: AvatarSceneProps) {
  return (
    <Canvas
      dpr={props.lite ? 1 : [1, 1.5]}
      frameloop={props.active ? 'always' : 'never'}
      camera={{ fov: FOV, near: 0.05, far: 40, position: [0, 1, 6] }}
      gl={{ antialias: !props.lite, alpha: true, toneMapping: NeutralToneMapping, powerPreference: 'high-performance' }}
      style={{ pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <StudioEnvironment />
      <AvatarLights />
      {/* Si el avatar no carga (por ejemplo, falta la copia local), la página lo avisa. */}
      <LoadBoundary onError={() => props.onStatus?.('error')}>
        <Suspense fallback={null}>
          <Rig {...props} />
        </Suspense>
      </LoadBoundary>
    </Canvas>
  );
}

// Color desde los tokens (nunca un hex en el componente).
const tokenColor = (name: string) => new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'gray');

// Luces del estudio (mismas posiciones y presets por tema que StudioLights),
// con el contraluz neutro: el lima de marca dejaba una mancha verde en las
// piezas redondas del maniquí (cadera y cabeza). La luz de contorno (kicker)
// sigue dibujando los bordes de los zapatos negros.
function AvatarLights() {
  const theme = useThemeStore((state) => state.theme);
  const preset = LIGHT_PRESETS[theme];
  const get = useThree((state) => state.get);
  useEffect(() => {
    const { gl, scene, invalidate } = get();
    gl.toneMappingExposure = preset.exposure;
    scene.environmentIntensity = preset.environment;
    invalidate();
  }, [get, preset]);
  return (
    <>
      <directionalLight position={[0.6, 1.2, 1]} intensity={preset.key} />
      <directionalLight position={[-1, 0.3, 0.8]} intensity={preset.fill} />
      <directionalLight position={[-0.8, 0.6, -1.2]} intensity={preset.rim * 0.6} />
      <directionalLight position={[0.9, 1, -1]} intensity={preset.kicker} />
    </>
  );
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

// ---------- Zapatos ----------

interface ShoeEntry {
  slug: string;
  foot: Foot;
  // El original va en su pie; la copia en espejo, en el otro.
  original: Object3D;
  mirrored: Object3D;
  // Puntos más bajos de la suela (espacio del zapato), para el apoyo en el piso.
  sole: Vector3[];
  // Abertura del cuello (espacio del zapato, m): altura y radio del borde, y
  // el punto más alto del zapato (lengüeta o cuello).
  collar: { height: number; radius: number; top: number } | null;
}

// Borde del cuello del zapato: los vértices más altos de la mitad de atrás
// (la abertura del tobillo), su centro en planta y el radio medio, más el
// punto más alto de todo el zapato. Se mide una vez al cargar; el corte de
// la pierna lo usa para dejar el mismo hueco sobre cualquier caña.
function collarRing(scene: Object3D): ShoeEntry['collar'] {
  scene.updateMatrixWorld(true);
  const point = new Vector3();
  const rear: Vector3[] = [];
  let highest = -Infinity;
  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
      highest = Math.max(highest, point.y);
      if (point.x > -0.13 && point.x < 0.02) rear.push(point.clone());
    }
  });
  if (!rear.length) return null;
  const top = Math.max(...rear.map((item) => item.y));
  const ring = rear.filter((item) => item.y > top - 0.012);
  const cx = ring.reduce((sum, item) => sum + item.x, 0) / ring.length;
  const cz = ring.reduce((sum, item) => sum + item.z, 0) / ring.length;
  const radius = ring.reduce((sum, item) => sum + Math.hypot(item.x - cx, item.z - cz), 0) / ring.length;
  return { height: top, radius, top: highest };
}

// Muestras de la suela: el vértice más bajo en cada franja a lo largo del
// zapato (punta en +X). Se calcula una vez al cargar.
const SOLE_BINS = 9;
function solePoints(scene: Object3D): Vector3[] {
  scene.updateMatrixWorld(true);
  const lowest: Array<Vector3 | null> = Array.from({ length: SOLE_BINS }, () => null);
  const point = new Vector3();
  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
      const bin = Math.min(SOLE_BINS - 1, Math.max(0, Math.floor(((point.x + 0.16) / 0.32) * SOLE_BINS)));
      const best = lowest[bin];
      if (!best || point.y < best.y) lowest[bin] = point.clone();
    }
  });
  return lowest.filter((item): item is Vector3 => item !== null);
}

// Copia en espejo: comparte materiales, texturas y atributos con el
// original, salvo las tangentes. Con escala negativa la bitangente del
// shader (cross(normal, tangente) * tangente.w) cambia de signo y el relieve
// del mapa de normales se invertiría: se invierte tangente.w una vez al cargar.
function mirroredCopy(scene: Object3D): Object3D {
  const copy = scene.clone(true);
  copy.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.geometry;
    const tangent = source.getAttribute('tangent') as BufferAttribute | InterleavedBufferAttribute | undefined;
    if (!tangent) return;
    const geometry = new BufferGeometry();
    geometry.setIndex(source.getIndex());
    for (const [name, attribute] of Object.entries(source.attributes)) {
      if (name !== 'tangent') geometry.setAttribute(name, attribute);
    }
    const flipped = new BufferAttribute(new Float32Array(tangent.count * 4), 4);
    for (let index = 0; index < tangent.count; index++) {
      flipped.setXYZW(index, tangent.getX(index), tangent.getY(index), tangent.getZ(index), -tangent.getW(index));
    }
    geometry.setAttribute('tangent', flipped);
    for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    geometry.boundingBox = source.boundingBox;
    geometry.boundingSphere = source.boundingSphere;
    mesh.geometry = geometry;
  });
  return copy;
}

// Carga un sneaker con la caché de drei (Meshopt incluido) y prepara las dos copias.
function ShoeLoader({ shoe, onLoad }: { shoe: AvatarShoe; onLoad(url: string, entry: ShoeEntry): void }) {
  const { scene } = useGLTF(shoe.url);
  const entry = useMemo(
    () => ({
      slug: shoe.slug,
      foot: shoe.foot,
      original: scene.clone(true),
      mirrored: mirroredCopy(scene),
      sole: solePoints(scene),
      collar: collarRing(scene),
    }),
    [scene, shoe.slug, shoe.foot],
  );
  useEffect(() => onLoad(shoe.url, entry), [onLoad, shoe.url, entry]);
  return null;
}

// ---------- Avatar ----------

// Jerarquía de cada pie (docs/avatar-fitting.md, sección 4):
// hueso > mount (inversa del reposo) > fit (calibración) > mirror > orient > zapato.
interface FootMount {
  bone: Object3D;
  mount: GroupObject;
  fit: GroupObject;
  mirror: GroupObject;
  orient: GroupObject;
  axes: AxesHelper;
}

const DEG = Math.PI / 180;
// Zapato flotante: hueco entre la tapa de la pierna y el punto más alto del
// zapato (m) y corte mínimo sobre el tobillo (m, a lo largo de la canilla).
const FLOAT_GAP = 0.04;
const MIN_CUT = 0.03;
const TAU = Math.PI * 2;
// "Girar": curva de cada vuelta (el frenado al salir depende de ella), rampa
// al retomar tras un arrastre y frenado al cambiar de clip (s).
const TURN_EASE = 'power1.inOut';
const TURN_RAMP = 0.8;
const TURN_STOP = 0.9;

// Escrituras sobre objetos de three.js (fuera de React): visibilidad y
// velocidad del mezclador de animaciones.
const setVisible = (object: Object3D, visible: boolean) => void (object.visible = visible);
const setTimeScale = (mixer: AnimationMixer, value: number) => void (mixer.timeScale = value);
// "Girar": el ángulo de la vuelta pasa a la plataforma (el giro total no cambia).
interface TurnState {
  angle: number;
  tween: gsap.core.Tween | null;
  held: boolean;
}
const handOff = (spin: Spin, turn: TurnState) => {
  spin.angle += turn.angle;
  turn.angle = 0;
};

function useMannequinMaterials(theme: Theme) {
  const materials = useMemo(
    () => ({
      body: new MeshStandardMaterial({ roughness: 0.78, metalness: 0, envMapIntensity: 0.7 }),
      joint: new MeshStandardMaterial({ roughness: 0.6, metalness: 0, envMapIntensity: 0.7 }),
    }),
    [],
  );
  // Las piernas terminan en el corte de la canilla (leg-cut.ts).
  useEffect(() => {
    addLegCut(materials.body);
    addLegCut(materials.joint);
  }, [materials]);
  // Color mate por tema, leído de los tokens del CSS.
  useEffect(() => {
    materials.body.color.copy(tokenColor('--color-mannequin'));
    materials.joint.color.copy(tokenColor('--color-mannequin-joint'));
  }, [materials, theme]);
  useEffect(
    () => () => {
      materials.body.dispose();
      materials.joint.dispose();
    },
    [materials],
  );
  return materials;
}

function Rig({
  active,
  lite,
  reducedMotion,
  shoe,
  clip,
  fitting,
  view,
  spin,
  autoRotate,
  playback,
  outfit,
  onOutfitStatus,
  wear,
  onWear,
  debug,
  onReady,
  onStatus,
  onFrame,
}: AvatarSceneProps) {
  // El vestuario se pide a la par del avatar (no después).
  if (outfit) useGLTF.preload(outfit.url);
  const { scene, animations } = useGLTF(lite ? AVATAR_LITE_URL : AVATAR_URL);
  const theme = useThemeStore((state) => state.theme);
  const materials = useMannequinMaterials(theme);

  // Copia propia del avatar con su esqueleto. El reposo de cada pie se mide
  // aquí, antes de que la animación mueva los huesos.
  const avatar = useMemo(() => {
    const root = cloneSkinned(scene);
    root.updateMatrixWorld(true);
    const rest = (side: Foot) => {
      const bone = root.getObjectByName(FOOT_BONES[side]);
      if (!bone) throw new Error(`Avatar sin hueso ${FOOT_BONES[side]}`);
      return { bone, inverse: new Matrix4().copy(bone.matrixWorld).invert() };
    };
    // Reposo de todos los huesos: el vestuario lo usa para saber qué parte
    // del cuerpo queda bajo la ropa.
    const bones = new Map<string, Matrix4>();
    root.traverse((object) => {
      if ((object as Object3D & { isBone?: boolean }).isBone) bones.set(object.name, object.matrixWorld.clone());
    });
    return { root, left: rest('left'), right: rest('right'), bones };
  }, [scene]);

  // Cuerpo bajo la ropa: se recorta lo que cubren las prendas puestas (base
  // y catálogo). Se crea antes de colgar ropa (solo toma el cuerpo).
  // Ejes de las canillas en reposo: el cuerpo, las medias y los pantalones
  // se cortan a la misma altura sobre el tobillo.
  const frames = useMemo(() => legFrames(avatar.bones), [avatar]);
  const catalogRest = useMemo(() => ({ bones: avatar.bones, frames }), [avatar, frames]);
  const mask = useMemo(() => {
    const created = new BodyMask(avatar.root, avatar.bones, OUTFIT_RULES.hideInset, new Vector3(...OUTFIT_RULES.forward));
    makeBodyCuttable(created, frames);
    return created;
  }, [avatar, frames]);
  useEffect(() => {
    mask.mount();
    return () => mask.unmount();
  }, [mask]);

  // Prendas del catálogo a la vista: ocultan su pieza del vestuario base.
  const [shownWear, setShownWear] = useState<Partial<Record<string, string>>>({});
  const onShown = useMemo(
    () => (shown: Partial<Record<string, string>>) => {
      setShownWear(shown);
      onWear?.(Object.values(shown).filter((slug): slug is string => !!slug));
    },
    [onWear],
  );
  const baseLook = outfit?.look;
  const look = useMemo(() => {
    if (!baseLook) return null;
    const garments = { ...baseLook.garments };
    const accessories = { ...baseLook.accessories };
    for (const slug of Object.values(shownWear)) {
      for (const piece of (slug && CATALOG_FIT[slug]?.hides) || []) {
        if (piece === 'cap' || piece === 'glasses') accessories[piece] = false;
        else garments[piece] = false;
      }
    }
    return { ...baseLook, garments, accessories };
  }, [baseLook, shownWear]);

  // Material mate del maniquí (en vez del rojo de Mixamo). Las mallas con
  // esqueleto no se recortan por cámara: su caja es la del reposo.
  useEffect(() => {
    avatar.root.traverse((object) => {
      const mesh = object as SkinnedMesh;
      // La ropa trae sus propios materiales (y puede montarse antes que esto).
      if (!mesh.isMesh || mesh.userData.outfit) return;
      const name = (mesh.material as Material).name ?? '';
      mesh.material = /joint/i.test(name) || /joint/i.test(mesh.name) ? materials.joint : materials.body;
      mesh.frustumCulled = false;
    });
  }, [avatar, materials]);

  // Grupos de cada pie. Se crean una vez por avatar y se cuelgan del hueso
  // en un efecto (y se descuelgan al desmontar).
  const mounts = useMemo<Record<Foot, FootMount>>(() => {
    const make = (side: Foot): FootMount => {
      const { bone, inverse } = avatar[side];
      const mount = new GroupObject();
      mount.matrixAutoUpdate = false;
      mount.matrix.copy(inverse);
      const fit = new GroupObject();
      const mirror = new GroupObject();
      const orient = new GroupObject();
      // La punta del zapato pasa de +X a +Z (hacia donde mira el avatar).
      orient.rotation.y = -Math.PI / 2;
      const axes = new AxesHelper(0.12);
      axes.visible = false;
      mount.add(fit);
      fit.add(mirror, axes);
      mirror.add(orient);
      return { bone, mount, fit, mirror, orient, axes };
    };
    return { left: make('left'), right: make('right') };
  }, [avatar]);
  useEffect(() => {
    for (const side of ['left', 'right'] as const) mounts[side].bone.add(mounts[side].mount);
    return () => {
      for (const side of ['left', 'right'] as const) {
        mounts[side].bone.remove(mounts[side].mount);
        mounts[side].axes.dispose();
      }
    };
  }, [mounts]);

  // ---------- Animación ----------
  const animated = useRef<Group>(null);
  const { actions, mixer } = useAnimations(animations, animated);
  const current = useRef<AnimationAction | null>(null);
  useEffect(() => {
    // "Girar" es un giro procedural sobre el reposo (ver más abajo).
    const next = actions[clip === 'turn' ? 'idle' : clip];
    if (!next) return;
    const previous = current.current;
    // En modo estricto el efecto de limpieza detiene todo y este vuelve a
    // correr: si la acción ya no corre, se arranca de nuevo.
    if (previous === next && next.isRunning()) return;
    // Caminar más tranquilo: la velocidad va en la acción (no en el
    // mezclador), así los cruces duran lo mismo en ambos sentidos.
    next.reset().setEffectiveTimeScale(clip === 'walk' ? WALK_SPEED : 1).setEffectiveWeight(1).play();
    // Cruce suave entre clips; con movimiento reducido o en pausa, cambio directo.
    if (previous && previous !== next && !reducedMotion && !playback?.current.paused) next.crossFadeFrom(previous, CROSSFADE, false);
    else if (previous !== next) previous?.stop();
    current.current = next;
  }, [actions, clip, reducedMotion, playback]);
  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  // ---------- Sneakers ----------
  const [entries, setEntries] = useState(() => new Map<string, ShoeEntry>());
  const [failed, setFailed] = useState<string | null>(null);
  const onLoad = useMemo(
    () => (url: string, entry: ShoeEntry) =>
      setEntries((map) => {
        if (map.get(url) === entry) return map;
        const next = new Map(map);
        next.set(url, entry);
        return next;
      }),
    [],
  );
  // Se muestra el último pedido ya cargado; mientras llega el nuevo, el par
  // anterior sigue puesto.
  const [shownUrl, setShownUrl] = useState<string | null>(null);
  const requestUrl = shoe?.url ?? null;
  if (requestUrl && entries.has(requestUrl) && shownUrl !== requestUrl) setShownUrl(requestUrl);
  const entry = shownUrl ? entries.get(shownUrl) : undefined;

  useEffect(() => {
    if (!entry) return;
    const own = mounts[entry.foot];
    const other = mounts[entry.foot === 'right' ? 'left' : 'right'];
    own.mirror.scale.set(1, 1, 1);
    other.mirror.scale.set(-1, 1, 1);
    own.orient.add(entry.original);
    other.orient.add(entry.mirrored);
    return () => {
      own.orient.remove(entry.original);
      other.orient.remove(entry.mirrored);
    };
  }, [mounts, entry]);

  // Calibración: global más el ajuste del modelo. El avatar sube lo que
  // indique `lift` y el zapato baja lo mismo (la suela sigue en el piso).
  const lifted = useRef<Group>(null);
  const liftBase = useRef(0);
  // Apoyo en el piso (m): corrige la altura del avatar para que el punto más
  // bajo de los zapatos toque y = 0. Evita que la punta rígida se hunda al
  // caminar y que las suelas floten en el giro.
  const ground = useRef(0);
  const slug = entry?.slug ?? null;
  useEffect(() => {
    const resolved = resolveFit(fitting, slug);
    for (const side of ['left', 'right'] as const) {
      const fit = resolved[side];
      const group = mounts[side].fit;
      group.position.set(...fit.position);
      group.rotation.set(fit.rotation[0] * DEG, fit.rotation[1] * DEG, fit.rotation[2] * DEG);
      group.scale.setScalar(fit.scale);
      setVisible(mounts[side].axes, !!debug?.axes);
    }
    liftBase.current = resolved.lift;
    lifted.current?.position.set(0, resolved.lift + ground.current, 0);
  }, [mounts, fitting, slug, debug?.axes]);

  // Zapato flotante: la pierna termina en la canilla con una tapa y el par
  // queda entero a la vista, con un hueco parejo sobre el punto más alto del
  // zapato (cuello o lengüeta) en el espacio del avatar en reposo, con la
  // calibración del pie derecho. Así una caña alta y una baja muestran el
  // mismo hueco; el corte nunca baja del tobillo (MIN_CUT).
  const cut = useMemo(() => {
    if (!entry?.collar) return null;
    const fit = resolveFit(fitting, entry.slug).right;
    const top = fit.position[1] + Math.max(entry.collar.top, entry.collar.height) * fit.scale;
    return Math.max(MIN_CUT, heightOnShin(frames, top + FLOAT_GAP + CAP_ROUND));
  }, [entry, fitting, frames]);
  useEffect(() => {
    if (cut !== null) LEG_CUT.value = cut;
  }, [cut]);

  // Herramienta de calibración: mide, en el cuadro actual, la suela de cada
  // zapato (y mínima del mundo, m) y la altura del tobillo sobre ella.
  // Solo se publica con las ayudas de calibración activas (página /hangar/dev).
  const withDebug = !!debug;
  useEffect(() => {
    if (!withDebug) return;
    const box = new Box3();
    const ankle = new Vector3();
    const measure = () =>
      Object.fromEntries(
        (['left', 'right'] as const).map((side) => {
          box.setFromObject(mounts[side].orient, true);
          mounts[side].bone.getWorldPosition(ankle);
          return [side, { soleY: box.min.y, topY: box.max.y, ankleY: ankle.y, ankleZ: ankle.z, minZ: box.min.z, maxZ: box.max.z }];
        }),
      );
    const target = window as unknown as { __avatarFit?: { measure(): unknown } };
    target.__avatarFit = { measure };
    return () => void delete target.__avatarFit;
  }, [withDebug, mounts]);

  // Compila los materiales nuevos antes de mostrarlos.
  const get = useThree((state) => state.get);
  useEffect(() => {
    if (!entry) return;
    const { gl, scene: root, camera } = get();
    gl.compile(root, camera);
  }, [entry, mounts, get]);

  // Estado de carga visible en la página.
  const status: AvatarStatus = requestUrl && failed === requestUrl ? 'error' : requestUrl && shownUrl !== requestUrl ? 'loading' : 'idle';
  useEffect(() => onStatus?.(status), [onStatus, status]);

  // ---------- Cámara ----------
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const wide = clip === 'walk';
  const pose = useRef<StagePose>(VIEWS[view](size.width || 1, size.height || 1, wide));
  const shownView = useRef(`${view}:${wide}`);
  useEffect(() => {
    if (!size.width || !size.height) return;
    const target = VIEWS[view](size.width, size.height, wide);
    const key = `${view}:${wide}`;
    if (shownView.current === key) {
      if (!gsap.isTweening(pose.current)) Object.assign(pose.current, target);
      return;
    }
    shownView.current = key;
    gsap.killTweensOf(pose.current);
    // Cambio de vista por tiempo (nunca por scroll); con movimiento reducido, directo.
    if (reducedMotion) Object.assign(pose.current, target);
    else gsap.to(pose.current, { ...target, duration: DURATION.cinematic * 0.7, ease: EASE.inOut.gsap });
  }, [view, wide, size.width, size.height, reducedMotion]);
  useEffect(() => () => void gsap.killTweensOf(pose.current), []);

  // ---------- Girar ----------
  // Una vuelta completa de 360° por ciclo, con entrada y salida suaves (GSAP
  // sobre un ref, nunca estado de React). Se repite mientras "Girar" está
  // elegido y se pausa fuera de vista; con movimiento reducido no gira. Al
  // salir, frena con la velocidad que llevaba y el ángulo pasa a la
  // plataforma, así no salta. El giro total es plataforma + vuelta: el
  // arrastre mueve la plataforma y la vuelta sigue desde ahí al soltar.
  // La plataforma no gira sola mientras tanto (autoRotate), sin doble giro.
  const turn = useRef<TurnState>({ angle: 0, tween: null, held: false });
  useEffect(() => {
    if (clip !== 'turn' || reducedMotion) return;
    const state = turn.current;
    const platform = spin.current;
    // Si aún frenaba de una vuelta anterior, ese giro pasa a la plataforma.
    gsap.killTweensOf(state);
    handOff(platform, state);
    state.held = false;
    const loop = gsap.to(state, { angle: TAU, duration: TURN_SECONDS, ease: TURN_EASE, repeat: -1 });
    state.tween = loop;
    return () => {
      // Velocidad actual (rad/s) de la curva power1.inOut: 4·p o 4·(1 − p) por vuelta.
      const progress = loop.progress();
      const moving = !loop.paused() && !state.held;
      const speed = moving ? ((TAU / TURN_SECONDS) * 4 * Math.min(progress, 1 - progress) * loop.timeScale()) : 0;
      loop.kill();
      gsap.killTweensOf(loop);
      state.tween = null;
      handOff(platform, state);
      if (speed < 0.05) return;
      // Frenado: power2.out arranca a 2·d/t, así que d = v·t/2 empalma la velocidad.
      gsap.to(state, {
        angle: (speed * TURN_STOP) / 2,
        duration: TURN_STOP,
        ease: 'power2.out',
        onComplete: () => handOff(platform, state),
      });
    };
  }, [clip, reducedMotion, spin]);
  useEffect(() => {
    const tween = turn.current.tween;
    if (!tween) return;
    if (active && !turn.current.held) tween.resume();
    else tween.pause();
  }, [active, clip]);
  useEffect(() => {
    const state = turn.current;
    return () => void gsap.killTweensOf(state);
  }, []);

  // ---------- Por cuadro ----------
  const turntable = useRef<Group>(null);
  const shadows = useRef<{ body: Group | null; left: Group | null; right: Group | null }>({ body: null, left: null, right: null });
  const scratch = useMemo(() => new Vector3(), []);
  const drawn = useRef(0);
  // Vestuario: el avatar entra ya vestido (o sin ropa si el GLB no carga).
  const outfitUrl = outfit?.url ?? null;
  const [outfitSettled, setOutfitSettled] = useState<string | null>(null);
  const onOutfitReady = useMemo(
    () => () => {
      setOutfitSettled(outfitUrl);
      onOutfitStatus?.('ready');
    },
    [outfitUrl, onOutfitStatus],
  );
  const onOutfitError = useMemo(
    () => () => {
      setOutfitSettled(outfitUrl);
      onOutfitStatus?.('error');
    },
    [outfitUrl, onOutfitStatus],
  );
  const ready = (!requestUrl || !!entry) && (!outfitUrl || outfitSettled === outfitUrl);
  // La tapa se vuelve a medir cuando cambia la ropa que llega a la canilla.
  const capsVersion = `${look?.garments.pants}:${look?.garments.socks}:${shownWear.bottom ?? ''}:${outfitSettled ?? ''}`;

  useFrame((state, delta) => {
    const width = state.size.width;
    const height = state.size.height;
    if (!width || !height) return;
    const dt = Math.min(0.05, delta || 0.016);
    const cam = pose.current;

    // Cámara: orbita el punto (0, target, 0); la lente lo ubica en (ax, ay).
    const focal = height / 2 / TAN_HALF;
    const distance = focal / cam.k;
    const elevation = cam.elevation * DEG;
    camera.position.set(0, cam.target + distance * Math.sin(elevation), distance * Math.cos(elevation));
    camera.setViewOffset(width, height, width / 2 - cam.ax, height / 2 - cam.ay, width, height);
    camera.lookAt(0, cam.target, 0);

    // Plataforma: arrastre con inercia y, si toca, giro automático.
    const spinState = spin.current;
    stepSpin(spinState, autoRotate ? 'hangar' : 'board', dt, reducedMotion);

    // Giro procedural: el tween corre en el ticker de GSAP. Mientras se
    // arrastra (o justo después), se pausa; al soltar, retoma con una rampa.
    const turnState = turn.current;
    const turnTween = turnState.tween;
    if (turnTween) {
      const held = spinState.dragging || !!spinState.keyTween?.isActive() || performance.now() / 1000 < spinState.resumeAt;
      if (held && !turnState.held) {
        turnState.held = true;
        gsap.killTweensOf(turnTween);
        turnTween.pause();
      } else if (!held && turnState.held) {
        turnState.held = false;
        turnTween.timeScale(0).resume();
        gsap.to(turnTween, { timeScale: 1, duration: TURN_RAMP, ease: 'power1.in' });
      }
    }
    const yaw = spinState.angle + turnState.angle;
    if (turntable.current) turntable.current.rotation.y = yaw;

    // Reproducción: con movimiento reducido el clip queda en su primer
    // cuadro; en pausa (calibración), en el tiempo pedido.
    const control = playback?.current;
    const action = current.current;
    if (reducedMotion) {
      setTimeScale(mixer, 0);
      if (action) action.time = 0;
    } else if (control?.paused) {
      setTimeScale(mixer, 0);
      if (action) action.time = Math.min(control.time, action.getClip().duration);
    } else setTimeScale(mixer, control?.speed ?? 1);

    // Apoyo en el piso: el punto más bajo de los dos zapatos queda en y = 0.
    // Las matrices del pie se refrescan aquí (la animación ya avanzó en este
    // cuadro) y la corrección se suaviza para que no tiemble.
    if (entry && lifted.current) {
      let lowest = Infinity;
      for (const side of ['left', 'right'] as const) {
        const orient = mounts[side].orient;
        orient.updateWorldMatrix(true, false);
        for (const point of entry.sole) {
          const y = scratch.copy(point).applyMatrix4(orient.matrixWorld).y;
          if (y < lowest) lowest = y;
        }
      }
      if (Number.isFinite(lowest)) {
        const target = MathUtils.clamp(ground.current - lowest, -0.03, 0.06);
        ground.current = MathUtils.damp(ground.current, target, 30, dt);
        lifted.current.position.y = liftBase.current + ground.current;
      }
    }

    // Sombras de contacto: una bajo cada zapato, que se apaga si el pie se levanta.
    const preset = LIGHT_PRESETS[theme];
    if (turntable.current) {
      for (const side of ['left', 'right'] as const) {
        const blob = shadows.current[side];
        if (!blob) continue;
        mounts[side].fit.getWorldPosition(scratch);
        const lift = Math.max(0, scratch.y);
        turntable.current.worldToLocal(scratch);
        blob.position.set(scratch.x, 0.001, scratch.z);
        const material = (blob.children[0] as unknown as { material?: { opacity: number } })?.material;
        if (material) material.opacity = preset.shadow * 0.8 * Math.max(0, 1 - lift * 9) * (entry ? 1 : 0);
      }
    }

    // La sombra del cuerpo solo en la vista entera: en el primer plano de los
    // zapatos llenaría el cuadro y marcaría el borde del lienzo.
    const body = shadows.current.body?.children[0] as unknown as { material?: { opacity: number } } | undefined;
    if (body?.material) body.material.opacity = preset.shadow * 0.5 * MathUtils.clamp((cam.target - 0.08) / 0.82, 0, 1);

    onFrame?.(cam, { width, height }, yaw);

    // Listo: dos cuadros ya dibujados con el avatar y el par (shaders listos).
    if (ready && drawn.current < 2 && ++drawn.current === 2) onReady();
  });

  return (
    <>
      <group ref={turntable}>
        <group ref={lifted}>
          <group ref={animated}>
            <primitive object={avatar.root} />
          </group>
        </group>
        <group ref={(node) => void (shadows.current.body = node)} position={[0, 0.0005, 0]}>
          <Shadow scale={[0.9, 0.9, 1]} rotation-x={-Math.PI / 2} color="black" colorStop={0} opacity={LIGHT_PRESETS[theme].shadow * 0.5} fog={false} />
        </group>
        <group ref={(node) => void (shadows.current.left = node)}>
          <Shadow scale={[0.16, 0.34, 1]} rotation-x={-Math.PI / 2} color="black" colorStop={0} opacity={0} fog={false} />
        </group>
        <group ref={(node) => void (shadows.current.right = node)}>
          <Shadow scale={[0.16, 0.34, 1]} rotation-x={-Math.PI / 2} color="black" colorStop={0} opacity={0} fog={false} />
        </group>
        {/* Cinta al caminar: el pie apoyado no patina sobre la plataforma quieta. */}
        <WalkBelt walk={actions.walk ?? null} mixer={mixer} reducedMotion={reducedMotion} />
        {debug?.grid && <FloorGrid />}
      </group>
      {outfit && (
        <LoadBoundary key={outfit.url} onError={onOutfitError}>
          <Suspense fallback={null}>
            <AvatarOutfit
              url={outfit.url}
              look={look ?? outfit.look}
              avatar={avatar.root}
              rest={avatar.bones}
              mask={mask}
              frames={frames}
              lite={lite}
              reducedMotion={reducedMotion}
              onReady={onOutfitReady}
            />
          </Suspense>
        </LoadBoundary>
      )}
      {wear && <AvatarCatalog wear={wear} avatar={avatar.root} mask={mask} rest={catalogRest} onShown={onShown} />}
      {cut !== null && <LegCaps avatar={avatar.root} frames={frames} height={cut} bodyMaterial={materials.joint} version={capsVersion} />}
      {shoe && !entries.has(shoe.url) && failed !== shoe.url && (
        <LoadBoundary key={shoe.url} onError={() => setFailed(shoe.url)}>
          <Suspense fallback={null}>
            <ShoeLoader shoe={shoe} onLoad={onLoad} />
          </Suspense>
        </LoadBoundary>
      )}
    </>
  );
}

// Plano del piso (y = 0) para calibrar, con el color de tinta del tema.
function FloorGrid() {
  const theme = useThemeStore((state) => state.theme);
  const colors = useMemo(() => {
    void theme;
    return { center: tokenColor('--color-primary'), lines: tokenColor('--color-text-faint') };
  }, [theme]);
  return <gridHelper args={[1.2, 24, colors.center, colors.lines]} position={[0, 0.0002, 0]} />;
}
