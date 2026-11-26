// Tokens de movimiento: una sola fuente para GSAP, Motion y CSS. El layout
// los publica como variables CSS (--duration-*, --ease-*) en tokens.css; si
// cambias un valor aquí, cámbialo allí también (lo comprueba un test).
export const DURATION = {
  micro: 0.15,
  ui: 0.3,
  reveal: 0.9,
  cinematic: 1.6,
} as const;

// Curvas en formato cubic-bezier (Motion y CSS) y su nombre en GSAP.
export const EASE = {
  out: { bezier: [0.16, 1, 0.3, 1] as const, gsap: 'expo.out' },
  inOut: { bezier: [0.65, 0, 0.35, 1] as const, gsap: 'power3.inOut' },
  snap: { bezier: [0.22, 1, 0.36, 1] as const, gsap: 'power4.out' },
} as const;
