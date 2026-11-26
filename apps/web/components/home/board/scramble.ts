'use client';

import { gsap } from '@/lib/motion/gsap';

// Texto que se "decodifica" carácter por carácter (como hud.scramble del
// prototipo, sin el plugin ScrambleText para no registrar plugins fuera de
// lib/motion/gsap.ts). Escribe textContent directo en el elemento, que debe
// ser aria-hidden: el texto final para lectores de pantalla va aparte.
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function scramble(element: HTMLElement, text: string, { duration = 0.7, delay = 0 } = {}): gsap.core.Tween {
  const state = { progress: 0 };
  let last = '';
  return gsap.to(state, {
    progress: 1,
    duration,
    delay,
    ease: 'none',
    onUpdate: () => {
      const revealed = Math.floor(state.progress * text.length);
      let next = text.slice(0, revealed);
      for (let index = revealed; index < text.length; index += 1) {
        const char = text[index];
        next += char === ' ' ? ' ' : CHARS[Math.floor(Math.random() * CHARS.length)];
      }
      if (next !== last) {
        last = next;
        element.textContent = next;
      }
    },
    onComplete: () => {
      element.textContent = text;
    },
    onInterrupt: () => {
      element.textContent = text;
    },
  });
}
