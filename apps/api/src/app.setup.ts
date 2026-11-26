import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiError } from '@airspace/contracts';
import helmet from 'helmet';
import type { AppConfig } from './config/config.module.js';

// Configuración HTTP compartida por main.ts y las pruebas e2e, para que las
// pruebas corran contra la misma app que producción. Llamar antes de init().
export function configureApp(app: INestApplication, config: Pick<AppConfig, 'webOrigins'> & Partial<Pick<AppConfig, 'trustProxy'>>): void {
  // Detrás de un proxy, la IP real del visitante (para el límite de peticiones).
  if (config.trustProxy) (app as NestExpressApplication).set('trust proxy', config.trustProxy);
  app.use(helmet());
  // Solo la web puede llamar a la API desde el navegador.
  app.enableCors({ origin: config.webOrigins });
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
