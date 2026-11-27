import { detectOrderQuestion, type StylistEvent as WireEvent, STYLIST_LIMITS, type StylistNotice, stylistEventSchema } from '@airspace/contracts';
import type { RecommendedProduct, StylistEngine, StylistEvent } from './engine';

// Motor real del estilista (fase 5): habla con la API a través del servidor
// de la web (POST /api/stylist/chat, que agrega la sesión del visitante para
// las preguntas sobre sus pedidos) y lee la respuesta en streaming (SSE).
// Mantiene la conversación en memoria (no se guarda en ningún lado). Si la IA
// no está disponible (sin clave, sin presupuesto o sin conexión), responde
// con el motor guionado; las preguntas sobre pedidos siguen yendo a la API,
// que las responde con datos reales aunque no haya IA.

export type CatalogEntry = Omit<RecommendedProduct, 'match' | 'reason'>;

export interface ApiEngineMessages {
  rateLimited: string;
  refused: string;
  error: string;
  // Texto de un aviso de respaldo (sin modelo) sobre pedidos, ya traducido.
  notice: (code: StylistNotice, count: number) => string;
}

// Ruta del servidor de la web que reenvía a la API (app/api/stylist/chat).
export const STYLIST_CHAT_ENDPOINT = '/api/stylist/chat';

interface Options {
  endpoint?: string;
  catalog: Record<string, CatalogEntry>;
  fallback: StylistEngine;
  messages: ApiEngineMessages;
}

// Lee eventos SSE ("event: x\ndata: {...}\n\n") de un stream de bytes.
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<WireEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) {
        const parsed = stylistEventSchema.safeParse(JSON.parse(data));
        if (parsed.success) yield parsed.data;
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
}

export function createApiEngine({ endpoint = STYLIST_CHAT_ENDPOINT, catalog, fallback, messages }: Options): StylistEngine {
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  // Tras la primera falta de disponibilidad, el resto de la visita usa el guion.
  let offline = false;

  return {
    async *ask(message, options): AsyncGenerator<StylistEvent> {
      const ordersQuestion = detectOrderQuestion(message) !== null;
      if (offline && !ordersQuestion) {
        yield* fallback.ask(message, options);
        return;
      }
      const question = message.slice(0, STYLIST_LIMITS.messageChars);
      history.push({ role: 'user', content: question });
      // Solo las últimas conversaciones caben en el límite de la API.
      while (history.filter((entry) => entry.role === 'user').length > STYLIST_LIMITS.userMessages) history.splice(0, 2);

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locale: options.locale, messages: history }),
          signal: options.signal,
        });
      } catch (error) {
        history.pop();
        if (options.signal?.aborted) throw error;
        offline = true;
        yield* fallback.ask(message, options);
        return;
      }

      if (!response.ok || !response.body) {
        history.pop();
        yield { type: 'text', text: response.status === 429 ? messages.rateLimited : messages.error };
        yield { type: 'done' };
        return;
      }

      let answer = '';
      for await (const event of readEvents(response.body)) {
        if (event.type === 'text') {
          answer += event.text;
          yield { type: 'text', text: event.text };
        } else if (event.type === 'products') {
          const products = event.items.flatMap((item) => (catalog[item.slug] ? [{ ...catalog[item.slug]!, match: item.match, reason: item.reason }] : []));
          if (products.length) yield { type: 'products', products };
        } else if (event.type === 'orders') {
          if (event.items.length) yield { type: 'orders', orders: event.items };
        } else if (event.type === 'sign_in') {
          yield { type: 'sign_in' };
        } else if (event.type === 'notice') {
          const text = messages.notice(event.code, event.count ?? 0);
          answer += text;
          yield { type: 'text', text };
        } else if (event.type === 'error') {
          if ((event.code === 'unavailable' || event.code === 'budget_exhausted') && !answer) {
            history.pop();
            offline = true;
            yield* fallback.ask(message, options);
            return;
          }
          const text = event.code === 'rate_limited' ? messages.rateLimited : event.code === 'refused' ? messages.refused : messages.error;
          answer += text;
          yield { type: 'text', text };
        }
      }
      if (answer) history.push({ role: 'assistant', content: answer });
      else history.pop();
      yield { type: 'done' };
    },
  };
}
