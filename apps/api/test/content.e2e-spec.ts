import {
  CREDIT_CHANGES,
  creditListSchema,
  healthResponseSchema,
} from '@airspace/contracts';
import request from 'supertest';
import {
  createTestApp,
  PUBLIC_CACHE_CONTROL,
  type TestApp,
} from './support/app.js';

// Créditos y estado de la API contra airspace_test. Solo lectura.
describe('Contenidos y estado (integración)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (url: string) => request(app.getHttpServer()).get(url);

  describe('GET /v1/credits', () => {
    it('lista 18 modelos y 9 fuentes y librerías', async () => {
      const response = await get('/v1/credits').expect(200);
      expect(response.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL);
      const { items } = creditListSchema.parse(response.body);
      expect(items).toHaveLength(27);
      expect(items.filter((credit) => credit.kind === 'model')).toHaveLength(
        18,
      );
      expect(items.filter((credit) => credit.kind !== 'model')).toHaveLength(9);
      expect(items.filter((credit) => credit.kind === 'font')).toHaveLength(3);
      // Primero los modelos (sortOrder 0..17) y luego fuentes y librerías (100+).
      const firstStatic = items.findIndex((credit) => credit.kind !== 'model');
      expect(firstStatic).toBe(18);
    });

    it('el crédito de la Samba es no comercial y compartir igual', async () => {
      const { items } = creditListSchema.parse(
        (await get('/v1/credits').expect(200)).body,
      );
      const samba = items.find((credit) => credit.key === 'model:adidas-samba');
      expect(samba?.license).toMatchObject({
        name: 'CC BY-NC-SA 4.0',
        commercialUse: false,
        shareAlike: true,
      });
      // El resto de los modelos sí permite uso comercial.
      const others = items.filter(
        (credit) =>
          credit.kind === 'model' && credit.key !== 'model:adidas-samba',
      );
      expect(
        others.every(
          (credit) =>
            credit.license.commercialUse && !credit.license.shareAlike,
        ),
      ).toBe(true);
    });

    it('changes solo trae códigos conocidos', async () => {
      const { items } = creditListSchema.parse(
        (await get('/v1/credits').expect(200)).body,
      );
      const known = new Set<string>(CREDIT_CHANGES);
      for (const credit of items) {
        expect(credit.changes.every((change) => known.has(change))).toBe(true);
        if (credit.kind === 'model')
          expect(credit.changes).toEqual(
            expect.arrayContaining([
              'reoriented_rescaled',
              'textures_webp',
              'meshopt_compression',
            ]),
          );
        else expect(credit.changes).toEqual([]);
      }
    });
  });

  describe('GET /health', () => {
    it('responde 200 con la base arriba', async () => {
      const response = await get('/health').expect(200);
      const body = healthResponseSchema.parse(response.body);
      expect(body).toMatchObject({ status: 'ok', database: 'up' });
    });

    it('no lleva el prefijo /v1', async () => {
      await get('/v1/health').expect(404);
    });
  });
});
