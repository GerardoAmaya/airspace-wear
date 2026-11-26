import type { StylistEvent } from '@airspace/contracts';
import { test as base, expect, type Page, type Route } from '@playwright/test';

// Base de todas las pruebas E2E:
// - El estilista nunca llega a la API real (no se gasta dinero en Anthropic):
//   cada POST a /v1/stylist/chat se intercepta. Por defecto responde con el
//   error "unavailable", así la consola usa el motor guionado. Una prueba
//   puede cambiar la respuesta con mockStylist().
// - Se juntan los errores de consola y las excepciones de la página para
//   las pruebas que exigen una consola limpia.

export const STYLIST_ROUTE = '**/v1/stylist/chat';

// Arma un cuerpo SSE con el formato de la API (event = type, data = JSON).
export function sse(events: StylistEvent[]): string {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

export function fulfillSse(route: Route, events: StylistEvent[]) {
  return route.fulfill({
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      // La web (puerto 3000) llama a la API (puerto 4000): petición entre orígenes.
      'access-control-allow-origin': '*',
    },
    body: sse(events),
  });
}

// Respuesta de las peticiones de preflight (CORS) por si el navegador las hace.
async function handleStylist(route: Route, respond: (route: Route) => Promise<void>) {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({
      status: 204,
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' },
    });
    return;
  }
  await respond(route);
}

export async function mockStylist(page: Page, respond: (route: Route) => Promise<void>) {
  await page.unroute(STYLIST_ROUTE);
  await page.route(STYLIST_ROUTE, (route) => handleStylist(route, respond));
}

interface Fixtures {
  consoleErrors: string[];
  stylistGuard: void;
}

export const test = base.extend<Fixtures>({
  stylistGuard: [
    async ({ page }, provide) => {
      await page.route(STYLIST_ROUTE, (route) => handleStylist(route, (target) => fulfillSse(target, [{ type: 'error', code: 'unavailable' }])));
      // Diagnóstico: si el servidor responde 500 a una página, se imprime el
      // motivo (por ejemplo "API 429 rate_limited" si la API limitó a Next).
      page.on('response', async (response) => {
        if (response.status() < 500 || !['document', 'fetch'].includes(response.request().resourceType())) return;
        const body = await response.text().catch(() => '');
        const reason = body.match(/API \d{3} [a-z_]+|Error: [^<\\]{0,200}/)?.[0] ?? 'unknown';
        console.log(`[e2e] ${response.status()} ${response.url()} ${reason}`);
      });
      await provide();
    },
    { auto: true },
  ],
  consoleErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    await provide(errors);
  },
});

export { expect };

// Mensajes de la web en cada idioma (las pruebas no escriben textos de UI a mano).
export { default as es } from '../messages/es.json' with { type: 'json' };
export { default as en } from '../messages/en.json' with { type: 'json' };
export { default as stylistEs } from '../messages/home/stylist.es.json' with { type: 'json' };
export { default as stylistEn } from '../messages/home/stylist.en.json' with { type: 'json' };

// Espera a que la app esté hidratada (el interruptor de tema refleja el
// estado real solo en el cliente) y a que las fuentes estén listas.
export async function waitForApp(page: Page) {
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
