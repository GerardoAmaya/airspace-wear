// Matemática pura de "traer al centro" en la vista AR (WebXR). Sin three.js ni
// DOM, para poder probarla sin un teléfono (e2e/ar-recenter.spec.ts).

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Distancias en metros sobre el piso, medidas desde los pies de la persona.
export const RECENTER_MIN_DISTANCE = 0.5;
export const RECENTER_MAX_DISTANCE = 3;
// Si la cámara mira al horizonte o hacia arriba, el modelo va a esta distancia.
export const RECENTER_DEFAULT_DISTANCE = 1.2;
// Tiempo fuera de cuadro antes de volver solo al centro.
export const AWAY_DELAY_MS = 2000;

// ¿La esfera que envuelve al modelo quedó entera fuera de la imagen?
// `clip` es su centro ya multiplicado por vista y proyección (sin dividir por
// w); `projX` y `projY` son los factores de escala de la proyección
// (elements[0] y elements[5] de la matriz), para medir el radio en pantalla.
export function isSphereOutOfView(
  clip: { x: number; y: number; w: number },
  radius: number,
  projX: number,
  projY: number,
): boolean {
  // Centro detrás de la cámara o pegado a ella: fuera solo si la esfera entera
  // quedó atrás (si la cruza, el teléfono está encima del modelo y se ve).
  if (clip.w <= 0.05) return clip.w < -radius;
  const x = clip.x / clip.w;
  const y = clip.y / clip.w;
  const rx = (radius * projX) / clip.w;
  const ry = (radius * projY) / clip.w;
  return x - rx > 1 || x + rx < -1 || y - ry > 1 || y + ry < -1;
}

// Punto del piso (altura floorY) en el centro de la vista: donde el rayo
// central de la cámara toca el piso, con la distancia acotada para que el
// modelo no quede bajo los pies ni perdido al fondo. Si el teléfono mira casi
// en vertical hacia abajo, la dirección la da el borde superior de la pantalla
// (`up`); si mira al horizonte, se usa una distancia cómoda por defecto.
export function centerFloorPoint(camera: Vec3, forward: Vec3, up: Vec3, floorY: number): { x: number; z: number } {
  let dirX = forward.x;
  let dirZ = forward.z;
  let flat = Math.hypot(dirX, dirZ);
  if (flat < 0.1) {
    dirX = up.x;
    dirZ = up.z;
    flat = Math.hypot(dirX, dirZ);
  }
  if (flat < 1e-6) return { x: camera.x, z: camera.z - RECENTER_DEFAULT_DISTANCE };
  dirX /= flat;
  dirZ /= flat;

  const height = camera.y - floorY;
  let distance = RECENTER_DEFAULT_DISTANCE;
  if (forward.y < -0.05 && height > 0) {
    // Avance horizontal hasta tocar el piso: altura / tangente del ángulo.
    distance = (height / -forward.y) * Math.hypot(forward.x, forward.z);
  }
  distance = Math.min(RECENTER_MAX_DISTANCE, Math.max(RECENTER_MIN_DISTANCE, distance));
  return { x: camera.x + dirX * distance, z: camera.z + dirZ * distance };
}

// Cronómetro de "fuera de cuadro": devuelve desde cuándo está fuera y si toca
// volver al centro. Cualquier bloqueo (dedos en la pantalla, seguimiento
// perdido) o volver a verse lo reinicia, así nunca pelea con la persona.
export function stepAwayTimer(
  awaySince: number | null,
  outOfView: boolean,
  blocked: boolean,
  now: number,
  delay = AWAY_DELAY_MS,
): { awaySince: number | null; recenter: boolean } {
  if (blocked || !outOfView) return { awaySince: null, recenter: false };
  const since = awaySince ?? now;
  if (now - since >= delay) return { awaySince: null, recenter: true };
  return { awaySince: since, recenter: false };
}

// Toque corto para colocar: un solo dedo, breve, casi sin moverse y que no
// empezó sobre el modelo (eso es arrastrarlo, lo maneja model-viewer).
export const TAP_MAX_MS = 350;
// Movimiento máximo del dedo en coordenadas de pantalla normalizadas (-1 a 1).
export const TAP_MAX_MOVE = 0.05;
// Superficie tocada más lejos que esto: se ignora (probable error de lectura).
export const TAP_MAX_DISTANCE = 6;

export function isPlacementTap(gesture: { durationMs: number; moved: number; maxTouches: number; onModel: boolean }): boolean {
  return gesture.maxTouches === 1 && !gesture.onModel && gesture.durationMs <= TAP_MAX_MS && gesture.moved <= TAP_MAX_MOVE;
}

// Cruce de un rayo con el piso (plano horizontal a altura floorY), para cuando
// la prueba de impacto del teléfono no encontró superficie bajo el dedo.
// Devuelve null si el rayo no baja hacia el piso o lo toca demasiado lejos.
export function rayFloorPoint(origin: Vec3, direction: Vec3, floorY: number, maxDistance = TAP_MAX_DISTANCE): { x: number; z: number } | null {
  const height = origin.y - floorY;
  if (direction.y >= -0.02 || height <= 0) return null;
  const t = height / -direction.y;
  const x = origin.x + direction.x * t;
  const z = origin.z + direction.z * t;
  return Math.hypot(x - origin.x, z - origin.z) <= maxDistance ? { x, z } : null;
}
