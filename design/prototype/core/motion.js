// Motor de movimiento compartido: Lenis (scroll suave) y GSAP en un solo
// ciclo de animación, como exige CLAUDE.md. GSAP, sus plugins y Lenis llegan
// como scripts globales desde index.html.

const { gsap, ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin, Lenis } = window;

// Tokens de movimiento: los mismos valores que core/tokens.css.
export const EASE = {
  out: 'expo.out', // revelados y entradas
  inOut: 'power3.inOut', // cámara y desplazamientos largos
  snap: 'power4.out', // respuestas rápidas de interfaz
};

export const DURATION = {
  micro: 0.15,
  ui: 0.3,
  reveal: 0.9,
  cinematic: 1.6,
};

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lenis = null;

// Registra plugins y conecta Lenis al ticker de GSAP. Se llama una sola vez.
export function initMotion() {
  gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin, DrawSVGPlugin);
  gsap.defaults({ ease: EASE.out, duration: DURATION.reveal });

  if (!reducedMotion) {
    // La rueda y el touch se sienten nativos (smoothWheel: false): el scroll
    // suavizado se percibía lento. Lenis queda para los saltos suaves de los
    // enlaces (scrollTo) y para sincronizar ScrollTrigger.
    lenis = new Lenis({ smoothWheel: false, syncTouch: false, autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    // Los pin de ScrollTrigger cambian el alto de la página: Lenis debe
    // recalcular su límite de scroll en cada refresco, o un scrollTo justo
    // después de cargar quedaría limitado al alto anterior.
    ScrollTrigger.addEventListener('refresh', () => lenis.resize());
    // Expuesto para depuración y para las capturas automáticas.
    window.lenis = lenis;
  }

  return { gsap, ScrollTrigger, SplitText, lenis, reducedMotion, EASE, DURATION };
}

// Las secciones (y el pie) traen su propio aire arriba: aterrizan en su borde
// superior. Un elemento suelto (como #hangar) queda bajo el encabezado, con el
// scroll-padding-top de base.css, que Lenis y el navegador ya respetan.
const LANDS_AT_TOP = new Set(['SECTION', 'FOOTER', 'MAIN']);
const scrollPaddingTop = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;

// Desplaza a un elemento, un selector o una posición, con Lenis cuando está
// activo. Opciones de Lenis: duration, offset, immediate, force, onComplete.
export function scrollTo(target, options = {}) {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  if (typeof target !== 'number' && !(element instanceof HTMLElement)) return;
  const padding = typeof target === 'number' ? 0 : scrollPaddingTop();
  const atTop = element instanceof HTMLElement && LANDS_AT_TOP.has(element.tagName);
  if (lenis) {
    return lenis.scrollTo(element ?? target, { duration: 1.4, ...options, offset: (options.offset ?? 0) + (atTop ? padding : 0) });
  }
  const top = typeof target === 'number' ? target : element.getBoundingClientRect().top + window.scrollY - (atTop ? 0 : padding) + (options.offset ?? 0);
  window.scrollTo({ top, behavior: 'auto' });
  options.onComplete?.();
}

// Detiene o reanuda el scroll (por ejemplo, mientras corre la intro).
export function setScrollLocked(locked) {
  if (lenis) locked ? lenis.stop() : lenis.start();
  document.documentElement.classList.toggle('is-scroll-locked', locked);
}
