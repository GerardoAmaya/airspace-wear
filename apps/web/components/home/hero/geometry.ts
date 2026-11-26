import type { Hotspot } from '@airspace/contracts';

// Geometría de la portada, portada de design/prototype/sections/flight/flight.js.
// Matemática pura (sin three.js): calcula las poses con nombre (zapato +
// cámara) para el tamaño actual y proyecta puntos a píxeles para medir la
// retícula, el titular y el área de arrastre. Se usa solo al refrescar,
// nunca por cuadro.

export type Vec3 = readonly [number, number, number];

export const FOV = 28;
const TAN_HALF = Math.tan((FOV * Math.PI) / 360);
export const MOBILE_QUERY = '(max-width: 860px), (max-aspect-ratio: 9/10)';

// Medidas del zapato en la pose canónica (metros). La escena mide las reales
// al cargar el modelo; estas sirven mientras tanto (Jordan 4).
export interface ShoeDims {
  length: number;
  height: number;
  halfWidth: number;
}
export const DEFAULT_SHOE: ShoeDims = { length: 0.3, height: 0.174, halfWidth: 0.056 };

// Orientación: el lado externo a la cámara (+Z). Un zapato izquierdo (lado
// externo hacia -Z) se gira media vuelta, y el signo del giro que acerca la
// punta a la cámara cambia con él.
export interface Orientation {
  baseYaw: number;
  yawSign: number;
}
export const orientationFor = (lateralSideFacing: string): Orientation =>
  lateralSideFacing === '-z' ? { baseYaw: Math.PI, yawSign: 1 } : { baseYaw: 0, yawSign: -1 };

export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  bank: number;
  scale: number;
  idle: number;
  rim: number;
  shadow: number;
  cx: number;
  cy: number;
  cz: number;
  tx: number;
  ty: number;
  tz: number;
}

export interface Layout {
  width: number;
  height: number;
  aspect: number;
  mobile: boolean;
  // Escritorio: columna libre (px) entre el texto de la izquierda y los datos
  // de la derecha. Ahí espera el zapato mientras portada y detalles se cruzan.
  free?: { from: number; to: number } | null;
}

// Portada en móvil: alto de la caja de la retícula respecto del largo del
// zapato, alto máximo (fracción de la pantalla) y borde superior en píxeles
// (debajo del encabezado).
const MOBILE_HERO = { boxRatio: 0.885, maxShare: 0.35, top: 96 };

const viewHeight = (distance: number) => 2 * distance * TAN_HALF;
const fitWidth = (length: number, fraction: number, aspect: number) => length / (fraction * 2 * TAN_HALF * aspect);
const fitHeight = (length: number, fraction: number) => length / (fraction * 2 * TAN_HALF);

// Punto del modelo (pose canónica) a coordenadas de mundo para una pose.
// Mismo orden que three.js con Euler XYZ (rotation.set(bank, yaw, pitch)):
// primero cabeceo, luego rumbo, luego alabeo. El modelo está centrado en alto.
export function worldPoint([px, py, pz]: Vec3, pose: Pose, shoe: ShoeDims): Vec3 {
  const s = pose.scale;
  let x = px * s;
  let y = (py - shoe.height / 2) * s;
  let z = pz * s;
  let c = Math.cos(pose.pitch);
  let n = Math.sin(pose.pitch);
  [x, y] = [x * c - y * n, x * n + y * c];
  c = Math.cos(pose.yaw);
  n = Math.sin(pose.yaw);
  [x, z] = [x * c + z * n, -x * n + z * c];
  c = Math.cos(pose.bank);
  n = Math.sin(pose.bank);
  [y, z] = [y * c - z * n, y * n + z * c];
  return [x + pose.x, y + pose.y, z + pose.z];
}

