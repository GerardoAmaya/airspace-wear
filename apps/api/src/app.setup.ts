import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiError } from '@airspace/contracts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as helmetModule from 'helmet';
import type { HelmetOptions } from 'helmet';
import type { AppConfig } from './config/config.module.js';

// Vercel compila la API con otras reglas de módulos que tsc local, y según
// cuál, helmet llega como función, como { default } o anidado dos veces. Se
// busca la función en tiempo de ejecución con un tipo explícito.
type HelmetMiddleware = (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => void;
type HelmetFactory = (options?: HelmetOptions) => HelmetMiddleware;
function resolveHelmet(candidate: unknown): HelmetFactory {
  let current = candidate;
  for (let depth = 0; depth < 3 && typeof current !== 'function'; depth++) current = (current as { default?: unknown }).default;
  if (typeof current !== 'function') throw new Error('helmet no se pudo cargar');
  return current as HelmetFactory;
}
const helmet = resolveHelmet(helmetModule);

// Opciones de creación de la app, compartidas por main.ts, la función de
// Vercel (api/index.ts) y las pruebas e2e. rawBody guarda los bytes del cuerpo
// en request.rawBody: el webhook de Stripe verifica su firma sobre ellos.
export const APP_OPTIONS = { rawBody: true } as const;

// Cabeceras de seguridad de una API que solo responde JSON: ningún recurso
// se carga desde sus respuestas (CSP 'none'), nadie la enmarca, HSTS de dos
// años listo para preload y sin Referer. El resto, los valores de helmet.
export const HELMET_OPTIONS: HelmetOptions = {
  contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"], frameAncestors: ["'none'"] } },
  frameguard: { action: 'deny' },
  strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'no-referrer' },
};

// Tamaño máximo de un cuerpo JSON. El más grande es el del estilista
// (STYLIST_LIMITS.totalChars, unos 24.000 caracteres): 100 kB sobran
// aun con caracteres de varios bytes. Lo que pase responde 413.
export const JSON_BODY_LIMIT = '100kb';

// Configuración HTTP compartida por main.ts y las pruebas e2e, para que las
// pruebas corran contra la misma app que producción. Llamar antes de init().
export function configureApp(app: INestApplication, config: Pick<AppConfig, 'webOrigins'> & Partial<Pick<AppConfig, 'trustProxy'>>): void {
  // Detrás de un proxy, la IP real del visitante (para el límite de peticiones).
  const express = app as NestExpressApplication;
  if (config.trustProxy) express.set('trust proxy', config.trustProxy);
  // Sin X-Powered-By (helmet también lo quita) y con límites explícitos.
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  express.useBodyParser('urlencoded', { limit: '16kb', extended: false });
  app.use(helmet(HELMET_OPTIONS));
  // Solo la web puede llamar a la API desde el navegador.
  // Solo los métodos que la API usa (catálogo y contenidos GET, estilista POST).
  // Sin credenciales: la sesión viaja en Authorization desde el servidor de
  // la web, nunca como cookie del navegador hacia la API.
  app.enableCors({ origin: config.webOrigins, methods: ['GET', 'HEAD', 'POST'], credentials: false, maxAge: 600 });
  // Rutas versionadas (/v1/...), salvo el chequeo de estado.
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.enableShutdownHooks();
}

// Inicia la app y agrega el 404 final en JSON. Nest solo responde { code }
// dentro de /v1; fuera (por ejemplo "/" o "/health/x") Express respondía HTML.
export async function initApp(app: INestApplication): Promise<void> {
  await app.init();
  app.use((_request: unknown, response: { setHeader(name: string, value: string): void; status(code: number): { json(body: ApiError): void } }) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(404).json({ code: 'not_found' });
  });
}
