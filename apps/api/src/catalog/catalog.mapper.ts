import { hotspotViewSchema, type Hotspot, type Locale, type ProductCard, type ProductDetail, type ProductSize } from '@airspace/contracts';
import type { Prisma } from '../generated/prisma/client.js';

// Consultas de Prisma y conversión a la forma pública de los contratos.

export const cardInclude = (locale: Locale) =>
  ({
    brand: { select: { slug: true, name: true } },
    model: true,
    translations: { where: { locale: { in: [locale, 'es'] } } },
    sizes: { select: { system: true, label: true }, orderBy: { sortOrder: 'asc' } },
  }) satisfies Prisma.ProductInclude;

export const detailInclude = (locale: Locale) =>
  ({
    ...cardInclude(locale),
    sizes: { select: { system: true, label: true, stock: true }, orderBy: { sortOrder: 'asc' } },
    hotspots: {
      orderBy: { sortOrder: 'asc' },
      include: { translations: { where: { locale: { in: [locale, 'es'] } } } },
    },
  }) satisfies Prisma.ProductInclude;

type CardRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof cardInclude> }>;
type DetailRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof detailInclude> }>;

// Datos que no cumplen las reglas del catálogo (por ejemplo, un producto sin
// traducciones). En los listados se omite el producto; en el detalle, 500.
export class CatalogDataError extends Error {}

// Texto en el idioma pedido; si faltara, el español (idioma predeterminado).
function pick<T extends { locale: Locale }>(rows: T[], locale: Locale, what: string): T {
  const row = rows.find((candidate) => candidate.locale === locale) ?? rows.find((candidate) => candidate.locale === 'es');
  if (!row) throw new CatalogDataError(`${what} sin traducciones`);
  return row;
}

const LATERAL_SIDE = { plus_z: '+z', minus_z: '-z' } as const;

const asRecord = <T>(value: Prisma.JsonValue): Record<string, T> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, T>) : {};

// Existencias por talla sin exponer números: agotada, últimas o disponible.
export function stockLevel(stock: number): ProductSize['stock'] {
  if (stock <= 0) return 'out';
  if (stock <= 2) return 'low';
  return 'in_stock';
}

export function toCard(row: CardRow, locale: Locale): ProductCard {
  const text = pick(row.translations, locale, `Producto ${row.slug}`);
  const first = row.sizes[0];
  const last = row.sizes[row.sizes.length - 1];
  return {
    slug: row.slug,
    reference: row.reference,
    category: row.category,
    brand: row.brand,
    name: text.name,
    colorway: text.colorway,
    tagline: text.tagline,
    edition: text.edition,
    price: { amountCents: row.priceCents, currency: row.currency },
    availability: row.availability,
    sizeRange: first && last ? { system: first.system, min: first.label, max: last.label } : null,
    imageUrl: row.imageUrl,
    accent: row.accentDark && row.accentLight ? { dark: row.accentDark, light: row.accentLight } : null,
    model: row.model
      ? {
          slug: row.model.slug,
          heroUrl: row.model.heroUrl,
          liteUrl: row.model.liteUrl,
          heroBytes: row.model.heroBytes,
          liteBytes: row.model.liteBytes,
          foot: row.model.foot,
          lateralSideFacing: row.model.lateralSideFacing ? LATERAL_SIDE[row.model.lateralSideFacing] : null,
          poster: row.model.posterDarkUrl && row.model.posterLightUrl ? { dark: row.model.posterDarkUrl, light: row.model.posterLightUrl } : null,
        }
      : null,
  };
}

function toHotspot(row: DetailRow['hotspots'][number], locale: Locale, productSlug: string): Hotspot {
  const what = `Hotspot ${productSlug}/${row.key}`;
  const text = pick(row.translations, locale, what);
  if (row.position.length !== 3) throw new CatalogDataError(`${what}: la posición debe tener 3 valores`);
  const view = hotspotViewSchema.safeParse(row.view);
  if (!view.success) throw new CatalogDataError(`${what}: encuadre inválido`);
  const [x, y, z] = row.position as [number, number, number];
  return { key: row.key, position: [x, y, z], view: view.data, title: text.title, text: text.text };
}

export function toDetail(row: DetailRow, locale: Locale): ProductDetail {
  const text = pick(row.translations, locale, `Producto ${row.slug}`);
  return {
    ...toCard(row, locale),
    // El idioma realmente usado (es, si faltara la traducción pedida).
    locale: text.locale,
    description: text.description,
    hostCity: text.hostCity,
    materials: asRecord<string>(text.materials),
    tags: text.tags,
    attributes: asRecord<string | number | boolean>(row.attributes),
    sizes: row.sizes.map((size) => ({ system: size.system, label: size.label, stock: stockLevel(size.stock) })),
    hotspots: row.hotspots.map((hotspot) => toHotspot(hotspot, locale, row.slug)),
  };
}
