// Utilidades de interfaz HUD compartidas. Todas respetan el movimiento
// reducido: si el usuario lo pide, muestran el estado final sin animar.

import { DURATION, EASE, reducedMotion } from './motion.js';

const { gsap, SplitText } = window;

const NUMBER_FORMAT_CACHE = new Map();
function formatNumber(value, decimals) {
  if (!NUMBER_FORMAT_CACHE.has(decimals)) {
    NUMBER_FORMAT_CACHE.set(
      decimals,
      new Intl.NumberFormat('es', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    );
  }
  return NUMBER_FORMAT_CACHE.get(decimals).format(value);
}

// Revela un texto por líneas (o caracteres) que suben desde una máscara.
export function revealText(element, { type = 'lines', stagger = 0.08, delay = 0, duration = DURATION.reveal, scrollTrigger } = {}) {
  const split = SplitText.create(element, {
    type: type === 'chars' ? 'lines,chars' : type === 'words' ? 'lines,words' : 'lines',
    mask: 'lines',
    autoSplit: true,
  });
  const targets = type === 'chars' ? split.chars : type === 'words' ? split.words : split.lines;
  if (reducedMotion) return gsap.from(targets, { autoAlpha: 0, duration: 0.3, delay, scrollTrigger });
  return gsap.from(targets, { yPercent: 110, duration, ease: EASE.out, stagger, delay, scrollTrigger });
}

// Cuenta desde 0 hasta un valor, como un instrumento que se estabiliza.
export function countTo(element, value, { decimals = 0, prefix = '', suffix = '', duration = 1.4, delay = 0, scrollTrigger } = {}) {
  const render = (current) => {
    element.textContent = `${prefix}${formatNumber(current, decimals)}${suffix}`;
  };
  if (reducedMotion) {
    render(value);
    return null;
  }
  const state = { value: 0 };
  render(0);
  return gsap.to(state, {
    value,
    duration,
    delay,
    ease: 'power2.out',
    scrollTrigger,
    onUpdate: () => render(state.value),
  });
}

// Muestra un texto "decodificándose" carácter por carácter.
export function scramble(element, text, { duration = 1, delay = 0, scrollTrigger, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' } = {}) {
  if (reducedMotion) {
    element.textContent = text;
    return null;
  }
  return gsap.to(element, { scrambleText: { text, chars, speed: 0.5 }, duration, delay, ease: 'none', scrollTrigger });
}

// Dibuja trazos SVG (líneas guía, barridos de radar, contornos).
export function drawLines(targets, { duration = DURATION.reveal, stagger = 0.08, delay = 0, scrollTrigger, ease = EASE.inOut } = {}) {
  if (reducedMotion) return null;
  return gsap.from(targets, { drawSVG: 0, duration, stagger, delay, ease, scrollTrigger });
}

// Mantiene un texto sincronizado con un valor que cambia en cada cuadro
// (por ejemplo, la "altitud" según el scroll). Solo toca el DOM si cambia.
export function bindReadout(element, read, { decimals = 0, pad = 0, prefix = '', suffix = '' } = {}) {
  let last = '';
  const tick = () => {
    const value = formatNumber(read(), decimals);
    const text = `${prefix}${pad ? value.padStart(pad, '0') : value}${suffix}`;
    if (text !== last) {
      element.textContent = text;
      last = text;
    }
  };
  gsap.ticker.add(tick);
  return () => gsap.ticker.remove(tick);
}

// Agrega las dos esquinas inferiores que faltan a un elemento .hud-frame.
export function frameCorners(element) {
  if (!element.querySelector(':scope > .hud-frame__corners')) {
    element.insertAdjacentHTML('beforeend', '<span class="hud-frame__corners" aria-hidden="true"></span>');
  }
}
