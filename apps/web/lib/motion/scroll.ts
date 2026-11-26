'use client';

import { useMotionStore } from './store';

// Las secciones aterrizan en su borde superior (traen su propio aire); un
// elemento suelto queda bajo el encabezado gracias a scroll-padding-top, que
// Lenis y el navegador ya respetan.
const LANDS_AT_TOP = new Set(['SECTION', 'FOOTER', 'MAIN']);

export function scrollToElement(element: HTMLElement, { immediate = false, focus = true } = {}): void {
  const { lenis, reducedMotion } = useMotionStore.getState();
  const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const atTop = LANDS_AT_TOP.has(element.tagName);
  const instant = immediate || reducedMotion;
  if (lenis) {
    lenis.scrollTo(element, { offset: atTop ? padding : 0, immediate: instant, force: true, duration: 1.2 });
  } else {
    const top = element.getBoundingClientRect().top + window.scrollY - (atTop ? 0 : padding);
    window.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' });
  }
  // Foco al destino, para quien navega con teclado (no en un enlace profundo
  // al cargar: la sección podría no estar hidratada y el foco inicial queda
  // en el documento, como en cualquier página).
  if (!focus) return;
  if (!element.matches('a, button, input, select, textarea, [tabindex]')) element.setAttribute('tabindex', '-1');
  element.focus({ preventScroll: true });
}
