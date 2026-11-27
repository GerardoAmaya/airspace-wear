import { z } from 'zod';
import { localeSchema } from './locale.js';

// Forma pública del catálogo (GET /v1/products y compañía). Los textos ya
// vienen en el idioma pedido; categorías, disponibilidad y cambios de
// créditos son códigos que la web traduce con sus mensajes.

// cleat: tacos de fútbol (botines con tapones). Se calzan como un sneaker.
export const CATEGORIES = ['sneaker', 'cleat', 'apparel', 'ball'] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

// Categorías que se calzan: el Hangar 360° las prueba en el avatar. Los
// balones no; la ropa entra prenda por prenda, según su avatarSlot.
export const WEARABLE_CATEGORIES = ['sneaker', 'cleat'] as const satisfies readonly Category[];
export const isWearable = (category: Category): boolean => (WEARABLE_CATEGORIES as readonly Category[]).includes(category);

// Subcategorías: hoy solo de la ropa (camisetas, sudaderas, chaquetas,
// pantalones, shorts, gorras y accesorios como lentes o mochila). Es un solo
// valor por producto, de una lista cerrada: sirve para filtrar y se traduce
// con los mensajes de la web. Las etiquetas (tags) siguen siendo texto libre
// por idioma, para describir, no para filtrar.
export const SUBCATEGORIES = ['tshirt', 'sweatshirt', 'jacket', 'pants', 'shorts', 'cap', 'accessory'] as const;
export const subcategorySchema = z.enum(SUBCATEGORIES);
export type Subcategory = z.infer<typeof subcategorySchema>;

// Lugar que ocupa una prenda en el avatar del Hangar 360° (null: solo
// catálogo). top reemplaza la camiseta base, bottom el short o pantalón,
// head va en la cabeza (gorra) y eyes en la cara (lentes). Los zapatos no
// usan este campo: se prueban por categoría (WEARABLE_CATEGORIES).
export const AVATAR_SLOTS = ['top', 'bottom', 'head', 'eyes'] as const;
export const avatarSlotSchema = z.enum(AVATAR_SLOTS);
export type AvatarSlot = z.infer<typeof avatarSlotSchema>;

// Sistemas de tallas. EU: números de calzado; ALPHA: tallas de letra de la
// ropa; ONE: talla única (gorras, lentes, mochilas); BALL: talla de balón (5).
export const SIZE_SYSTEMS = ['EU', 'ALPHA', 'ONE', 'BALL'] as const;
export const sizeSystemSchema = z.enum(SIZE_SYSTEMS);
export type SizeSystem = z.infer<typeof sizeSystemSchema>;

// Tallas de letra en su orden. La ropa del catálogo va de S a XL; XS y XXL
// quedan admitidas para prendas que las traigan.
export const ALPHA_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type AlphaSize = (typeof ALPHA_SIZES)[number];
// Etiqueta guardada de la talla única (la web muestra su texto traducido).
export const ONE_SIZE_LABEL = 'OS';

// Sistemas válidos por categoría (lo comprueba el seed).
export const SIZE_SYSTEMS_BY_CATEGORY = {
  sneaker: ['EU'],
  cleat: ['EU'],
  apparel: ['ALPHA', 'ONE'],
  ball: ['BALL'],
} as const satisfies Record<Category, readonly SizeSystem[]>;

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
  subcategory: subcategorySchema.optional(),
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

export const sizeRangeSchema = z.object({ system: sizeSystemSchema, min: z.string(), max: z.string() }).nullable();

// Tarjeta (listados)
export const productCardSchema = z.object({
  slug: slugSchema,
  reference: z.string(),
  category: categorySchema,
  subcategory: subcategorySchema.nullable(),
  avatarSlot: avatarSlotSchema.nullable(),
  brand: brandSummarySchema,
  name: z.string(),
  colorway: z.string().nullable(),
  tagline: z.string(),
  edition: z.string().nullable(),
  // Etiquetas en el idioma pedido: la búsqueda del catálogo también las mira.
  // default([]): una API anterior que no las mande sigue siendo válida.
  tags: z.array(z.string()).default([]),
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
  system: sizeSystemSchema,
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
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  sizes: z.array(productSizeSchema),
  hotspots: z.array(hotspotSchema),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

// Filtros
export const brandFacetSchema = brandSummarySchema.extend({ productCount: z.number().int() });
export const brandListSchema = z.object({ items: z.array(brandFacetSchema) });
export type BrandList = z.infer<typeof brandListSchema>;

export const subcategoryFacetSchema = z.object({ slug: subcategorySchema, productCount: z.number().int() });
// subcategories: conteo por subcategoría (todas, también en 0) en la ropa;
// vacío en las demás categorías.
export const categoryFacetSchema = z.object({ slug: categorySchema, productCount: z.number().int(), subcategories: z.array(subcategoryFacetSchema) });
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
  'own_work',
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

// Errores: la API responde { code } y la web lo traduce. unauthorized: falta
// la sesión o ya no es válida (rutas de cuenta, como GET /v1/me).
export const API_ERROR_CODES = ['invalid_request', 'unauthorized', 'not_found', 'rate_limited', 'internal_error', 'service_unavailable'] as const;
export const apiErrorSchema = z.object({
  code: z.enum(API_ERROR_CODES),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
