import type { Pose, ShoeDims, Vec3 } from './geometry';

// Estado compartido entre la interfaz de la portada y la escena 3D. Es un
// objeto mutable en un ref: GSAP lo anima por tiempo, los gestos escriben en
// él y la escena lo lee en cada cuadro. React nunca se entera (CLAUDE.md:
// los valores por cuadro viven en refs).
export interface HeroRig {
  // Pose actual (zapato + cámara); la mueven tweens de GSAP.
  pose: Pose;
  // Desvío de la entrada inicial: el zapato "aterriza" desde aquí hasta 0.
  intro: { x: number; y: number; z: number; yaw: number; pitch: number; bank: number };
  // Giro manual (arrastre o teclado), sumado a la pose.
  spin: { yaw: number; tilt: number };
  // Paralaje del puntero: objetivo y valor suavizado.
  pointer: { x: number; y: number; targetX: number; targetY: number };
  // Salida: grados de giro del zapato (0 a 359), para la lectura "Giro".
  turn: number;
  reducedMotion: boolean;
  // La escena llama a esto después de mover cámara y zapato en cada cuadro:
  // project lleva un punto del modelo (metros) a píxeles del lienzo.
  onFrame: ((project: (point: Vec3) => { x: number; y: number }, distance: number) => void) | null;
  // Pide un cuadro (movimiento reducido: la escena solo dibuja a demanda).
  invalidate: (() => void) | null;
}

export type OnSceneReady = (dims: ShoeDims) => void;
