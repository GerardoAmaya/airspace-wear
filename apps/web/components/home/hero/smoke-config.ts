// Constantes del humo de la entrada que también usa HeroClient. Viven aparte
// de HeroSmoke.tsx (que importa three y React Three Fiber) para que la
// portada no arrastre el motor 3D a su JS inicial: three llega con HeroScene,
// que se carga aparte (next/dynamic).

// Atlas del humo: 8 x 8 cuadros. El liviano (512 px) es para el modo liviano.
export const SMOKE_ATLAS = { hero: '/fx/smoke-atlas.webp', lite: '/fx/smoke-atlas-lite.webp' } as const;

// Duración total del humo (segundos de rig.smoke.time): la vida más larga
// de una partícula (retraso de hasta 0,18 s más 2 s).
export const SMOKE_LIFE = 2.2;
