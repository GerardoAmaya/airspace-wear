import {
  CREDIT_CHANGES,
  creditListSchema,
  healthResponseSchema,
} from '@airspace/contracts';
import request from 'supertest';
import {
  createTestApp,
  prismaOf,
  PUBLIC_CACHE_CONTROL,
  type TestApp,
} from './support/app.js';
import { seededCatalog } from './support/catalog.js';
import { AVATAR_CREDITS, STATIC_CREDITS } from '../prisma/seed/credits.js';

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
    it('lista un crédito por modelo listo, el avatar y 11 fuentes y librerías', async () => {
      const response = await get('/v1/credits').expect(200);
      expect(response.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL);
      const { items } = creditListSchema.parse(response.body);
      // Modelos que el seed cargó (los listos en el manifest al sembrar).
      const { models: seeded } = await seededCatalog(prismaOf(app));
      const models = seeded.size + AVATAR_CREDITS.length;
      expect(items).toHaveLength(models + STATIC_CREDITS.length);
      expect(items.filter((credit) => credit.kind === 'model')).toHaveLength(models);
      expect(items.filter((credit) => credit.kind !== 'model')).toHaveLength(11);
      expect(items.filter((credit) => credit.kind === 'font')).toHaveLength(3);
      // Primero los modelos y el avatar, luego fuentes y librerías (100+).
      const firstStatic = items.findIndex((credit) => credit.kind !== 'model');
      expect(firstStatic).toBe(models);
    });

    it('los modelos no comerciales (como la Samba) están marcados', async () => {
      const { items } = creditListSchema.parse(
        (await get('/v1/credits').expect(200)).body,
      );
      const samba = items.find((credit) => credit.key === 'model:adidas-samba');
      expect(samba?.license).toMatchObject({
        name: 'CC BY-NC-SA 4.0',
        commercialUse: false,
        shareAlike: true,
      });
      // Los modelos CC BY-NC-SA conocidos son no comerciales; el resto de los
      // modelos sí permite uso comercial y no pide compartir igual.
      const NON_COMMERCIAL = new Set([
        'model:adidas-samba',
        'model:nike-defy-all-day',
        'model:vans-rock-haters',
        'model:new-balance-fresh-foam-roav',
        'model:air-jordan-1-low-dior',
      ]);
      const models = items.filter((credit) => credit.kind === 'model');
      for (const credit of models) {
        if (NON_COMMERCIAL.has(credit.key)) {
          expect(credit.license.commercialUse).toBe(false);
        } else {
          expect(credit.license.commercialUse && !credit.license.shareAlike).toBe(true);
        }
      }
    });

    it('changes solo trae códigos conocidos', async () => {
      const { items } = creditListSchema.parse(
        (await get('/v1/credits').expect(200)).body,
      );
      const known = new Set<string>(CREDIT_CHANGES);
      for (const credit of items) {
        expect(credit.changes.every((change) => known.has(change))).toBe(true);
        // Los modelos 3D pasan por el proceso completo; el avatar no. Las
        // prendas propias (pnpm garments) no tienen original que reorientar.
        if (credit.key.startsWith('model:') && credit.changes.includes('own_work'))
          expect(credit.changes).toEqual(['own_work', 'textures_webp', 'meshopt_compression']);
        else if (credit.key.startsWith('model:'))
          expect(credit.changes).toEqual(
            expect.arrayContaining([
              'reoriented_rescaled',
              'textures_webp',
              'meshopt_compression',
            ]),
          );
        else if (credit.kind !== 'model') expect(credit.changes).toEqual([]);
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
