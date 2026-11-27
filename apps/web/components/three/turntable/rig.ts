'use client';

import { type RefObject, useEffect } from 'react';
import { gsap } from '@/lib/motion/gsap';
import { EASE } from '@/lib/motion/tokens';

// Plataforma giratoria compartida (anillos HUD, giro lento, arrastre con
// inercia y flechas). Es la misma geometría del adelanto del Hangar 360° de
// la home (components/home/board/rig.ts), copiada aquí para reutilizarla en
// la ficha de producto sin tocar la sección de la home: el objeto queda en el
// origen, la cámara orbita a su alrededor y un desplazamiento de lente
// (camera.setViewOffset) lo ubica en el punto del canvas que marca la pose.

export const FOV = 26;
export const TAN_HALF = Math.tan(((FOV / 2) * Math.PI) / 180);
export const FLOOR_Y = -0.085; // piso del mundo (m): la suela (o la base del objeto) se apoya aquí
export const SHOE = { length: 0.3, height: 0.18 };
export const AUTO_SPEED = (Math.PI * 2) / 28; // giro automático: una vuelta cada 28 s
export const RESUME_DELAY = 1.6; // s sin interacción antes de retomar el giro automático
export const RING_HALF_MM = 300; // el SVG de anillos mide 600 x 600 mm del mundo
export const TAU = Math.PI * 2;

// Pose de cámara: ancla del objeto en píxeles del canvas (ax, ay), escala en
// píxeles por metro (k) y elevación de la cámara en grados.
export interface Pose {
  ax: number;
  ay: number;
  k: number;
  elevation: number;
}

const rad = (degrees: number) => (degrees * Math.PI) / 180;

// Los anillos SVG se proyectan con una transformación CSS 3D que replica la
// cámara de three.js: su piso coincide con el del objeto.
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

// Diámetro del SVG de anillos (px) para una escala de reposo.
export const ringSize = (k: number) => ((RING_HALF_MM * 2) / 1000) * k;

// Estado del giro. Vive en un ref y lo escribe solo la escena (por cuadro),
// el arrastre, las flechas o un tween de GSAP; nunca estado de React.
export interface Spin {
  angle: number;
  velocity: number;
  dragging: boolean;
  resumeAt: number; // segundos (performance.now() / 1000)
  tween: gsap.core.Tween | null;
}

export const createSpin = (angle = 0): Spin => ({ angle, velocity: 0, dragging: false, resumeAt: 0, tween: null });

export const now = () => performance.now() / 1000;

// Paso del giro por cuadro: inercia del arrastre y, con autoplay, el giro
// automático (nunca con movimiento reducido: autoplay llega en false).
export function stepSpin(spin: Spin, dt: number, autoplay: boolean) {
  if (spin.dragging || spin.tween?.isActive()) return;
  const resumed = now() >= spin.resumeAt;
  const target = resumed && autoplay ? AUTO_SPEED : 0;
  // Antes de retomar: la inercia del arrastre se apaga. Después: rampa suave.
  const rate = resumed ? 0.8 : 2.4;
  spin.velocity += (target - spin.velocity) * (1 - Math.exp(-dt * rate));
  spin.angle += spin.velocity * dt;
}

// Arrastre horizontal con inercia. Se escuchan eventos nativos: los valores
// por cuadro van al ref, nunca a React. El elemento lleva touch-action: pan-y,
// así un deslizamiento vertical sigue desplazando la página (el navegador
// cancela el puntero y el arrastre termina sin inercia).
export function useSpinDrag(element: HTMLElement | null, spin: RefObject<Spin>, reducedMotion: boolean, onGesture?: () => void) {
  useEffect(() => {
    if (!element) return;
    const drag = { x: 0, t: 0, sample: 0, pointer: -1 };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if ((event.target as Element).closest('a, button, select')) return;
      const state = spin.current;
      state.dragging = true;
      state.tween?.kill();
      Object.assign(drag, { x: event.clientX, t: performance.now(), sample: 0, pointer: event.pointerId });
      element.setPointerCapture(event.pointerId);
      element.dataset.dragging = '';
      onGesture?.();
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
      // Si el dedo se quedó quieto antes de soltar (o el navegador tomó el
      // gesto para desplazar la página), no hay inercia.
      const idle = event.type === 'pointercancel' || performance.now() - drag.t > 90;
      state.velocity = reducedMotion || idle ? 0 : Math.max(-7, Math.min(7, drag.sample));
      state.resumeAt = Math.max(state.resumeAt, now() + RESUME_DELAY);
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
  }, [element, spin, reducedMotion, onGesture]);
}

// Gira la plataforma hasta un ángulo por el camino más corto (GSAP, por
// tiempo). hold: segundos de pausa del giro automático al terminar.
export function turnTo(spin: Spin, target: number, { duration, hold, onUpdate }: { duration: number; hold: number; onUpdate?: () => void }) {
  // Equivalente del destino más cercano al ángulo actual.
  const nearest = target + Math.round((spin.angle - target) / TAU) * TAU;
  spin.velocity = 0;
  spin.tween?.kill();
  spin.resumeAt = now() + duration + hold;
  spin.tween = gsap.to(spin, { angle: nearest, duration, ease: EASE.inOut.gsap, onUpdate });
  return spin.tween;
}

// Flechas: pasos de 15°. Inicio: vuelve a 000°.
export function keySpin(spin: Spin, key: string, reducedMotion: boolean): boolean {
  const step = ({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 } as Record<string, number>)[key];
  if (!step && key !== 'Home') return false;
  spin.velocity = 0;
  spin.resumeAt = now() + RESUME_DELAY * 2;
  // Pasos sobre el destino del tween en curso: varias pulsaciones seguidas suman.
  const from = spin.tween?.isActive() ? Number(spin.tween.vars.angle) : spin.angle;
  const target = key === 'Home' ? Math.round(spin.angle / TAU) * TAU : from + (step * Math.PI) / 12;
  spin.tween?.kill();
  spin.tween = gsap.to(spin, { angle: target, duration: reducedMotion ? 0 : 0.45, ease: EASE.out.gsap });
  return true;
}

// Fracción de vuelta (0 a 1) y grados enteros de un ángulo.
export function turnOf(angle: number) {
  const turn = (((angle % TAU) + TAU) % TAU) / TAU;
  return { turn, degrees: Math.round(turn * 360) % 360 };
}
