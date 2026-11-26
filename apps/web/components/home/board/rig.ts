'use client';

import { type RefObject, useEffect } from 'react';
import { gsap } from '@/lib/motion/gsap';
import { EASE } from '@/lib/motion/tokens';

// Geometría compartida del escenario del tablero y del Hangar 360° (portada de
// design/prototype/sections/departures/rig.js). El zapato está siempre en el
// origen; la cámara orbita a su alrededor y un desplazamiento de lente
// (camera.setViewOffset) lo ubica en el punto del canvas que marca la pose.

export type Host = 'board' | 'hangar';

export const FOV = 26;
export const TAN_HALF = Math.tan(((FOV / 2) * Math.PI) / 180);
export const FLOOR_Y = -0.085; // piso del mundo (m): la suela de todos los modelos se apoya aquí
export const SHOE = { length: 0.3, height: 0.18 };
export const AUTO_SPEED = (Math.PI * 2) / 28; // giro automático del hangar: una vuelta cada 28 s
export const RESUME_DELAY = 1.6; // s sin interacción antes de retomar el giro automático
export const RING_HALF_MM = 300; // el SVG de anillos mide 600 x 600 mm del mundo
export const TAU = Math.PI * 2;

// Pose de cámara: ancla del zapato en píxeles del canvas (ax, ay), escala en
// píxeles por metro (k), elevación en grados, elevación extra del zapato
// (lift, m) y mezcla hacia el hangar (0 vista previa, 1 plataforma).
export interface Pose {
  ax: number;
  ay: number;
  k: number;
  elevation: number;
  lift: number;
  hangar: number;
}

export const POSES: Record<Host, (width: number, height: number) => Pose> = {
  board: (width, height) => ({
    ax: width / 2,
    ay: height * 0.53,
    k: Math.min((width * 0.72) / SHOE.length, (height * 0.62) / SHOE.height),
    elevation: 6,
    lift: 0,
    hangar: 0,
  }),
  hangar: (width, height) => ({
    ax: width / 2,
    ay: height * 0.46,
    k: Math.min((width * 0.54) / SHOE.length, (height * 0.42) / SHOE.height),
    elevation: 15,
    lift: 0,
    hangar: 1,
  }),
};

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

// Los anillos SVG se proyectan con una transformación CSS 3D que replica la
// cámara de three.js: su piso coincide con el del zapato.
export function ringTransform(pose: Pose, size: { width: number; height: number }, baseK: number): string {
  const focal = size.height / 2 / TAN_HALF;
  const elevation = rad(pose.elevation);
  const offsetY = -pose.k * FLOOR_Y * Math.cos(elevation);
  const offsetZ = pose.k * FLOOR_Y * Math.sin(elevation);
  const tilt = 90 - pose.elevation;
  const scale = pose.k / baseK;
  return (
    `translate(${pose.ax.toFixed(1)}px, ${pose.ay.toFixed(1)}px) perspective(${focal.toFixed(1)}px) ` +
    `translate3d(0, ${offsetY.toFixed(2)}px, ${offsetZ.toFixed(2)}px) rotateX(${tilt.toFixed(3)}deg) scale(${scale.toFixed(4)})`
  );
}

// Medidas de los anillos y del escáner en la pose de reposo del hangar.
export function hangarLayout(size: { width: number; height: number }) {
  const pose = POSES.hangar(size.width, size.height);
  const ring = ((RING_HALF_MM * 2) / 1000) * pose.k;
  const focal = size.height / 2 / TAN_HALF;
  const elevation = rad(pose.elevation);
  const distance = focal / pose.k;
  const worldY = FLOOR_Y + 0.118;
  const centerY = pose.ay - (focal * worldY * Math.cos(elevation)) / (distance - worldY * Math.sin(elevation));
  const scan = { width: 0.46 * pose.k, height: 0.24 * pose.k };
  return {
    pose,
    ring,
    scan: { ...scan, left: pose.ax - scan.width / 2, top: centerY - scan.height / 2 },
  };
}

// Giro compartido por las dos vistas (la vista previa y la plataforma): el
// ángulo que el usuario dejó en una se conserva en la otra. Vive en un ref y
// lo escribe solo el escenario que está dibujando.
export interface Spin {
  angle: number;
  velocity: number;
  dragging: boolean;
  resumeAt: number; // segundos (performance.now() / 1000)
  keyTween: gsap.core.Tween | null;
  // Última vista que dibujó: decide si hay transición al cambiar de vista.
  lastHost: Host | null;
}

