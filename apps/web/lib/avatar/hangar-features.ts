import type { Clip } from './avatar';

// Funciones del Hangar 360° que están ocultas (no borradas). El dueño pidió
// un Hangar centrado en los zapatos, pero quiere poder volver atrás: todo lo
// que se quitó sigue en el código (componentes, mensajes es/en, GLB) y vuelve
// a la vista cambiando el valor de aquí. Este módulo no importa nada de
// three.js ni de React: lo leen la página, el panel, el store y las pruebas.

export const HANGAR_FEATURES = {
  // Vestuario base generado por pnpm avatar:build (outfit.glb: camiseta,
  // musculosa, short, pantalón, calcetines, gorra y lentes propios), su
  // sección "Base" en "Ropa", el chip "Base" de cada lugar y la línea "Base
  // del maniquí" de "Lleva puesto". Apagado, el maniquí no lleva capa base:
  // al quitar una prenda del catálogo se ve el cuerpo del maniquí en esa zona.
  // Para volver: true (y que exista NEXT_PUBLIC_OUTFIT_URL en producción).
  baseOutfit: false,
  // Calcetines del vestuario base y sus franjas (las del puño y las del corte
  // de la pierna, leg-cut.ts). Solo cuenta con baseOutfit en true. Para
  // volver: true; los botones "Calcetines" y "Franjas" y sus colores reaparecen.
  socks: false,
  // Pestaña "Colores" (paleta de las piezas base y "Combinar con el
  // zapato"). Solo tiene sentido con baseOutfit en true. Para volver: true.
  colorsTab: false,
  // "Restablecer" deja el maniquí sin ropa (conserva el par). En false vuelve
  // al comportamiento anterior: el look de fábrica (DEFAULT_OUTFIT, con la
  // gorra, la camiseta Nike Flight negra y los pants).
  resetToBare: true,
} as const;

// Chips de animación, en este orden. El clip "idle" (Reposo) sigue en el GLB
// y en lib/avatar/avatar.ts (CLIPS): "Girar" gira sobre él y la herramienta
// /hangar/dev lo usa. Para volver a ofrecer "Reposo": agregar 'idle' aquí
// (por ejemplo ['idle', 'pose', 'turn', 'walk']).
export const HANGAR_CLIPS: readonly Clip[] = ['pose', 'turn', 'walk'];

// Animación al abrir el Hangar (antes 'idle'). Con movimiento reducido el
// clip queda quieto (AvatarScene).
export const DEFAULT_CLIP: Clip = 'pose';

// Prendas del catálogo que el Hangar ofrece en "Ropa" (slugs de
// apps/api/prisma/seed/apparel.ts ajustados en lib/avatar/catalog-fit.json).
// Arriba: la camiseta Nike Flight negra (la de fábrica), el hoodie Nike Air negro,
// el hoodie Nike blanco y el anorak gris. Las demás prendas ajustadas (sudadera Nike, hoodie Adidas, lentes) siguen en
// el catálogo y en catalog-fit.json, pero el Hangar no las muestra, su ficha
// no enlaza al Hangar y lo guardado con ellas se limpia. Para volver a
// mostrarlas: agregar su slug aquí, o poner null para ofrecer todas las ajustadas.
export const HANGAR_WEAR_ALLOWLIST: readonly string[] | null = [
  'gorra-ny-59fifty-marino',
  'gorra-ny-negra-logo-gris',
  'gorra-adidas-negra',
  'camiseta-nike-flight-negra',
  'hoodie-nike-air-negro',
  'hoodie-nike-blanco',
  'anorak-gris',
  'pants-anorak-gris',
];

export const allowedInHangar = (slug: string): boolean => HANGAR_WEAR_ALLOWLIST === null || HANGAR_WEAR_ALLOWLIST.includes(slug);