export function computePoses(layout: Layout, shoe: ShoeDims, orientation: Orientation, hotspots: Hotspot[]): Record<string, Pose> {
  const { aspect, mobile } = layout;
  const absoluteYaw = (relative = 0) => orientation.baseYaw + orientation.yawSign * relative;
  type ShoePose = Omit<Pose, 'cx' | 'cy' | 'cz' | 'tx' | 'ty' | 'tz'>;
  const base = (values: Partial<ShoePose> = {}): ShoePose => ({
    x: 0,
    y: 0,
    z: 0,
    pitch: 0,
    bank: 0,
    scale: 1,
    idle: 0,
    rim: 1,
    shadow: 1,
    ...values,
    yaw: absoluteYaw(values.yaw),
  });
  const aim = (pose: ShoePose, [tx, ty, tz]: Vec3, distance: number, elevation: number): Pose => ({
    ...pose,
    tx,
    ty,
    tz,
    cx: tx,
    cy: ty + elevation * distance,
    cz: tz + distance,
  });
  const poses: Record<string, Pose> = {};

  // Portada: el zapato a la derecha (escritorio) o arriba (móvil), con la
  // punta hacia la cámara.
  if (mobile) {
    // En móvil se ubica en píxeles: debajo del encabezado, nunca más alto que
    // un 35% de la pantalla, para que el titular quede siempre debajo.
    const fraction = Math.min(0.8, (MOBILE_HERO.maxShare * layout.height) / (MOBILE_HERO.boxRatio * layout.width));
    const distance = fitWidth(shoe.length, fraction, aspect);
    const boxHeight = MOBILE_HERO.boxRatio * fraction * layout.width;
    const centerY = MOBILE_HERO.top + boxHeight / 2;
    const ty = (centerY / layout.height - 0.5) * viewHeight(distance);
    poses.hero = aim(base({ y: 0.012, yaw: 0.42, pitch: 0.08, bank: 0.06, idle: 1 }), [0, ty, 0], distance, 0.07);
  } else {
    const distance = Math.max(fitWidth(shoe.length, 0.38, aspect), fitHeight(shoe.height, 0.42));
    const x = 0.2 * viewHeight(distance) * aspect;
    poses.hero = aim(base({ x, y: 0.012, yaw: 0.5, pitch: 0.09, bank: 0.06, idle: 1 }), [0, -0.01, 0], distance, 0.07);
  }

  // Perfil: referencia de encuadre para los planos de cada detalle. En móvil
  // el zapato sube para dejar sitio a la tarjeta.
  const profileDistance = mobile ? fitWidth(shoe.length, 0.8, aspect) : Math.max(fitWidth(shoe.length, 0.38, aspect), fitHeight(shoe.height, 0.36));
  const profileLift = mobile ? 0.11 : 0.02;

  // Un plano por detalle: el encuadre se acerca al punto según focus y corre
  // el zapato según shift para dejar aire a la etiqueta. La variante "b" es
  // la deriva lenta mientras se lee.
  hotspots.forEach((spot, index) => {
    const { view } = spot;
    const pose = base({ ...view.pose, yaw: mobile ? view.mobile.yaw : view.pose.yaw, rim: view.pose.rim ?? 1, shadow: view.pose.shadow ?? 1 });
    const zoom = mobile ? view.mobile.zoom : view.camera.zoom;
    const focus = mobile ? 0.2 : view.camera.focus;
    const shift = mobile ? 0 : view.camera.shift;
    const distance = profileDistance / zoom;
    const height = viewHeight(distance);
    const [hx, hy, hz] = worldPoint(spot.position, { ...pose, cx: 0, cy: 0, cz: 0, tx: 0, ty: 0, tz: 0 }, shoe);
    const target: Vec3 = [
      pose.x + (hx - pose.x) * focus - shift * height * aspect,
      pose.y + (hy - pose.y) * focus - profileLift * height,
      pose.z + (hz - pose.z) * focus,
    ];
    poses[`spot${index}`] = aim(pose, target, distance, view.camera.elev);
    poses[`spot${index}b`] = aim({ ...pose, yaw: pose.yaw + orientation.yawSign * 0.06 }, target, distance * 0.965, view.camera.elev);
  });

  // Tránsito (escritorio, como el prototipo): mientras la portada y los
  // detalles se cruzan, el zapato baja con la escena fija y espera en la
  // columna libre del centro, en tres cuartos, sin quedar debajo de textos ni
  // datos. Sin columna libre, usa el primer detalle.
  if (layout.free && hotspots.length) {
    const { from, to } = layout.free;
    const lengthPx = Math.min((to - from) * 0.92, layout.width * 0.34);
    const projected = 0.32; // largo aparente del zapato en tres cuartos (metros)
    const distance = (projected * layout.width) / lengthPx / aspect / (2 * TAN_HALF);
    const height = viewHeight(distance);
    const centerX = (from + to) / 2;
    const pose = base({ yaw: 0.25, pitch: 0.03, bank: 0.08 });
    poses.transit = aim(pose, [-(centerX / layout.width - 0.5) * height * aspect, 0.004, 0], distance, 0.06);
  } else if (poses.spot0) {
    poses.transit = poses.spot0;
  }
  return poses;
}

