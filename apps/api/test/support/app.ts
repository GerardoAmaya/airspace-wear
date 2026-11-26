import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp, initApp } from '../../src/app.setup.js';
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
export async function createTestApp(): Promise<TestApp> {
  // Defensa extra: nunca arrancar contra otra base que no sea la de pruebas.
  assertTestDatabaseUrl(process.env.DATABASE_URL);
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<TestApp>();
  configureApp(app, { webOrigins: ['http://localhost:3000'] });
  await initApp(app);
  return app;
}

export const prismaOf = (app: TestApp): PrismaService => app.get(PrismaService);
