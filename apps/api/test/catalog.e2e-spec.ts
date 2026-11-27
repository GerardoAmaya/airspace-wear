import {
  apiErrorSchema,
  brandListSchema,
  CATEGORIES,
  categoryListSchema,
  type ProductDetail,
  productDetailSchema,
  type ProductList,
  productListSchema,
  SUBCATEGORIES,
} from '@airspace/contracts';
import request from 'supertest';
import { APPAREL_PRODUCTS } from '../prisma/seed/apparel.js';
import { BRANDS, FEATURED, PUBLISHED_PRODUCTS as PRODUCTS } from '../prisma/seed/catalog.js';
import {
  createTestApp,
  prismaOf,
  PUBLIC_CACHE_CONTROL,
  type TestApp,
} from './support/app.js';
import { seededCatalog, setPublished } from './support/catalog.js';

// Catálogo de lectura contra airspace_test recién sembrada (ver
// test/support/global-setup.ts). PRODUCTS son los productos publicados del
// seed (un borrador, published: false, no se lista). El seed oculta los que
// esperan su modelo 3D (hoy, la ropa); antes de leer, este archivo los
// publica sin 3D para cubrir el catálogo completo, sin importar cuántos
// modelos haya ya en el manifest, y al final los deja como estaban (la regla
// del seed se prueba en catalog-mutations.e2e-spec.ts). Una sola app (y su
// caché de 60 s) sirve para todas las pruebas, porque los datos ya no
// cambian después del beforeAll.

