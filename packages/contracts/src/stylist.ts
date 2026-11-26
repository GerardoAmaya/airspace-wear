import { z } from 'zod';
import { localeSchema } from './locale.js';

// Estilista IA (POST /v1/stylist/chat). La conversación vive en el cliente:
// cada pedido trae el historial completo (texto plano, sin datos personales)
// y la API responde en streaming (SSE). Límites de abuso del plan: mensajes de
// hasta 500 caracteres y 10 mensajes del visitante por conversación.
export const STYLIST_LIMITS = { messageChars: 500, userMessages: 10, recommendations: 3 } as const;

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

// Eventos SSE (campo "event" = type; "data" = JSON del evento).
export const STYLIST_ERROR_CODES = ['unavailable', 'budget_exhausted', 'rate_limited', 'refused', 'invalid_request', 'internal_error'] as const;
export const stylistEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('products'), items: z.array(stylistRecommendationSchema).max(STYLIST_LIMITS.recommendations) }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), code: z.enum(STYLIST_ERROR_CODES) }),
]);
export type StylistEvent = z.infer<typeof stylistEventSchema>;

// GET /v1/stylist/status: si la IA está disponible (la web usa el guion si no).
export const stylistStatusSchema = z.object({ available: z.boolean() });
export type StylistStatus = z.infer<typeof stylistStatusSchema>;
