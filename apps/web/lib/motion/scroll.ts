'use client';

import { useMotionStore } from './store';

// Las secciones aterrizan en su borde superior (traen su propio aire); un
// elemento suelto queda bajo el encabezado gracias a scroll-padding-top, que
// Lenis y el navegador ya respetan.
const LANDS_AT_TOP = new Set(['SECTION', 'FOOTER', 'MAIN']);

// duration: segundos del salto suave (1,2 por defecto). onComplete: se llama
// al llegar al destino (al instante si el salto es inmediato).
export function scrollToElement(
  element: HTMLElement,
  { immediate = false, focus = true, duration = 1.2, onComplete }: { immediate?: boolean; focus?: boolean; duration?: number; onComplete?: () => void } = {},
): void {
  const { lenis, reducedMotion } = useMotionStore.getState();
  const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const atTop = LANDS_AT_TOP.has(element.tagName);
  const instant = immediate || reducedMotion;
  if (lenis) {
    // Medidas al día: Lenis las actualiza con una espera de 250 ms y la
    // página puede haber crecido hace poco (streaming, imágenes).
    lenis.resize();
    lenis.scrollTo(element, { offset: atTop ? padding : 0, immediate: instant, force: true, duration, onComplete: () => onComplete?.() });
  } else {
    const top = element.getBoundingClientRect().top + window.scrollY - (atTop ? 0 : padding);
    // Salto suave nativo: termina con el scrollend que llega al destino (uno
    // de un scroll anterior no cuenta). Si no hay nada que mover, termina ya.
    // Quien necesite un tope de tiempo (el usuario puede cortar el salto) lo
    // pone aparte.
    const destination = Math.max(0, Math.min(top, document.documentElement.scrollHeight - window.innerHeight));
    const still = Math.abs(destination - window.scrollY) < 2;
    if (onComplete && !instant && !still) {
      const onEnd = () => {
        if (Math.abs(destination - window.scrollY) >= 2) return;
        window.removeEventListener('scrollend', onEnd);
        onComplete();
      };
      window.addEventListener('scrollend', onEnd);
      window.setTimeout(() => window.removeEventListener('scrollend', onEnd), 3000);
    }
    window.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' });
    if (instant || still) onComplete?.();
  }
  // Foco al destino, para quien navega con teclado (no en un enlace profundo
  // al cargar: la sección podría no estar hidratada y el foco inicial queda
  // en el documento, como en cualquier página).
  if (!focus) return;
  if (!element.matches('a, button, input, select, textarea, [tabindex]')) element.setAttribute('tabindex', '-1');
  element.focus({ preventScroll: true });
}
