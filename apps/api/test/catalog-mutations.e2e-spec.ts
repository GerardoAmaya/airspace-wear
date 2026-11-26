import {
  apiErrorSchema,
  brandListSchema,
  categoryListSchema,
  productDetailSchema,
  productListSchema,
} from '@airspace/contracts';
import request from 'supertest';
import { APPAREL_PRODUCTS } from '../prisma/seed/apparel.js';
import { BRANDS, PRODUCTS } from '../prisma/seed/catalog.js';
import { AVATAR_CREDITS, STATIC_CREDITS } from '../prisma/seed/credits.js';
import { seed } from '../prisma/seed/index.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, prismaOf, type TestApp } from './support/app.js';
import { seededCatalog, setPublished, visibleBrandSlugs } from './support/catalog.js';

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
//
// Ropa sin 3D: el seed deja sin publicar los productos cuyo modelo todavía
// no está en el manifest. Las pruebas que necesitan una prenda la publican
// con setPublished y la devuelven a su estado al terminar, y los conteos
// salen de seededCatalog (seed más modelos cargados), así siguen valiendo
// antes y después de que lleguen los modelos.
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
      brands: BRANDS.length,
      products: PRODUCTS.length,
      productTranslations: PRODUCTS.length * 2,
      hotspots: 8,
      hotspotTranslations: 16,
    });
    // Créditos: uno por modelo, más fuentes, librerías y el avatar.
    expect(before.credits).toBe(before.models + STATIC_CREDITS.length + AVATAR_CREDITS.length);
    await seed(prisma, () => {});
    expect(await countRows()).toEqual(before);
    await seed(prisma, () => {});
    expect(await countRows()).toEqual(before);
  });

  it('el seed deja sin publicar y sin 3D los productos cuyo modelo no está listo', async () => {
    const { listed, pending } = await seededCatalog(prisma);
    const published = await prisma.product.findMany({ where: { published: true }, select: { slug: true } });
    expect(published.map((row) => row.slug).sort()).toEqual(listed.map((product) => product.slug).sort());
    const hidden = await prisma.product.findMany({
      where: { slug: { in: pending.map((product) => product.slug) } },
      select: { published: true, modelId: true },
    });
    expect(hidden).toHaveLength(pending.length);
    expect(hidden.every((row) => !row.published && row.modelId === null)).toBe(true);
  });

  it('un producto despublicado desaparece de listados y su detalle responde 404', async () => {
    const { listed } = await seededCatalog(prisma);
    const slug = 'new-balance-997';
    // El otro New Balance se despublica también: así la marca queda vacía.
    const sibling = 'new-balance-fresh-foam-roav';
    // Se calienta la caché de la app original antes del cambio.
    const cachedBefore = productListSchema.parse(
      (await request(app.getHttpServer()).get('/v1/products').expect(200)).body,
    );
    expect(cachedBefore.items.some((item) => item.slug === slug)).toBe(true);

    await prisma.product.updateMany({
      where: { slug: { in: [slug, sibling] } },
      data: { published: false },
    });
    try {
      await withFreshApp(async (fresh) => {
        const get = (url: string) => request(fresh.getHttpServer()).get(url);

        const all = productListSchema.parse(
          (await get('/v1/products').expect(200)).body,
        );
        expect(all.items).toHaveLength(listed.length - 2);
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
        expect(brands.items.map((brand) => brand.slug)).toEqual(
          visibleBrandSlugs(listed.filter((product) => product.brand !== 'new-balance')),
        );
        expect(brands.items.some((brand) => brand.slug === 'new-balance')).toBe(false);

        const categories = categoryListSchema.parse(
          (await get('/v1/categories').expect(200)).body,
        );
        expect(
          categories.items.find((category) => category.slug === 'sneaker')
            ?.productCount,
        ).toBe(listed.filter((product) => product.category === 'sneaker').length - 2);
      });

      // La app original sigue respondiendo desde su caché (hasta 60 s).
      const cachedAfter = productListSchema.parse(
        (await request(app.getHttpServer()).get('/v1/products').expect(200))
          .body,
      );
      expect(cachedAfter.items.some((item) => item.slug === slug)).toBe(true);
    } finally {
      await prisma.product.updateMany({
        where: { slug: { in: [slug, sibling] } },
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
    const { listed } = await seededCatalog(prisma);
    const brand = await prisma.brand.create({
      data: { slug: 'test-empty-brand', name: 'Test Empty Brand' },
    });
    try {
      await withFreshApp(async (fresh) => {
        const brands = brandListSchema.parse(
          (await request(fresh.getHttpServer()).get('/v1/brands').expect(200))
            .body,
        );
        // Solo las marcas con productos publicados, por nombre.
        expect(brands.items.map((item) => item.slug)).toEqual(visibleBrandSlugs(listed));
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

  it('una prenda despublicada sale de su marca, su categoría y su subcategoría', async () => {
    const slug = 'gorra-gris-flexfit';
    const caps = APPAREL_PRODUCTS.filter((product) => product.subcategory === 'cap').map((product) => product.slug);
    const otherCaps = caps.filter((cap) => cap !== slug);
    // Las otras gorras se publican (aunque no tengan 3D todavía) y la de
    // Flexfit se despublica: así la prueba no depende de los modelos.
    const { listed } = await seededCatalog(prisma);
    const restoreOthers = await setPublished(prisma, otherCaps, true);
    const restoreCap = await setPublished(prisma, [slug], false);
    const apparel = new Set([...listed.filter((product) => product.category === 'apparel').map((product) => product.slug), ...otherCaps]);
    apparel.delete(slug);
    try {
      await withFreshApp(async (fresh) => {
        const get = async (url: string) => (await request(fresh.getHttpServer()).get(url).expect(200)).body as unknown;

        const caps = productListSchema.parse(await get('/v1/products?category=apparel&subcategory=cap&locale=en'));
        expect(caps.items.map((item) => item.slug)).toEqual(otherCaps);
        expect(otherCaps).toEqual(['gorra-ny-marino', 'gorro-gris-canale']);
        expect(caps.items[0]).toMatchObject({ name: 'New York Yankees Cap', subcategory: 'cap', avatarSlot: 'head', sizeRange: { system: 'ONE', min: 'OS', max: 'OS' } });
        const sneakerCaps = productListSchema.parse(await get('/v1/products?category=sneaker&subcategory=cap'));
        expect(sneakerCaps.items).toEqual([]);

        const categories = categoryListSchema.parse(await get('/v1/categories'));
        const facet = categories.items.find((item) => item.slug === 'apparel');
        expect(facet?.productCount).toBe(apparel.size);
        expect(facet?.subcategories.find((item) => item.slug === 'cap')).toEqual({ slug: 'cap', productCount: 2 });

        // Flexfit se queda sin productos publicados: se oculta.
        const brands = brandListSchema.parse(await get('/v1/brands'));
        expect(brands.items.some((item) => item.slug === 'flexfit')).toBe(false);
        await request(fresh.getHttpServer()).get(`/v1/products/${slug}`).expect(404);
      });
    } finally {
      await restoreCap();
      await restoreOthers();
    }
  });

  it('una prenda publicada sin modelo 3D ni hotspots cumple el contrato', async () => {
    const slug = 'mochila-negra';
    // Se publica sin 3D a propósito, tenga o no su modelo en el manifest.
    const before = await prisma.product.findUniqueOrThrow({ where: { slug }, select: { modelId: true } });
    const restore = await setPublished(prisma, [slug], true);
    await prisma.product.update({ where: { slug }, data: { modelId: null } });
    try {
      await withFreshApp(async (fresh) => {
        const bag = productDetailSchema.parse((await request(fresh.getHttpServer()).get(`/v1/products/${slug}?locale=en`).expect(200)).body);
        expect(bag.model).toBeNull();
        expect(bag.hotspots).toEqual([]);
        expect(bag.sizes.map((size) => `${size.system}:${size.label}`)).toEqual(['ONE:OS']);
      });
    } finally {
      await prisma.product.update({ where: { slug }, data: { modelId: before.modelId } });
      await restore();
    }
  });

  it('la base exige subcategoría en la ropa y la reserva (con el lugar en el avatar) a la ropa', async () => {
    const brand = await prisma.brand.findUniqueOrThrow({ where: { slug: 'airspace' } });
    const data = { brandId: brand.id, priceCents: 1000, published: false };
    await expect(prisma.product.create({ data: { ...data, slug: 'test-apparel-no-sub', reference: 'AS-T90', category: 'apparel' } })).rejects.toThrow();
    await expect(prisma.product.create({ data: { ...data, slug: 'test-sneaker-sub', reference: 'AS-T91', category: 'sneaker', subcategory: 'tshirt' } })).rejects.toThrow();
    await expect(prisma.product.create({ data: { ...data, slug: 'test-sneaker-slot', reference: 'AS-T92', category: 'sneaker', avatarSlot: 'top' } })).rejects.toThrow();
    expect(await prisma.product.count({ where: { slug: { startsWith: 'test-' } } })).toBe(0);
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
