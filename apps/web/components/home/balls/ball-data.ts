import type { ProductCard, ProductDetail } from '@airspace/contracts';
import { formatPrice } from '@/lib/price';

// Datos de un balón tal como los usa la sección (ya traducidos y con el
// precio formateado en el servidor). Solo cadenas y números: viajan al cliente.
export interface Ball {
  slug: string;
  name: string;
  // Nombre sin la marca ("Adidas Trionda" -> "Trionda") para el selector y las etiquetas.
  shortName: string;
  brand: string;
  tagline: string;
  edition: string;
  hostCity: string;
  // País sede en el idioma activo (Intl.DisplayNames), o su código si no se conoce.
  host: string;
  year: number;
  panels: number | null;
  finish: string | null;
  price: string;
  size: string;
  // Acento del foco (de la API); null = lima de la marca.
  accent: { dark: string; light: string } | null;
  model: {
    heroUrl: string;
    liteUrl: string;
    poster: { dark: string; light: string };
  };
}

// La API guarda el país sede en ISO alfa-3; Intl.DisplayNames pide alfa-2.
const ALPHA2: Record<string, string> = {
  ARG: 'AR',
  BRA: 'BR',
  CAN: 'CA',
  CHL: 'CL',
  DEU: 'DE',
  ESP: 'ES',
  FRA: 'FR',
  GBR: 'GB',
  ITA: 'IT',
  JPN: 'JP',
  KOR: 'KR',
  MEX: 'MX',
  QAT: 'QA',
  RUS: 'RU',
  SWE: 'SE',
  URY: 'UY',
  USA: 'US',
  ZAF: 'ZA',
};

function countryName(code: string, locale: string): string {
  const alpha2 = ALPHA2[code.toUpperCase()];
  if (!alpha2) return code;
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(alpha2) ?? code;
  } catch {
    return code;
  }
}

const asNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// Une la tarjeta del listado con su detalle. Devuelve null si al balón le
// falta lo indispensable (modelo 3D con póster, año).
export function toBall(card: ProductCard, detail: ProductDetail | null, locale: string): Ball | null {
  const model = card.model;
  const year = asNumber(detail?.attributes.year);
  if (!detail || !model?.poster || year === null) return null;
  const brand = card.brand.name;
  const shortName = card.name.toLowerCase().startsWith(`${brand.toLowerCase()} `) ? card.name.slice(brand.length + 1) : card.name;
  const hostCode = typeof detail.attributes.hostCountry === 'string' ? detail.attributes.hostCountry : '';
  return {
    slug: card.slug,
    name: card.name,
    shortName,
    brand,
    tagline: card.tagline,
    edition: card.edition ?? '',
    hostCity: detail.hostCity ?? '',
    host: hostCode ? countryName(hostCode, locale) : '',
    year,
    panels: asNumber(detail.attributes.panels),
    finish: detail.materials.finish ?? null,
    price: formatPrice(card.price, locale),
    size: detail.sizes[0]?.label ?? card.sizeRange?.min ?? '',
    accent: card.accent,
    model: { heroUrl: model.heroUrl, liteUrl: model.liteUrl, poster: model.poster },
  };
}

// Descarga anticipada de un modelo (al pasar el cursor o enfocar): baja el GLB
// con prioridad baja a la caché HTTP, donde useGLTF lo encuentra listo.
const requested = new Set<string>();
export function prefetchModel(url: string): void {
  if (requested.has(url)) return;
  requested.add(url);
  void fetch(url, { priority: 'low' } as RequestInit).catch(() => requested.delete(url));
}

// Balón elegido. piece: copia de la banda que se tocó (null si vino del
// selector: se usa la copia más cercana al foco). animate: false al
// restaurar una recarga (cambio al instante).
export interface Selection {
  index: number;
  piece: number | null;
  animate: boolean;
}
