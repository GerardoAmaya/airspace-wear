import type { AvatarSlot } from '@airspace/contracts';
import fitFile from './catalog-fit.json';
import type { OutfitCut, OutfitHole } from './outfit';

// Prendas del catálogo ajustadas al maniquí del Hangar 360° (pnpm avatar:fit,
// scripts/avatar/fit.json). El JSON lo genera el pipeline: archivos de cada
// variante, lugar en el avatar, piezas del vestuario base que reemplaza y
// reglas para ocultar el cuerpo bajo la prenda (mismo formato que
// outfit-rules.json). Sin nada de three.js: lo usan la página, el panel y la escena.

// Piezas del vestuario base que una prenda del catálogo reemplaza.
export type BasePiece = 'shirt' | 'tank' | 'shorts' | 'pants' | 'cap' | 'glasses';

export interface GarmentRule {
  bones: string[];
  cuts: OutfitCut[];
  holes: OutfitHole[];
}

export interface CatalogFitFile {
  url: string;
  bytes: number;
  triangles: number;
}

export interface CatalogFitItem {
  slot: AvatarSlot;
  // skinned: sigue el esqueleto (sudaderas, pantalones); rigid: cuelga del
  // hueso de la cabeza (gorra, lentes).
  kind: 'skinned' | 'rigid';
  node: string;
  hides: BasePiece[];
  rules: GarmentRule | null;
  files: { hero: CatalogFitFile; lite: CatalogFitFile };
}

// El JSON se valida al generarlo (pnpm avatar:fit); aquí solo se tipa.
export const CATALOG_FIT = (fitFile as unknown as { items: Record<string, CatalogFitItem> }).items;

export const isFitted = (slug: string): boolean => Object.hasOwn(CATALOG_FIT, slug);

// GLB ajustado de una prenda según el modo liviano. Los archivos se guardan
// un día en el navegador con el mismo nombre; la versión (bytes y triángulos
// del archivo generado) cambia la URL en cada reajuste para no servir uno viejo.
export const fitUrl = (slug: string, lite: boolean): string | null => {
  const item = CATALOG_FIT[slug];
  if (!item) return null;
  const file = lite ? item.files.lite : item.files.hero;
  return `${file.url}?v=${file.bytes}-${file.triangles}`;
};

// Orden de los lugares en el panel y en "Lleva puesto".
export const WEAR_SLOTS: readonly AvatarSlot[] = ['head', 'eyes', 'top', 'bottom'];

// Prendas del catálogo puestas, por lugar (slug).
export type CatalogWear = Partial<Record<AvatarSlot, string>>;

// Limpia lo guardado: solo prendas ajustadas y en su lugar.
export function sanitizeWear(raw: unknown): CatalogWear {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const wear: CatalogWear = {};
  for (const slot of WEAR_SLOTS) {
    const slug = data[slot];
    if (typeof slug === 'string' && CATALOG_FIT[slug]?.slot === slot) wear[slot] = slug;
  }
  return wear;
}
