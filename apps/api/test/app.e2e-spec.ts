import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Arranca la app completa con la base simulada. Las pruebas contra Postgres
// real (airspace_test) llegan con el catálogo en la fase 1.
describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: () => Promise.resolve([]), $disconnect: () => Promise.resolve() })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health responde ok', () =>
    request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((response) => expect(response.body).toMatchObject({ status: 'ok', database: 'up' })));

  it('una ruta desconocida bajo /v1 responde 404', () => request(app.getHttpServer()).get('/v1/nada').expect(404));
});