export const createSpin = (): Spin => ({ angle: 0, velocity: 0, dragging: false, resumeAt: 0, keyTween: null, lastHost: null });

export const now = () => performance.now() / 1000;

// Marca la vista que empieza a dibujar y devuelve la anterior.
export function enterHost(spin: Spin, host: Host): Host | null {
  const previous = spin.lastHost;
  spin.lastHost = host;
  return previous;
}

// El giro automático se retoma de inmediato (al aterrizar en la plataforma).
export function resumeNow(spin: Spin) {
  spin.resumeAt = 0;
}

// Paso del giro por cuadro: inercia del arrastre y, en el hangar, el giro
// automático (nunca con movimiento reducido).
export function stepSpin(spin: Spin, host: Host, dt: number, reducedMotion: boolean) {
  if (spin.dragging || spin.keyTween?.isActive()) return;
  const resumed = now() >= spin.resumeAt;
  const target = resumed && host === 'hangar' && !reducedMotion ? AUTO_SPEED : 0;
  // Antes de retomar: la inercia del arrastre se apaga. Después: rampa suave.
  const rate = resumed ? 0.8 : 2.4;
  spin.velocity += (target - spin.velocity) * (1 - Math.exp(-dt * rate));
  spin.angle += spin.velocity * dt;
}

// Arrastre con inercia sobre una base (vista previa o plataforma). Se
// escuchan eventos nativos: los valores por cuadro van al ref, nunca a React.
export function useSpinDrag(element: HTMLElement | null, spin: RefObject<Spin>, reducedMotion: boolean) {
  useEffect(() => {
    if (!element) return;
    const drag = { x: 0, t: 0, sample: 0, pointer: -1 };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if ((event.target as Element).closest('a, button, select')) return;
      const state = spin.current;
      state.dragging = true;
      state.keyTween?.kill();
      Object.assign(drag, { x: event.clientX, t: performance.now(), sample: 0, pointer: event.pointerId });
      element.setPointerCapture(event.pointerId);
      element.dataset.dragging = '';
    };
    const onMove = (event: PointerEvent) => {
      const state = spin.current;
      if (!state.dragging || event.pointerId !== drag.pointer) return;
      const time = performance.now();
      const radiansPerPixel = TAU / Math.max(320, element.clientWidth * 1.2);
      const delta = (event.clientX - drag.x) * radiansPerPixel;
      state.angle += delta;
      const instant = delta / Math.max(0.008, (time - drag.t) / 1000);
      drag.sample = drag.sample * 0.6 + instant * 0.4;
      drag.x = event.clientX;
      drag.t = time;
    };
    const onUp = (event: PointerEvent) => {
      const state = spin.current;
      if (!state.dragging || event.pointerId !== drag.pointer) return;
      state.dragging = false;
      delete element.dataset.dragging;
      // Si el dedo se quedó quieto antes de soltar, no hay inercia.
      const idle = performance.now() - drag.t > 90;
      state.velocity = reducedMotion || idle ? 0 : Math.max(-7, Math.min(7, drag.sample));
      state.resumeAt = now() + RESUME_DELAY;
    };
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
    };
  }, [element, spin, reducedMotion]);
}

// Flechas: pasos de 15°. Inicio: vuelve a 000°.
export function keySpin(spin: Spin, key: string, reducedMotion: boolean): boolean {
  const step = ({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 } as Record<string, number>)[key];
  if (!step && key !== 'Home') return false;
  spin.velocity = 0;
  spin.resumeAt = now() + RESUME_DELAY * 2;
  const target = key === 'Home' ? Math.round(spin.angle / TAU) * TAU : spin.angle + (step * Math.PI) / 12;
  spin.keyTween?.kill();
  spin.keyTween = gsap.to(spin, { angle: target, duration: reducedMotion ? 0 : 0.45, ease: EASE.out.gsap });
  return true;
}

// Fracción de vuelta (0 a 1) y grados enteros de un ángulo.
export function turnOf(angle: number) {
  const turn = (((angle % TAU) + TAU) % TAU) / TAU;
  return { turn, degrees: Math.floor(turn * 360) % 360 };
}
