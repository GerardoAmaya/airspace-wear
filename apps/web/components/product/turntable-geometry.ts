import type { Hotspot, Model3D } from '@airspace/contracts';
import { FLOOR_Y, type Pose, SHOE } from '@/components/three/turntable/rig';

// Geometría de la plataforma en la ficha: encuadre por tamaño del visor y
// orientación de cada detalle 3D (hotspot) sobre el eje vertical. Sin three.js
// para que el visor pueda usarla sin arrastrar el canvas.

export const ELEVATION = 15; // grados: la cámara ve un poco el empeine
// Detalles en la suela: la cámara baja casi al piso y la plataforma deja el
// lateral a tres cuartos (se ve el canto de la suela; nunca se inclina el zapato).
export const SOLE_ELEVATION = 4;
// Un detalle elegido queda a este giro (rad) del frente de la cámara: a tres
// cuartos, así el zapato se sigue leyendo (de frente la punta se aplana).
export const FACE_OFFSET = 0.4;
// Bajo esta altura (m) el detalle está en la planta de la suela.
const SOLE_HEIGHT = 0.015;

// Pose de la plataforma en el visor (4:3 en escritorio y en móvil). El zapato
// mide la mitad del ancho y los anillos (0,6 m) entran enteros: sus rótulos
// 090 y 270 no se cortan contra el borde.
export function productPose(width: number, height: number, elevation = ELEVATION): Pose {
  const k = Math.min((width * 0.5) / SHOE.length, (height * 0.42) / SHOE.height, width / 0.6);
  return { ax: width / 2, ay: height * 0.41, k, elevation };
}

// Giro base: el lado externo a tres cuartos hacia la cámara con el giro en
// 000° (la vista de reposo con movimiento reducido). Un zapato con el lado
// externo hacia -Z (izquierdo) se gira media vuelta.
export const REST_YAW = 0.42;
// Sin lado externo (un balón) se usa el mismo giro que la home.
export function baseYawOf(model: Model3D): number {
  const outerPlusZ = model.lateralSideFacing === '+z' || (model.lateralSideFacing === null && model.foot === 'right');
  return outerPlusZ ? -REST_YAW : Math.PI + REST_YAW;
}

export interface HotspotFrame {
  key: string;
  // Punto donde se dibuja el marcador (m, espacio del modelo).
  anchor: [number, number, number];
  // Dirección hacia afuera sobre el piso, como ángulo desde +Z hacia +X.
  azimuth: number;
  sole: boolean;
}

// Medidas del modelo en su pose canónica (m).
export interface ModelExtent {
  halfLength: number;
  halfWidth: number;
}

// Orientación de cada detalle: la normal de una elipse que envuelve la
// planta (el zapato es alargado: un punto en el costado mira al costado
// aunque esté lejos del centro). Los detalles de la planta no miran a ningún
// costado: el marcador se pasa al canto del lado externo, que es lo que la
// cámara puede ver sin inclinar el zapato.
export function hotspotFrames(hotspots: Hotspot[], model: Model3D, extent: ModelExtent): HotspotFrame[] {
  const lateral = model.lateralSideFacing === '-z' ? -1 : 1;
  const a2 = Math.max(extent.halfLength, 0.01) ** 2;
  const b2 = Math.max(extent.halfWidth, 0.01) ** 2;
  return hotspots.map((hotspot) => {
    const [x, y, z] = hotspot.position;
    const sole = y < SOLE_HEIGHT;
    if (sole) {
      return { key: hotspot.key, anchor: [x, 0.008, lateral * extent.halfWidth * 0.85], azimuth: lateral > 0 ? 0 : Math.PI, sole };
    }
    const nx = x / a2;
    const nz = z / b2;
    const azimuth = Math.hypot(nx, nz) < 1e-6 ? (lateral > 0 ? 0 : Math.PI) : Math.atan2(nx, nz);
    return { key: hotspot.key, anchor: [x, y, z], azimuth, sole };
  });
}

// Ángulo de la plataforma que deja el detalle a tres cuartos de la cámara,
// del lado más cercano al giro actual (camino corto).
export function faceAngle(frame: HotspotFrame, baseYaw: number, current: number): number {
  const options = [FACE_OFFSET, -FACE_OFFSET].map((offset) => {
    const target = offset - frame.azimuth - baseYaw;
    const turn = Math.PI * 2;
    return target + Math.round((current - target) / turn) * turn;
  });
  return Math.abs(options[0]! - current) <= Math.abs(options[1]! - current) ? options[0]! : options[1]!;
}

// Altura del centro del objeto sobre el piso del mundo (el objeto se dibuja
// centrado en el origen y apoyado en FLOOR_Y).
export const objectCenterY = (height: number) => FLOOR_Y + height / 2;
