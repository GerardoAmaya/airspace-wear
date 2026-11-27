import type { Locale, StylistOrder } from '@airspace/contracts';

// Motor del estilista: la consola solo conoce esta interfaz. En la fase 4 la
// cumple un guion fijo (createScriptedEngine); en la fase 5 la cumplirá la
// IA real (SSE desde la API) sin tocar la consola.
//
// Una respuesta es una secuencia de eventos:
// - text: un trozo del texto de la respuesta (se va sumando). Lo que va
//   entre [corchetes] se resalta como nombre de producto.
// - products: las recomendaciones, ya resueltas con datos reales del catálogo.
// - orders: pedidos del visitante con sesión (tarjetas con enlace al pedido).
// - sign_in: mostrar la acción "Iniciar sesión" (preguntó por pedidos sin sesión).
// - done: fin de la respuesta.

export interface RecommendedProduct {
  slug: string;
  brand: string;
  name: string;
  // Precio ya formateado en el idioma (lib/price.ts, en el servidor).
  price: string;
  tags: string[];
  poster: { dark: string; light: string } | null;
  // Coincidencia de 0 a 100 y motivo corto, en el idioma pedido.
  match: number;
  reason: string;
}

export type StylistEvent =
  | { type: 'text'; text: string }
  | { type: 'products'; products: RecommendedProduct[] }
  | { type: 'orders'; orders: StylistOrder[] }
  | { type: 'sign_in' }
  | { type: 'done' };

export interface StylistEngine {
  ask(message: string, options: { locale: Locale; signal?: AbortSignal }): AsyncIterable<StylistEvent>;
}

// Guion ya traducido y con los productos resueltos (lo arma el servidor).
export interface StylistScript {
  locale: Locale;
  scenarios: { id: string; question: string; answer: string; products: RecommendedProduct[] }[];
  freeReply: string;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

const normalize = (text: string) => text.trim().toLocaleLowerCase();

// Motor guionado: una idea sugerida reproduce su escenario; cualquier otro
// mensaje recibe la respuesta fija que explica la demo. Sin red y sin IA.
// latencyMs simula el tiempo de "pensar" (0 con movimiento reducido).
export function createScriptedEngine(script: StylistScript, { latencyMs = 700 } = {}): StylistEngine {
  return {
    async *ask(message, { signal }) {
      const scenario = script.scenarios.find((item) => normalize(item.question) === normalize(message));
      if (latencyMs > 0) await wait(latencyMs, signal);
      const answer = scenario?.answer ?? script.freeReply;
      // Entrega el texto en trozos de unas pocas palabras, como lo hará el
      // streaming real: la consola debe poder recibir palabras a medias.
      const pieces = answer.match(/\S+\s*/g) ?? [answer];
      for (let index = 0; index < pieces.length; index += 3) {
        if (signal?.aborted) return;
        yield { type: 'text', text: pieces.slice(index, index + 3).join('') };
      }
      if (scenario?.products.length) yield { type: 'products', products: scenario.products };
      yield { type: 'done' };
    },
  };
}
