import { z } from 'zod';
import { priceSchema, slugSchema } from './catalog.js';
import { localeSchema } from './locale.js';

// Pedidos y pago de prueba (docs/plan-paso-5.md, fases 2 y 3). El navegador
// solo manda qué quiere (producto, talla y cantidad): precios, nombres e
// imágenes los pone la API con su catálogo. Por eso los esquemas de entrada
// son estrictos: un campo de más (por ejemplo, un precio) se rechaza.

// Máximo por línea (igual que el carrito) y de líneas por pedido.
export const MAX_ORDER_QUANTITY = 10;
export const MAX_ORDER_LINES = 20;

export const checkoutItemSchema = z.strictObject({
  slug: slugSchema,
  // Etiqueta de la talla del catálogo ("42", "M", "5"). Sin talla: talla única.
  size: z.string().trim().min(1).max(12).optional(),
  quantity: z.number().int().min(1).max(MAX_ORDER_QUANTITY),
});
export type CheckoutItem = z.infer<typeof checkoutItemSchema>;

// POST /v1/checkout
export const createCheckoutRequestSchema = z.strictObject({
  // Idioma de la página de pago de Stripe y de las URLs de retorno.
  locale: localeSchema,
  items: z.array(checkoutItemSchema).min(1).max(MAX_ORDER_LINES),
});
export type CreateCheckoutRequest = z.infer<typeof createCheckoutRequestSchema>;

export const createCheckoutResponseSchema = z.object({
  orderId: z.uuid(),
  // Página de pago de Stripe Checkout (el navegador va ahí).
  url: z.url(),
});
export type CreateCheckoutResponse = z.infer<typeof createCheckoutResponseSchema>;

// Motivos por los que una línea del carrito no se puede comprar. Van como
// message de cada issue (path items.N), y la web los traduce.
// duplicate_line: el mismo producto y talla en dos líneas (el carrito las junta).
export const CHECKOUT_ISSUES = ['unknown_product', 'unavailable', 'invalid_size', 'out_of_stock', 'duplicate_line'] as const;
export type CheckoutIssue = (typeof CHECKOUT_ISSUES)[number];

export const orderIdSchema = z.uuid();

export const ORDER_STATUSES = ['pending', 'paid', 'expired'] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

// Seguimiento simulado: un paso cada TRACKING_STEP_MS desde el pago.
export const TRACKING_STEPS = ['paid', 'preparing', 'shipped', 'in_transit', 'delivered'] as const;
export const trackingStepKeySchema = z.enum(TRACKING_STEPS);
export type TrackingStepKey = z.infer<typeof trackingStepKeySchema>;
export const TRACKING_STEP_MS = 5 * 60 * 1000;

export const TRACKING_STEP_STATES = ['done', 'current', 'upcoming'] as const;
export const trackingStepSchema = z.object({
  key: trackingStepKeySchema,
  state: z.enum(TRACKING_STEP_STATES),
  // Hora en que se alcanzó (done, current) o la estimada (upcoming), ISO 8601.
  at: z.iso.datetime({ offset: true }),
});
export type TrackingStep = z.infer<typeof trackingStepSchema>;

export const trackingSchema = z.object({
  steps: z.array(trackingStepSchema).length(TRACKING_STEPS.length),
  current: trackingStepKeySchema,
  // Hora estimada del siguiente paso; null al llegar a "Entregado".
  nextAt: z.iso.datetime({ offset: true }).nullable(),
  // Hora del servidor al calcular (para corregir el reloj del navegador).
  computedAt: z.iso.datetime({ offset: true }),
});
export type Tracking = z.infer<typeof trackingSchema>;

export const orderSummarySchema = z.object({
  id: z.uuid(),
  // Número visible, por ejemplo AS-2026-000123.
  number: z.string().regex(/^AS-\d{4}-\d{6,}$/),
  status: orderStatusSchema,
  createdAt: z.iso.datetime({ offset: true }),
  paidAt: z.iso.datetime({ offset: true }).nullable(),
  // Unidades (suma de cantidades), no líneas.
  itemCount: z.number().int().nonnegative(),
  total: priceSchema,
  // Paso actual del seguimiento si está pagado.
  trackingStage: trackingStepKeySchema.nullable(),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;

// GET /v1/orders (del usuario, el más reciente primero)
export const orderListSchema = z.object({ items: z.array(orderSummarySchema) });
export type OrderList = z.infer<typeof orderListSchema>;

export const orderItemSchema = z.object({
  slug: slugSchema,
  brand: z.string(),
  // En el idioma pedido (copia del catálogo al comprar).
  name: z.string(),
  detail: z.string().nullable(),
  size: z.string().nullable(),
  quantity: z.number().int().min(1),
  unitPrice: priceSchema,
  lineTotal: priceSchema,
  image: z.object({ dark: z.string(), light: z.string() }).nullable(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

// GET /v1/orders/:id?locale=es
export const orderDetailSchema = orderSummarySchema.extend({
  locale: localeSchema,
  subtotal: priceSchema,
  items: z.array(orderItemSchema),
  trackingNumber: z.string().nullable(),
  tracking: trackingSchema.nullable(),
  // Pedido pendiente con su página de pago todavía abierta: para retomarlo.
  resumeUrl: z.url().nullable(),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;
