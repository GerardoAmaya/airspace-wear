import {
  apiErrorSchema,
  brandListSchema,
  categoryListSchema,
  productListSchema,
} from '@airspace/contracts';
import request from 'supertest';
import { seed } from '../prisma/seed/index.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, prismaOf, type TestApp } from './support/app.js';

// Pruebas que modifican airspace_test. Cada una deja la base como la
// encontró (y el globalSetup la vuelve a sembrar en cada corrida, por si una
// corrida se corta a mitad). vitest.config.e2e.ts corre los archivos uno
// tras otro, así estos cambios no se cruzan con catalog.e2e-spec.ts.
//
// Caché: CatalogService guarda cada lectura 60 s en memoria (TtlCache). En
// lugar de esperar o tocar la caché privada, después de cambiar datos se
// arranca una app nueva con createTestApp(): sus servicios son instancias
// nuevas y su caché empieza vacía. La app del beforeAll se usa para
// comprobar que, a propósito, sigue sirviendo lo que ya tenía en caché.
describe('Cambios en el catálogo (integración)', () => {
  let app: TestApp;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = prismaOf(app);
  });

  afterAll(async () => {
    await app.close();
  });

  async function withFreshApp(
    run: (fresh: TestApp) => Promise<void>,
  ): Promise<void> {
    const fresh = await createTestApp();
    try {
      await run(fresh);
    } finally {
      await fresh.close();
    }
  }

  async function countRows() {
    const [
      brands,
      products,
      productTranslations,
      sizes,
      models,
      hotspots,
      hotspotTranslations,
      credits,
    ] = await Promise.all([
      prisma.brand.count(),
      prisma.product.count(),
      prisma.productTranslation.count(),
      prisma.productSize.count(),
      prisma.model3D.count(),
      prisma.hotspot.count(),
      prisma.hotspotTranslation.count(),
      prisma.assetCredit.count(),
    ]);
    return {
      brands,
      products,
      productTranslations,
      sizes,
      models,
      hotspots,
      hotspotTranslations,
      credits,
    };
  }

  it('el seed es repetible: correrlo dos veces deja los mismos conteos', async () => {
    const before = await countRows();
    expect(before).toMatchObject({
      brands: 3,
      products: 18,
      productTranslations: 36,
      models: 18,
      hotspots: 8,
      hotspotTranslations: 16,
      credits: 27,
    });
    await seed(prisma, () => {});
    expect(await countRows()).toEqual(before);
    await seed(prisma, () => {});
    expect(await countRows()).toEqual(before);
  });

  it('un producto despublicado desaparece de listados y su detalle responde 404', async () => {
    const slug = 'new-balance-997';
    // Se calienta la caché de la app original antes del cambio.
    const cachedBefore = productListSchema.parse(
      (await request(app.getHttpServer()).get('/v1/products').expect(200)).body,
    );
    expect(cachedBefore.items.some((item) => item.slug === slug)).toBe(true);

    await prisma.product.update({
      where: { slug },
      data: { published: false },
    });
    try {
      await withFreshApp(async (fresh) => {
        const get = (url: string) => request(fresh.getHttpServer()).get(url);

        const all = productListSchema.parse(
          (await get('/v1/products').expect(200)).body,
        );
        expect(all.items).toHaveLength(17);
        expect(all.items.some((item) => item.slug === slug)).toBe(false);

        const byBrand = productListSchema.parse(
          (await get('/v1/products?brand=new-balance').expect(200)).body,
        );
        expect(byBrand.items).toEqual([]);

        const missing = await get(`/v1/products/${slug}?locale=en`).expect(404);
        expect(missing.headers['cache-control']).toBe('no-store');
        expect(apiErrorSchema.parse(missing.body)).toEqual({
          code: 'not_found',
        });

        // New Balance se queda sin productos publicados: se oculta.
        const brands = brandListSchema.parse(
          (await get('/v1/brands').expect(200)).body,
        );
        expect(brands.items.map((brand) => brand.slug)).toEqual([
          'adidas',
          'nike',
        ]);

        const categories = categoryListSchema.parse(
          (await get('/v1/categories').expect(200)).body,
        );
        expect(
          categories.items.find((category) => category.slug === 'sneaker')
            ?.productCount,
        ).toBe(12);
      });

      // La app original sigue respondiendo desde su caché (hasta 60 s).
      const cachedAfter = productListSchema.parse(
        (await request(app.getHttpServer()).get('/v1/products').expect(200))
          .body,
      );
      expect(cachedAfter.items.some((item) => item.slug === slug)).toBe(true);
    } finally {
      await prisma.product.update({
        where: { slug },
        data: { published: true },
      });
    }

    await withFreshApp(async (fresh) => {
      await request(fresh.getHttpServer())
        .get(`/v1/products/${slug}`)
        .expect(200);
    });
  });

  it('una marca sin productos publicados no aparece en /v1/brands', async () => {
    const brand = await prisma.brand.create({
      data: { slug: 'test-empty-brand', name: 'Test Empty Brand' },
    });
    try {
      await withFreshApp(async (fresh) => {
        const brands = brandListSchema.parse(
          (await request(fresh.getHttpServer()).get('/v1/brands').expect(200))
            .body,
        );
        expect(brands.items.map((item) => item.slug)).toEqual([
          'adidas',
          'new-balance',
          'nike',
        ]);
        const products = productListSchema.parse(
          (
            await request(fresh.getHttpServer())
              .get('/v1/products?brand=test-empty-brand')
              .expect(200)
          ).body,
        );
        expect(products.items).toEqual([]);
      });
    } finally {
      await prisma.brand.delete({ where: { id: brand.id } });
    }
  });

  it('un producto retirado del seed suelta su referencia y su modelo, y el seed sigue funcionando', async () => {
    const jordanModel = await prisma.model3D.findUniqueOrThrow({ where: { slug: 'air-jordan-1' } });
    const nike = await prisma.brand.findUniqueOrThrow({ where: { slug: 'nike' } });
    // Simula un producto renombrado: el viejo conserva la referencia y el modelo
    // que el seed le quiere dar a otro.
    const stale = await prisma.product.create({
      data: { slug: 'air-jordan-1-legacy', reference: 'AS-LEGACY', category: 'sneaker', brandId: nike.id, priceCents: 1, modelId: jordanModel.id },
    });
    try {
      await seed(prisma, () => {});
      const after = await prisma.product.findUniqueOrThrow({ where: { id: stale.id } });
      expect(after).toMatchObject({ published: false, modelId: null, reference: `RETIRED-${stale.id}` });
      // El seed se puede volver a correr sin chocar con claves únicas.
      await expect(seed(prisma, () => {})).resolves.toBeUndefined();
    } finally {
      await prisma.product.delete({ where: { id: stale.id } });
    }
  });

  it('dos productos pueden compartir el mismo modelo 3D', async () => {
    const jordan = await prisma.product.findUniqueOrThrow({ where: { slug: 'air-jordan-1' } });
    const nike = await prisma.brand.findUniqueOrThrow({ where: { slug: 'nike' } });
    const twin = await prisma.product.create({
      data: {
        slug: 'air-jordan-1-twin',
        reference: 'AS-TWIN',
        category: 'sneaker',
        brandId: nike.id,
        priceCents: 18000,
        modelId: jordan.modelId,
        published: false,
        translations: { create: [{ locale: 'es', name: 'Gemelo', tagline: 't', description: 'd' }] },
      },
    });
    try {
      expect(twin.modelId).toBe(jordan.modelId);
    } finally {
      await prisma.product.delete({ where: { id: twin.id } });
    }
  });
});
