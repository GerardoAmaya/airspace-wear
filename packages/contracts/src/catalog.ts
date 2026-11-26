import { z } from 'zod';
import { localeSchema } from './locale.js';

// Forma pública del catálogo (GET /v1/products y compañía). Los textos ya
// vienen en el idioma pedido; categorías, disponibilidad y cambios de
// créditos son códigos que la web traduce con sus mensajes.

export const CATEGORIES = ['sneaker', 'apparel', 'ball'] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const AVAILABILITY = ['new', 'available', 'low_stock', 'coming_soon'] as const;
export const availabilitySchema = z.enum(AVAILABILITY);
export type Availability = z.infer<typeof availabilitySchema>;

export const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/, 'Invalid color');

export const slugSchema = z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug');

// Consultas
export const productListQuerySchema = z.object({
  locale: localeSchema.default('es'),
  category: categorySchema.optional(),
  brand: slugSchema.optional(),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const localeQuerySchema = z.object({ locale: localeSchema.default('es') });
export type LocaleQuery = z.infer<typeof localeQuerySchema>;

// Piezas
export const priceSchema = z.object({
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
});
export type Price = z.infer<typeof priceSchema>;

export const brandSummarySchema = z.object({ slug: slugSchema, name: z.string() });

export const model3dSchema = z.object({
  slug: slugSchema,
  heroUrl: z.string(),
  liteUrl: z.string(),
  heroBytes: z.number().int(),
  liteBytes: z.number().int(),
  foot: z.enum(['left', 'right']).nullable(),
  // Lado externo del zapato respecto de la cámara por defecto (+Z): con un
  // derecho mira a +z; con un izquierdo, a -z (ver CLAUDE.md, 3D models).
  lateralSideFacing: z.enum(['+z', '-z']).nullable(),
  // Pósters por tema (la iluminación del estudio cambia con el tema).
  poster: z.object({ dark: z.string(), light: z.string() }).nullable(),
});
export type Model3D = z.infer<typeof model3dSchema>;

export const sizeRangeSchema = z.object({ system: z.string(), min: z.string(), max: z.string() }).nullable();

// Tarjeta (listados)
export const productCardSchema = z.object({
  slug: slugSchema,
  reference: z.string(),
  category: categorySchema,
  brand: brandSummarySchema,
  name: z.string(),
  colorway: z.string().nullable(),
  tagline: z.string(),
  edition: z.string().nullable(),
  price: priceSchema,
  availability: availabilitySchema,
  sizeRange: sizeRangeSchema,
  imageUrl: z.string().nullable(),
  // Acento del visor (marco, halo, "En foco"): tinta AA por tema; null = lima de marca.
  accent: z.object({ dark: hexColorSchema, light: hexColorSchema }).nullable(),
  model: model3dSchema.nullable(),
});
export type ProductCard = z.infer<typeof productCardSchema>;

export const productListSchema = z.object({ locale: localeSchema, items: z.array(productCardSchema) });
export type ProductList = z.infer<typeof productListSchema>;

// Detalle
export const SIZE_STOCK = ['in_stock', 'low', 'out'] as const;
export const productSizeSchema = z.object({
  system: z.string(),
  label: z.string(),
  stock: z.enum(SIZE_STOCK),
});
export type ProductSize = z.infer<typeof productSizeSchema>;

// Encuadre de un detalle 3D (portado del prototipo, sections/flight):
// pose: giro del zapato (yaw > 0 acerca la punta a la cámara; bank > 0 inclina
//   el empeine hacia la cámara, bank < 0 muestra la suela; rim y shadow son
//   intensidades de la luz de borde y la sombra, de 0 a 1).
// camera: zoom respecto del perfil, elev (fracción de la distancia), focus
//   (cuánto se acerca el encuadre al punto, de 0 a 1) y shift (corrimiento en
//   pantalla, fracción del ancho).
// slot: lado y altura (0 a 1) de la etiqueta en escritorio. mobile: ajustes en teléfono.
export const hotspotViewSchema = z.object({
  pose: z.object({
    yaw: z.number(),
    pitch: z.number(),
    bank: z.number(),
    rim: z.number().min(0).max(1).optional(),
    shadow: z.number().min(0).max(1).optional(),
  }),
  camera: z.object({ zoom: z.number().positive(), elev: z.number(), focus: z.number().min(0).max(1), shift: z.number() }),
  slot: z.object({ side: z.enum(['left', 'right']), y: z.number().min(0).max(1) }),
  mobile: z.object({ zoom: z.number().positive(), yaw: z.number() }),
});
export type HotspotView = z.infer<typeof hotspotViewSchema>;

export const hotspotSchema = z.object({
  key: z.string(),
  // Metros en la pose canónica del modelo.
  position: z.tuple([z.number(), z.number(), z.number()]),
  view: hotspotViewSchema,
  title: z.string(),
  text: z.string(),
});
export type Hotspot = z.infer<typeof hotspotSchema>;

export const productDetailSchema = productCardSchema.extend({
  locale: localeSchema,
  description: z.string(),
  hostCity: z.string().nullable(),
  materials: z.record(z.string(), z.string()),
  tags: z.array(z.string()),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  sizes: z.array(productSizeSchema),
  hotspots: z.array(hotspotSchema),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

// Filtros
export const brandFacetSchema = brandSummarySchema.extend({ productCount: z.number().int() });
export const brandListSchema = z.object({ items: z.array(brandFacetSchema) });
export type BrandList = z.infer<typeof brandListSchema>;

export const categoryFacetSchema = z.object({ slug: categorySchema, productCount: z.number().int() });
export const categoryListSchema = z.object({ items: z.array(categoryFacetSchema) });
export type CategoryList = z.infer<typeof categoryListSchema>;

// Créditos
export const CREDIT_KINDS = ['model', 'font', 'library'] as const;
export const CREDIT_CHANGES = [
  'kept_one_shoe',
  'reoriented_rescaled',
  'meshes_merged',
  'mesh_simplified',
  'textures_webp',
  'meshopt_compression',
] as const;

export const creditSchema = z.object({
  key: z.string(),
  kind: z.enum(CREDIT_KINDS),
  name: z.string(),
  sourceTitle: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  author: z.string(),
  authorUrl: z.string().nullable(),
  license: z.object({
    name: z.string(),
    url: z.string().nullable(),
    commercialUse: z.boolean(),
    shareAlike: z.boolean(),
  }),
  changes: z.array(z.enum(CREDIT_CHANGES)),
});
export type Credit = z.infer<typeof creditSchema>;

export const creditListSchema = z.object({ items: z.array(creditSchema) });
export type CreditList = z.infer<typeof creditListSchema>;

// Errores: la API responde { code } y la web lo traduce.
export const API_ERROR_CODES = ['invalid_request', 'not_found', 'rate_limited', 'internal_error', 'service_unavailable'] as const;
export const apiErrorSchema = z.object({
  code: z.enum(API_ERROR_CODES),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