// Proyección con una cámara de mentira (posición, objetivo y FOV de la pose).
export function projector(pose: Pose, layout: Layout): (point: Vec3) => [number, number] {
  const fx = pose.tx - pose.cx;
  const fy = pose.ty - pose.cy;
  const fz = pose.tz - pose.cz;
  const fl = Math.hypot(fx, fy, fz) || 1;
  const f = [fx / fl, fy / fl, fz / fl];
  // right = forward × up (0, 1, 0); up' = right × forward
  const rl = Math.hypot(f[2], f[0]) || 1;
  const r = [-f[2] / rl, 0, f[0] / rl];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return ([x, y, z]) => {
    const dx = x - pose.cx;
    const dy = y - pose.cy;
    const dz = z - pose.cz;
    const depth = Math.max(1e-4, dx * f[0] + dy * f[1] + dz * f[2]);
    const nx = (dx * r[0] + dy * r[1] + dz * r[2]) / (depth * TAN_HALF * layout.aspect);
    const ny = (dx * u[0] + dy * u[1] + dz * u[2]) / (depth * TAN_HALF);
    return [((nx + 1) / 2) * layout.width, ((1 - ny) / 2) * layout.height];
  };
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

// Caja del zapato en pantalla para una pose (proyecta las 8 esquinas).
export function shoeRect(pose: Pose, layout: Layout, shoe: ShoeDims): Rect {
  const project = projector(pose, layout);
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const x of [-shoe.length / 2, shoe.length / 2]) {
    for (const y of [0, shoe.height]) {
      for (const z of [-shoe.halfWidth, shoe.halfWidth]) {
        const [sx, sy] = project(worldPoint([x, y, z], pose, shoe));
        left = Math.min(left, sx);
        right = Math.max(right, sx);
        top = Math.min(top, sy);
        bottom = Math.max(bottom, sy);
      }
    }
  }
  const [centerX, centerY] = project(worldPoint([0, shoe.height / 2, 0], pose, shoe));
  return { left, top, right, bottom, centerX, centerY };
}

// Caja de la retícula de la portada: nunca toca los bordes.
export function heroBox(poses: Record<string, Pose>, layout: Layout, shoe: ShoeDims) {
  const rect = shoeRect(poses.hero, layout, shoe);
  const width = Math.min((rect.right - rect.left) * 1.12, layout.width - 40);
  const height = Math.min((rect.bottom - rect.top) * 1.3, layout.height * 0.56);
  return { width, height, centerX: rect.centerX, centerY: rect.centerY, left: rect.centerX - width / 2, bottom: rect.centerY + height / 2 };
}

// Área de arrastre para una pose: la caja del zapato con un poco de aire.
export function gripRect(pose: Pose, layout: Layout, shoe: ShoeDims) {
  const rect = shoeRect(pose, layout, shoe);
  const padX = (rect.right - rect.left) * 0.06;
  const padY = (rect.bottom - rect.top) * 0.08;
  const left = Math.max(8, rect.left - padX);
  const top = Math.max(8, rect.top - padY);
  const right = Math.min(layout.width - 8, rect.right + padX);
  const bottom = Math.min(layout.height - 8, rect.bottom + padY);
  return { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) };
}

// Pixeles por metro a un metro de distancia (para el tamaño base del halo).
export const pixelsPerMeter = (layout: Layout) => layout.height / viewHeight(1);
