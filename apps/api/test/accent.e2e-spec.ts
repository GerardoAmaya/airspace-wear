import { productDetailSchema } from '@airspace/contracts';
import request from 'supertest';
import { PRODUCTS } from '../prisma/seed/catalog.js';
import { contrast } from '../prisma/seed/index.js';
import { createTestApp, type TestApp } from './support/app.js';

// Acento por producto: cada tinta pasa AA en su tema y la API lo entrega.
describe('Acento por producto (integración)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('cada acento del seed pasa 4.5:1 sobre los fondos de su tema', () => {
    for (const product of PRODUCTS) {
      if (!product.accent) continue;
      for (const background of ['#0e0e10', '#1c1c21']) expect(contrast(product.accent.dark, background)).toBeGreaterThanOrEqual(4.5);
      for (const background of ['#f4f1ea', '#fbf9f4']) expect(contrast(product.accent.light, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('la API entrega el acento del Gazelle y null para un neutro (lima de marca)', async () => {
    const gazelle = productDetailSchema.parse((await request(app.getHttpServer()).get('/v1/products/adidas-gazelle').expect(200)).body);
    expect(gazelle.accent).toEqual({ dark: '#22c55e', light: '#157c3b' });
    const jordan = productDetailSchema.parse((await request(app.getHttpServer()).get('/v1/products/air-jordan-1').expect(200)).body);
    expect(jordan.accent).toBeNull();
  });
});
