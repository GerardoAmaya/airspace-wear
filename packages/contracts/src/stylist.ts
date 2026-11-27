import { z } from 'zod';
import { localeSchema } from './locale.js';
import { orderSummarySchema } from './orders.js';

// Estilista IA (POST /v1/stylist/chat). La conversación vive en el cliente:
// cada pedido trae el historial completo (texto plano, sin datos personales)
// y la API responde en streaming (SSE). Límites de abuso del plan: mensajes de
// hasta 500 caracteres y 10 mensajes del visitante por conversación. Además,
// un tope para todo el historial (totalChars): las respuestas que reenvía el
// cliente son cortas (2 a 4 frases), y sin tope una petición podía mandar
// 20 mensajes de 4.000 caracteres al modelo (costo de cada pregunta).
export const STYLIST_LIMITS = { messageChars: 500, userMessages: 10, totalChars: 24_000, recommendations: 3, orders: 3 } as const;

export const stylistMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  // Las respuestas del estilista pueden ser más largas que las preguntas.
  content: z.string().trim().min(1).max(4000),
});
export type StylistMessage = z.infer<typeof stylistMessageSchema>;

export const stylistRequestSchema = z
  .object({
    locale: localeSchema,
    messages: z.array(stylistMessageSchema).min(1).max(STYLIST_LIMITS.userMessages * 2),
  })
  .superRefine((request, context) => {
    const users = request.messages.filter((message) => message.role === 'user');
    if (request.messages.at(-1)?.role !== 'user') context.addIssue({ code: 'custom', path: ['messages'], message: 'Last message must be from the user' });
    if (users.length > STYLIST_LIMITS.userMessages) context.addIssue({ code: 'custom', path: ['messages'], message: 'Too many messages' });
    for (const message of users) {
      if (message.content.length > STYLIST_LIMITS.messageChars) context.addIssue({ code: 'custom', path: ['messages'], message: 'Message too long' });
    }
    const total = request.messages.reduce((sum, message) => sum + message.content.length, 0);
    if (total > STYLIST_LIMITS.totalChars) context.addIssue({ code: 'custom', path: ['messages'], message: 'Conversation too long' });
  });
export type StylistRequest = z.infer<typeof stylistRequestSchema>;

// Recomendación: solo slugs del catálogo (la API los valida); la web arma
// la tarjeta con sus propios datos. match: coincidencia de 0 a 100.
export const stylistRecommendationSchema = z.object({
  slug: z.string(),
  reason: z.string().max(160),
  match: z.number().int().min(0).max(100),
});
export type StylistRecommendation = z.infer<typeof stylistRecommendationSchema>;

// Pedido citado por el estilista (solo pedidos del usuario con sesión): el
// resumen de "Mis pedidos" más la hora estimada del siguiente paso del
// seguimiento (null si no está pagado o ya se entregó). La web arma la
// tarjeta con enlace a /[locale]/orders/[id].
export const stylistOrderSchema = orderSummarySchema.extend({
  nextStepAt: z.iso.datetime({ offset: true }).nullable(),
});
export type StylistOrder = z.infer<typeof stylistOrderSchema>;

// Avisos sin texto del modelo (respuesta de respaldo sobre pedidos, cuando la
// IA no está disponible): la web los traduce con sus mensajes.
// - sign_in_required: sin sesión, hay que iniciarla para ver los pedidos.
// - orders_found (count): los pedidos más recientes, en tarjetas.
// - orders_empty: con sesión, todavía sin pedidos.
// - order_found: el pedido que se nombró, en una tarjeta.
// - order_not_found: el número nombrado no es de este usuario (o no existe).
export const STYLIST_NOTICES = ['sign_in_required', 'orders_found', 'orders_empty', 'order_found', 'order_not_found'] as const;
export type StylistNotice = (typeof STYLIST_NOTICES)[number];

// Eventos SSE (campo "event" = type; "data" = JSON del evento).
// - orders: tarjetas de pedidos del usuario (solo con sesión válida).
// - sign_in: la web muestra la acción "Iniciar sesión" junto a la respuesta.
// - notice: respuesta de respaldo sin modelo (ver STYLIST_NOTICES).
export const STYLIST_ERROR_CODES = ['unavailable', 'budget_exhausted', 'rate_limited', 'refused', 'invalid_request', 'internal_error'] as const;
export const stylistEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('products'), items: z.array(stylistRecommendationSchema).max(STYLIST_LIMITS.recommendations) }),
  z.object({ type: z.literal('orders'), items: z.array(stylistOrderSchema).max(STYLIST_LIMITS.orders) }),
  z.object({ type: z.literal('sign_in') }),
  z.object({ type: z.literal('notice'), code: z.enum(STYLIST_NOTICES), count: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), code: z.enum(STYLIST_ERROR_CODES) }),
]);
export type StylistEvent = z.infer<typeof stylistEventSchema>;

// GET /v1/stylist/status: si la IA está disponible (la web usa el guion si no).
export const stylistStatusSchema = z.object({ available: z.boolean() });
export type StylistStatus = z.infer<typeof stylistStatusSchema>;

// ---------- Preguntas sobre pedidos (sin modelo) ----------

// Detecta, en español o inglés, si el mensaje pregunta por los pedidos del
// visitante ("¿cómo van mis pedidos?", "where is my order AS-2026-000123?").
// La usan la API (respuesta de respaldo sin IA) y la web (sigue preguntando a
// la API por pedidos aunque el resto de la visita use el guion). Con la IA
// disponible decide el modelo; esto solo cubre el respaldo, así que prefiere
// frases claras a adivinar.
export interface OrderQuestion {
  // Número de pedido nombrado (AS-AAAA-NNNNNN), en mayúsculas.
  number: string | null;
  // Pregunta por la última compra ("¿qué compré la última vez?").
  latest: boolean;
}

const ORDER_NUMBER = /\bAS-\d{4}-\d{6,}\b/i;
const ORDER_PATTERNS = [
  // Español (sin tildes: el texto se normaliza antes).
  /\bmis? (?:ultim[oa]s? |dos |tres )?(?:pedidos?|ordene?s?|compras?|paquetes?|envios?)\b/,
  /\bpedidos?\b/,
  /\b(?:que|lo que) (?:he )?compre\b/,
  /\bcompre\b.*\b(?:ultima|vez|antes)\b/,
  /\b(?:seguimiento|rastreo|rastrear)\b/,
  /\bcuando (?:me )?llega\b/,
  // English.
  /\bmy (?:last |latest |recent |most recent )?(?:orders?|purchases?|packages?|deliver(?:y|ies)|shipments?)\b/,
  /\btrack (?:my|an?|the)\b|\btracking (?:number|status|info)\b/,
  /\bwhat did i (?:buy|order|purchase)\b/,
  /\b(?:i )?(?:bought|ordered|purchased)\b.*\b(?:last|before|recently)\b/,
  /\bwhere(?:'s| is) my\b/,
  /\border status\b/,
];
const LATEST = /\b(?:ultim[oa]|ultima vez|last|latest|most recent)\b/;

const normalizeQuestion = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function detectOrderQuestion(text: string): OrderQuestion | null {
  const number = ORDER_NUMBER.exec(text)?.[0].toUpperCase() ?? null;
  const normalized = normalizeQuestion(text);
  if (!number && !ORDER_PATTERNS.some((pattern) => pattern.test(normalized))) return null;
  return { number, latest: !number && LATEST.test(normalized) };
}
