import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module.js';
import { configureApp, initApp } from '../src/app.setup.js';
import { APP_CONFIG, type AppConfig } from '../src/config/config.module.js';

// Función de Vercel para la API: Nest arranca una vez por instancia (sin
// listen) y cada petición pasa a su instancia de Express. Se usa en lugar del
// lanzador automático de NestJS de Vercel, que fallaba al iniciar con Nest 12
// (solo ESM). En local y en Docker sigue usándose src/main.ts.
type Handler = (request: IncomingMessage, response: ServerResponse) => void;

let server: Promise<Handler> | undefined;

async function bootstrap(): Promise<Handler> {
  const adapter = new ExpressAdapter();
  const app = await NestFactory.create(AppModule, adapter);
  configureApp(app, app.get<AppConfig>(APP_CONFIG));
  await initApp(app);
  return adapter.getInstance() as Handler;
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  server ??= bootstrap().catch((error: unknown) => {
    // Si el arranque falla, el siguiente intento vuelve a probar.
    server = undefined;
    throw error;
  });
  (await server)(request, response);
}
