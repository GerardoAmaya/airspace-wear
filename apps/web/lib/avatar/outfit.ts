import rulesFile from './outfit-rules.json';

// Vestuario del maniquí del Hangar 360°: qué prendas lleva y de qué color.
// Las prendas las genera pnpm avatar:build (scripts/avatar/outfit.py) y las
// reglas para ocultar el cuerpo bajo la ropa salen de scripts/avatar/config.mjs
// (OUTFIT) en outfit-rules.json. Aquí no hay nada de three.js: lo usan el
// panel y la escena.

export type ShirtStyle = 'sleeves' | 'tank';
export type Bottoms = 'shorts' | 'pants';
// Cada prenda con esqueleto del GLB (la camiseta y la musculosa comparten el
// color de "shirt"; el short y el pantalón, el de "bottoms").
export type GarmentKey = 'shirt' | 'tank' | 'shorts' | 'pants' | 'socks';
export type AccessoryKey = 'cap' | 'glasses';
// "stripes": las dos franjas del puño de las medias.
export type ColorSlot = 'shirt' | 'bottoms' | 'socks' | 'stripes' | 'cap' | 'glasses';

export const SHIRT_STYLES: readonly ShirtStyle[] = ['sleeves', 'tank'];
export const BOTTOMS: readonly Bottoms[] = ['shorts', 'pants'];
export const COLOR_SLOTS: readonly ColorSlot[] = ['shirt', 'bottoms', 'socks', 'stripes', 'cap', 'glasses'];

// Muestras fijas: cada una es un token de styles/tokens.css (--color-garment-*).
export const SWATCHES = ['white', 'cream', 'grey', 'graphite', 'black', 'lime', 'orange', 'cobalt', 'navy', 'olive', 'wine'] as const;
export type Swatch = (typeof SWATCHES)[number];
export const swatchToken = (swatch: Swatch) => `--color-garment-${swatch}`;
export const LENS_TOKEN = '--color-garment-lens';

// "match": la prenda toma el acento del par que lleva puesto (y lo sigue al
// cambiar de par). Lo usan la gorra y las franjas de las medias.
export type GarmentColor = Swatch | 'match';
export const MATCH_SLOTS: readonly ColorSlot[] = ['cap', 'stripes'];

export interface OutfitChoice {
  shirt: ShirtStyle;
  bottoms: Bottoms;
  cap: boolean;
  glasses: boolean;
  socks: boolean;
  stripes: boolean;
  // Solo los colores que eligió la persona. Sin color de camiseta, la escena
  // usa el del tema (blanco en oscuro, negro en claro).
  colors: Partial<Record<ColorSlot, GarmentColor>>;
}

export const DEFAULT_OUTFIT: OutfitChoice = {
  shirt: 'sleeves',
  bottoms: 'shorts',
  cap: true,
  glasses: false,
  socks: true,
  stripes: true,
  colors: {},
};

// Colores por defecto: short negro en ambos temas (con la camiseta negra del
// tema claro se separan por el brillo de la tela y el canto del dobladillo),
// gorra grafito, lentes negros, medias blancas y franjas del color del par.
export const DEFAULT_COLORS: Record<Exclude<ColorSlot, 'shirt'>, GarmentColor> = {
  bottoms: 'black',
  socks: 'white',
  stripes: 'match',
  cap: 'graphite',
  glasses: 'black',
};
export const themeShirt = (theme: 'dark' | 'light'): Swatch => (theme === 'dark' ? 'white' : 'black');

// Lo que la escena necesita para dibujar: prendas visibles y el color de
// cada una como token CSS (--color-garment-*) o como color de datos (el acento
// del producto, que llega de la API).
export interface OutfitLook {
  garments: Record<GarmentKey, boolean>;
  accessories: Record<AccessoryKey, boolean>;
  colors: Record<ColorSlot, string>;
}

export function resolveLook(choice: OutfitChoice, theme: 'dark' | 'light', accent: string | null): OutfitLook {
  const color = (slot: ColorSlot): string => {
    const chosen = choice.colors[slot] ?? (slot === 'shirt' ? themeShirt(theme) : DEFAULT_COLORS[slot]);
    // Sin acento en el par, el lima de la marca.
    return chosen === 'match' ? (accent ?? swatchToken('lime')) : swatchToken(chosen);
  };
  return {
    garments: {
      shirt: choice.shirt === 'sleeves',
      tank: choice.shirt === 'tank',
      shorts: choice.bottoms === 'shorts',
      pants: choice.bottoms === 'pants',
      socks: choice.socks,
    },
    accessories: { cap: choice.cap, glasses: choice.glasses },
    colors: {
      shirt: color('shirt'),
      bottoms: color('bottoms'),
      socks: color('socks'),
      // Sin franjas, el puño es del color de la media.
      stripes: choice.stripes ? color('stripes') : color('socks'),
      cap: color('cap'),
      glasses: color('glasses'),
    },
  };
}

// Limpia lo que venga guardado en el navegador (versiones viejas o editado a mano).
export function sanitizeChoice(raw: unknown): OutfitChoice {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<OutfitChoice>;
  const colors: OutfitChoice['colors'] = {};
  if (data.colors && typeof data.colors === 'object') {
    for (const slot of COLOR_SLOTS) {
      const value = (data.colors as Record<string, unknown>)[slot];
      if (typeof value !== 'string') continue;
      if ((SWATCHES as readonly string[]).includes(value) || (value === 'match' && MATCH_SLOTS.includes(slot))) {
        colors[slot] = value as GarmentColor;
      }
    }
  }
  return {
    shirt: SHIRT_STYLES.includes(data.shirt as ShirtStyle) ? (data.shirt as ShirtStyle) : DEFAULT_OUTFIT.shirt,
    bottoms: BOTTOMS.includes(data.bottoms as Bottoms) ? (data.bottoms as Bottoms) : DEFAULT_OUTFIT.bottoms,
    cap: typeof data.cap === 'boolean' ? data.cap : DEFAULT_OUTFIT.cap,
    glasses: typeof data.glasses === 'boolean' ? data.glasses : DEFAULT_OUTFIT.glasses,
    socks: typeof data.socks === 'boolean' ? data.socks : DEFAULT_OUTFIT.socks,
    stripes: typeof data.stripes === 'boolean' ? data.stripes : DEFAULT_OUTFIT.stripes,
    colors,
  };
}

// ---------- Reglas del cuerpo (generadas por pnpm avatar:build) ----------

export interface OutfitCut {
  from: string;
  to: string;
  t: number;
  keep: 'above' | 'below';
}

export interface OutfitHole {
  from: string;
  to: string;
  radius: number;
  forward?: number;
  minT?: number;
}

export interface OutfitRules {
  version: 1;
  hideInset: number;
  forward: [number, number, number];
  garments: Record<GarmentKey, { node: string; bones: string[]; cuts: OutfitCut[]; holes: OutfitHole[] }>;
  accessories: Record<AccessoryKey, { node: string }>;
}

// El JSON se valida al generarlo (pnpm avatar:build); aquí solo se tipa.
export const OUTFIT_RULES = rulesFile as unknown as OutfitRules;
