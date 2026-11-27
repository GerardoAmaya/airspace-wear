import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { APP_OPTIONS, configureApp, initApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { assertTestDatabaseUrl } from './test-database.js';

export type TestApp = INestApplication<App>;

// Encabezado de las lecturas públicas (src/common/cache-control.ts).
export const PUBLIC_CACHE_CONTROL =
  'public, max-age=60, stale-while-revalidate=600';

// Arranca la app real (AppModule y configureApp, igual que main.ts) contra
// airspace_test. Cada llamada crea servicios nuevos, así que también crea
// cachés TtlCache vacías: un archivo que cambia datos puede arrancar otra app
// para leerlos sin esperar los 60 s de la caché.
// override permite reemplazar proveedores (por ejemplo, la puerta a Stripe
// por una sin red en las pruebas de pedidos).
export async function createTestApp(override?: (builder: TestingModuleBuilder) => TestingModuleBuilder): Promise<TestApp> {
  // Defensa extra: nunca arrancar contra otra base que no sea la de pruebas.
  assertTestDatabaseUrl(process.env.DATABASE_URL);
  const builder = Test.createTestingModule({
    imports: [AppModule],
  });
  const moduleRef = await (override ? override(builder) : builder).compile();
  const app = moduleRef.createNestApplication<TestApp>(APP_OPTIONS);
  configureApp(app, { webOrigins: ['http://localhost:3000'] });
  await initApp(app);
  return app;
}

export const prismaOf = (app: TestApp): PrismaService => app.get(PrismaService);