describe('Catálogo (integración)', () => {
  let app: TestApp;
  let models = new Set<string>();
  let restore: () => Promise<void> = async () => {};

  beforeAll(async () => {
    app = await createTestApp();
    const prisma = prismaOf(app);
    const seeded = await seededCatalog(prisma);
    models = seeded.models;
    restore = await setPublished(prisma, seeded.pending.map((product) => product.slug), true);
  });

  afterAll(async () => {
    await restore();
    await app.close();
  });

  const get = (url: string) => request(app.getHttpServer()).get(url);

  async function list(query = ''): Promise<ProductList> {
    const response = await get(`/v1/products${query}`).expect(200);
    expect(response.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL);
    return productListSchema.parse(response.body);
  }

  async function detail(slug: string, query = ''): Promise<ProductDetail> {
    const response = await get(`/v1/products/${slug}${query}`).expect(200);
    expect(response.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL);
    return productDetailSchema.parse(response.body);
  }

  async function expectError(url: string, status: number, code: string) {
    const response = await get(url).expect(status);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = apiErrorSchema.parse(response.body);
    expect(body.code).toBe(code);
    return body;
  }

  describe('GET /v1/products', () => {
    it('usa español por defecto y trae todo el catálogo publicado', async () => {
      const body = await list();
      expect(body.locale).toBe('es');
      expect(body.items).toHaveLength(PRODUCTS.length);
      const jordan = body.items.find((item) => item.slug === 'air-jordan-1');
      expect(jordan?.colorway).toBe('Negro y vela');
      expect(jordan?.tagline).toBe(PRODUCTS[0]?.text.es.tagline);
    });

    it('con locale=en devuelve nombres y taglines en inglés', async () => {
      const body = await list('?locale=en');
      expect(body.locale).toBe('en');
      const jordan = body.items.find((item) => item.slug === 'air-jordan-1');
      expect(jordan?.colorway).toBe('Black and sail');
      for (const item of body.items) {
        const seed = PRODUCTS.find((product) => product.slug === item.slug);
        expect(item.name).toBe(seed?.text.en.name);
        expect(item.tagline).toBe(seed?.text.en.tagline);
      }
    });

    it('filtra por categoría, por marca y por ambas', async () => {
      const balls = await list('?category=ball');
      expect(balls.items).toHaveLength(5);
      expect(balls.items.every((item) => item.category === 'ball')).toBe(true);

      const nike = await list('?brand=nike');
      expect(nike.items.map((item) => item.slug).sort()).toEqual([
        'air-jordan-1',
        'air-jordan-1-low-dior',
        'air-jordan-1-mid-particle-beige',
        'hoodie-nike-air-negro',
        'hoodie-nike-blanco',
        'hoodie-nike-turquesa-mujer',
        'jordan-4-black-cat',
        'jordan-4-travis-scott',
        'jordan-4-university-blue',
        'nike-air-max-270',
        'nike-air-max-pre-day',
        'nike-air-uptempo',
        'nike-defy-all-day',
        'nike-dunk-high-hawaii',
        'nike-pegasus-36',
        'nike-quest-running',
        'nike-react-presto',
        'nike-structure-plus',
        'sudadera-nike-club-fleece',
      ]);

      const nikeBalls = await list('?brand=nike&category=ball');
      expect(nikeBalls.items).toEqual([]);

      const adidasSneakers = await list('?brand=adidas&category=sneaker');
      expect(adidasSneakers.items).toHaveLength(9);
      expect(
        adidasSneakers.items.every(
          (item) => item.brand.slug === 'adidas' && item.category === 'sneaker',
        ),
      ).toBe(true);

      // La ropa sale en el orden de APPAREL_PRODUCTS (después del calzado).
      const apparel = await list('?category=apparel');
      expect(apparel.items.map((item) => item.slug)).toEqual(APPAREL_PRODUCTS.map((product) => product.slug));
      const caps = await list('?category=apparel&subcategory=cap');
      expect(caps.items.map((item) => item.slug)).toEqual(APPAREL_PRODUCTS.filter((product) => product.subcategory === 'cap').map((product) => product.slug));
    });

    it('filtra los tacos (cleat) aparte de los sneakers', async () => {
      const cleats = await list('?category=cleat');
      expect(cleats.items.map((item) => item.slug)).toEqual(['adidas-football-boot']);
      const en = await list('?category=cleat&locale=en');
      expect(en.items[0]?.name).toBe('Adidas Football Boots');
      expect(en.items[0]?.sizeRange).toEqual({ system: 'EU', min: '38', max: '46' });

      const sneakers = await list('?category=sneaker');
      expect(sneakers.items.some((item) => item.category === 'cleat')).toBe(false);
    });

    it('ordena como la vitrina: FEATURED primero y luego el resto del seed', async () => {
      const body = await list();
      const rank = (slug: string) => (FEATURED.includes(slug) ? FEATURED.indexOf(slug) : FEATURED.length);
      const expected = [...PRODUCTS].sort((a, b) => rank(a.slug) - rank(b.slug)).map((product) => product.slug);
      expect(body.items.map((item) => item.slug)).toEqual(expected);
      expect(body.items.slice(0, 2).map((item) => item.slug)).toEqual(['jordan-4-travis-scott', 'nike-dunk-high-hawaii']);
    });

    it('cada producto con modelo cargado trae su 3D hero y lite, y el resto ninguno', async () => {
      const body = await list();
      for (const item of body.items) {
        const seed = PRODUCTS.find((product) => product.slug === item.slug);
        if (!seed?.model || !models.has(seed.model)) {
          expect(item.model).toBeNull();
          continue;
        }
        expect(item.model).not.toBeNull();
        expect(item.model?.heroUrl).toBe(`/models/${item.model?.slug}.glb`);
        expect(item.model?.liteUrl).toBe(
          `/models/${item.model?.slug}-lite.glb`,
        );
        expect(item.model?.heroBytes).toBeGreaterThan(0);
        expect(item.model?.liteBytes).toBeGreaterThan(0);
      }
    });
  });

  describe('GET /v1/products/:slug', () => {
    it('devuelve textos distintos en cada idioma', async () => {
      const es = await detail('air-jordan-1');
      const en = await detail('air-jordan-1', '?locale=en');
      expect(es.locale).toBe('es');
      expect(en.locale).toBe('en');
      expect(es.description).not.toBe(en.description);
      expect(es.tagline).not.toBe(en.tagline);
      expect(es.colorway).toBe('Negro y vela');
      expect(en.colorway).toBe('Black and sail');
      // Lo que no depende del idioma es igual.
      expect(en.price).toEqual(es.price);
      expect(en.sizes).toEqual(es.sizes);
    });

    it('las tallas solo exponen el nivel de existencias, nunca números', async () => {
      const body = await get('/v1/products/air-jordan-1').expect(200);
      const sizes = (body.body as { sizes: Record<string, unknown>[] }).sizes;
      expect(sizes).toHaveLength(10);
      for (const size of sizes) {
        expect(Object.keys(size).sort()).toEqual(['label', 'stock', 'system']);
        expect(['in_stock', 'low', 'out']).toContain(size.stock);
      }
    });

    it('air-jordan-1 trae 4 hotspots con títulos en inglés bajo en', async () => {
      const en = await detail('air-jordan-1', '?locale=en');
      expect(en.hotspots.map((hotspot) => hotspot.key)).toEqual([
        'swoosh',
        'toe',
        'collar',
        'sole',
      ]);
      expect(en.hotspots.map((hotspot) => hotspot.title)).toEqual([
        'Leather Swoosh',
        'Perforated toe',
        'Padded collar',
        'Rubber outsole',
      ]);
      const es = await detail('air-jordan-1');
      expect(es.hotspots[0]?.title).toBe('Swoosh de cuero');
    });

    it('la ropa expone subcategoría, lugar en el avatar y tallas de letra o talla única', async () => {
      const hoodie = await detail('sudadera-nike-club-fleece', '?locale=en');
      expect(hoodie).toMatchObject({ category: 'apparel', subcategory: 'sweatshirt', avatarSlot: 'top' });
      expect(hoodie.sizes.map((size) => `${size.system}:${size.label}`)).toEqual(['ALPHA:S', 'ALPHA:M', 'ALPHA:L', 'ALPHA:XL']);
      const cap = await detail('gorra-ny-59fifty-marino');
      expect(cap).toMatchObject({ subcategory: 'cap', avatarSlot: 'head' });
      expect(cap.sizes.map((size) => `${size.system}:${size.label}`)).toEqual(['ONE:OS']);
      // Solo las prendas ajustadas llevan lugar en el avatar; el resto es de catálogo.
      const jacket = await detail('chaqueta-varsity');
      expect(jacket.avatarSlot).toBeNull();
    });

    it('el calzado expone subcategoría y lugar en el avatar en null', async () => {
      const jordan = await detail('air-jordan-1');
      expect(jordan).toMatchObject({ subcategory: null, avatarSlot: null });
      expect(jordan.sizes.every((size) => size.system === 'EU')).toBe(true);
    });

    it('un producto sin hotspots devuelve []', async () => {
      const ball = await detail('adidas-telstar-1970');
      expect(ball.hotspots).toEqual([]);
    });

    it('adidas-sambae (últimos pares) no tiene tallas in_stock', async () => {
      const sambae = await detail('adidas-sambae');
      expect(sambae.availability).toBe('low_stock');
      expect(sambae.sizes.length).toBeGreaterThan(0);
      expect(sambae.sizes.some((size) => size.stock === 'in_stock')).toBe(
        false,
      );
    });
  });

  describe('errores', () => {
    it('un slug desconocido responde 404 not_found sin caché', async () => {
      const body = await expectError(
        '/v1/products/no-existe',
        404,
        'not_found',
      );
      expect(body).toEqual({ code: 'not_found' });
    });

    it.each([
      ['slug inválido', '/v1/products/Air_Jordan!'],
      ['locale=fr en el detalle', '/v1/products/air-jordan-1?locale=fr'],
      ['locale=fr en el listado', '/v1/products?locale=fr'],
      ['category=shoes', '/v1/products?category=shoes'],
      ['category=cleats (plural)', '/v1/products?category=cleats'],
      ['subcategory=socks', '/v1/products?category=apparel&subcategory=socks'],
    ])('%s responde 400 invalid_request con issues', async (_label, url) => {
      const body = await expectError(url, 400, 'invalid_request');
      expect(body.issues?.length).toBeGreaterThan(0);
    });
  });

  describe('facetas', () => {
    it('GET /v1/brands cuenta productos publicados por marca', async () => {
      const response = await get('/v1/brands').expect(200);
      expect(response.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL);
      const body = brandListSchema.parse(response.body);
      // Orden por nombre con la intercalación de la base (mayúsculas primero:
      // AIRSPACE va antes que Adidas).
      // Los conteos salen del seed: agregar productos no rompe la prueba.
      const order = ['airspace', 'adidas', 'converse', 'dior', 'flexfit', 'geff', 'hoka', 'new-balance', 'new-york-yankees', 'nike', 'on', 'salomon', 'vans'];
      expect(body.items).toEqual(
        order.map((slug) => ({
          slug,
          name: BRANDS.find((brand) => brand.slug === slug)?.name,
          productCount: PRODUCTS.filter((product) => product.brand === slug).length,
        })),
      );
    });

    it('GET /v1/categories cuenta cada categoría y las subcategorías de la ropa', async () => {
      const response = await get('/v1/categories').expect(200);
      expect(response.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL);
      const body = categoryListSchema.parse(response.body);
      const count = (match: (product: (typeof PRODUCTS)[number]) => boolean) => PRODUCTS.filter(match).length;
      expect(body.items.map(({ slug, productCount }) => ({ slug, productCount }))).toEqual(
        CATEGORIES.map((slug) => ({ slug, productCount: count((product) => product.category === slug) })),
      );
      // La ropa trae sus subcategorías con su conteo; las demás, ninguna.
      const apparel = body.items.find((item) => item.slug === 'apparel');
      expect(apparel?.subcategories).toEqual(
        SUBCATEGORIES.map((slug) => ({ slug, productCount: count((product) => product.category === 'apparel' && product.subcategory === slug) })),
      );
      expect(body.items.filter((item) => item.slug !== 'apparel').every((item) => item.subcategories.length === 0)).toBe(true);
    });
  });

  it('una ruta fuera de /v1 responde 404 en JSON, sin caché', async () => {
    for (const path of ['/', '/health/x', '/products']) {
      const response = await request(app.getHttpServer()).get(path).expect(404);
      expect(response.body).toEqual({ code: 'not_found' });
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('una marca con slug válido pero inexistente devuelve una lista vacía', async () => {
    const response = await request(app.getHttpServer()).get('/v1/products?brand=puma').expect(200);
    expect(response.body.items).toEqual([]);
  });

  it('el detalle expone el lado externo del modelo y encuadres tipados', async () => {
    const response = await request(app.getHttpServer()).get('/v1/products/air-jordan-1?locale=en').expect(200);
    expect(response.body.model.lateralSideFacing).toBe('+z');
    expect(response.body.hotspots[0].view.camera.zoom).toBeGreaterThan(0);
  });
});
