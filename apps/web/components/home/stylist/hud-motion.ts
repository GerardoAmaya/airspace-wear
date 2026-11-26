'use client';

import { gsap } from '@/lib/motion/gsap';
import { SplitText } from '@/lib/motion/split-text';
import { DURATION, EASE } from '@/lib/motion/tokens';

// Piezas de movimiento HUD compartidas por el estilista y el club (portadas
// de design/prototype/core/hud.js). Solo escriben texto, opacidad y transform.

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';

// Decodifica un texto: muestra caracteres al azar que se resuelven de
// izquierda a derecha hasta el texto final. Respeta espacios y signos, así
// que el ancho no cambia con una fuente mono. Devuelve un tween pausable.
export function scramble(element: HTMLElement, text: string, { duration = 0.8, chars = LETTERS + DIGITS } = {}): gsap.core.Tween {
  const state = { progress: 0 };
  const keep = /[\s·:.,\-/%]/;
  return gsap.to(state, {
    progress: 1,
    duration,
    ease: 'none',
    immediateRender: false,
    onUpdate: () => {
      const resolved = Math.floor(state.progress * text.length);
      let output = text.slice(0, resolved);
      for (let index = resolved; index < text.length; index++) {
        const character = text[index];
        output += keep.test(character) ? character : chars[Math.floor(Math.random() * chars.length)];
      }
      element.textContent = output;
    },
    onComplete: () => {
      element.textContent = text;
    },
  });
}

// Cuenta de 0 al valor (porcentajes de coincidencia).
export function countTo(element: HTMLElement, value: number, { duration = 1.2 } = {}): gsap.core.Tween {
  const state = { value: 0 };
  return gsap.to(state, {
    value,
    duration,
    ease: 'power2.out',
    immediateRender: false,
    onStart: () => {
      element.textContent = '0';
    },
    onUpdate: () => {
      element.textContent = String(Math.round(state.value));
    },
  });
}

// Revelado de un titular línea por línea (SplitText con máscara). El texto
// partido vuelve a su forma original al terminar, así el diseño se reacomoda
// solo si cambia el ancho de la ventana.
export function revealLines(element: HTMLElement, { stagger = 0.08, duration = 1.1 } = {}): gsap.core.Timeline {
  const timeline = gsap.timeline();
  const split = SplitText.create(element, { type: 'lines', mask: 'lines' });
  timeline
    .set(element, { opacity: 1 })
    .fromTo(split.lines, { yPercent: 105 }, { yPercent: 0, duration, stagger, ease: EASE.out.gsap })
    .call(() => split.revert());
  return timeline;
}

// Aparición simple: opacidad y un pequeño desplazamiento.
export function fadeIn(targets: gsap.TweenTarget, { x = 0, y = 0, duration = DURATION.reveal as number, stagger = 0 }: { x?: number; y?: number; duration?: number; stagger?: number } = {}): gsap.core.Tween {
  return gsap.fromTo(targets, { opacity: 0, x, y }, { opacity: 1, x: 0, y: 0, duration, stagger, ease: EASE.out.gsap, immediateRender: false });
}
