import fittingFile from './fitting.json';

// Calibración de los sneakers en los pies del avatar (docs/avatar-fitting.md,
// sección 6). Todos los valores van en ejes del avatar en reposo: metros,
// grados y factores. La herramienta de desarrollo (/hangar/dev) los ajusta y
// los guarda en fitting.json, que vive dentro de apps/web para que el build
// (Vercel y Docker) lo encuentre. No contiene nada de Mixamo.

export type Vec3 = [number, number, number];

export interface FootFit {
  // Posición del origen del zapato (centro de la huella) en el avatar en reposo.
  position: Vec3;
  // Cabeceo, apertura y rolido, en grados.
  rotation: Vec3;
  // Largo del zapato respecto de la pose canónica de 0,30 m.
  scale: number;
}

// Ajuste por modelo, para los que se salen de la media (suelas altas,
// punteras largas). Todo es opcional y se suma o multiplica a lo global.
export interface ModelFit {
  lift?: number; // m: sube el avatar y baja el zapato lo mismo (suela gruesa)
  scale?: number; // factor sobre la escala global
  forward?: number; // m: avance del zapato (suma a position.z)
  height?: number; // m: altura del zapato (suma a position.y)
}

export interface Fitting {
  version: 1;
  // Grosor medio de suela: el avatar sube lo mismo para que el tobillo
  // quede dentro del zapato y la suela siga en el piso.
  lift: number;
  // El pie izquierdo se deriva del derecho por simetría (x, apertura y rolido
  // cambian de signo). Sin simetría, cada pie tiene sus propios valores.
  mirrorLeft: boolean;
  right: FootFit;
  left: FootFit;
  models: Record<string, ModelFit>;
}

export const FITTING: Fitting = fittingFile as Fitting;

// Espejo de la calibración del pie derecho para el izquierdo.
export function mirrorFoot(fit: FootFit): FootFit {
  const [x, y, z] = fit.position;
  const [pitch, yaw, roll] = fit.rotation;
  return { position: [-x, y, z], rotation: [pitch, -yaw, -roll], scale: fit.scale };
}

export interface ResolvedFit {
  // Altura extra del avatar (m).
  lift: number;
  right: FootFit;
  left: FootFit;
}

// Calibración final de un modelo: global más su ajuste propio. La altura del
// zapato descuenta la subida del avatar, así la suela sigue en el piso.
export function resolveFit(fitting: Fitting, slug: string | null): ResolvedFit {
  const model = (slug && fitting.models[slug]) || {};
  const lift = fitting.lift + (model.lift ?? 0);
  const left = fitting.mirrorLeft ? mirrorFoot(fitting.right) : fitting.left;
  const apply = (fit: FootFit): FootFit => ({
    position: [fit.position[0], fit.position[1] + (model.height ?? 0) - lift, fit.position[2] + (model.forward ?? 0)],
    rotation: fit.rotation,
    scale: fit.scale * (model.scale ?? 1),
  });
  return { lift, right: apply(fitting.right), left: apply(left) };
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isVec3 = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(isNumber);
const isFoot = (value: unknown): value is FootFit => {
  const foot = value as FootFit | null;
  return !!foot && isVec3(foot.position) && isVec3(foot.rotation) && isNumber(foot.scale) && foot.scale > 0.5 && foot.scale < 1.5;
};
const MODEL_KEYS = ['lift', 'scale', 'forward', 'height'] as const;

// Validación del JSON que llega a la ruta de guardado (solo desarrollo).
export function parseFitting(value: unknown): Fitting | null {
  const data = value as Fitting | null;
  if (!data || data.version !== 1 || !isNumber(data.lift) || typeof data.mirrorLeft !== 'boolean') return null;
  if (!isFoot(data.right) || !isFoot(data.left)) return null;
  if (!data.models || typeof data.models !== 'object') return null;
  const models: Record<string, ModelFit> = {};
  for (const [slug, fit] of Object.entries(data.models)) {
    if (!/^[a-z0-9-]+$/.test(slug) || !fit || typeof fit !== 'object') return null;
    const clean: ModelFit = {};
    for (const key of MODEL_KEYS) {
      const entry = (fit as ModelFit)[key];
      if (entry === undefined) continue;
      if (!isNumber(entry)) return null;
      clean[key] = entry;
    }
    if (Object.keys(clean).length) models[slug] = clean;
  }
  return { version: 1, lift: data.lift, mirrorLeft: data.mirrorLeft, right: data.right, left: data.left, models };
}
