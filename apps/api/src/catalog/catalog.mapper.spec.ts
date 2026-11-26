import { productCardSchema, productDetailSchema } from '@airspace/contracts';
import { CatalogDataError, stockLevel, toCard, toDetail } from './catalog.mapper.js';

// Fila como la devuelve Prisma con detailInclude (solo los campos usados).
function row() {
  return {
    id: 1,
    slug: 'air-jordan-1',
    reference: 'AS-001',
    category: 'sneaker' as const,
    brandId: 1,
    priceCents: 18000,
    currency: 'USD',
    availability: 'new' as const,
    attributes: { weightGrams: 450, stackMm: 32 },
    published: true,
    sortOrder: 0,
    imageUrl: null,
    accentDark: '#ac5ef7',
    accentLight: '#8f48d2',
    modelId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    brand: { slug: 'nike', name: 'Nike' },
    model: {
      id: 1,
      slug: 'air-jordan-1',
      heroUrl: '/models/air-jordan-1.glb',
      liteUrl: '/models/air-jordan-1-lite.glb',
      heroBytes: 1,
      liteBytes: 1,
      heroTriangles: 1,
      liteTriangles: 1,
      foot: 'right' as const,
      lateralSideFacing: 'plus_z' as const,
      posterDarkUrl: null,
      posterLightUrl: null,
      creditId: 1,
    },
    translations: [
      { productId: 1, locale: 'es' as const, name: 'Air Jordan 1', colorway: 'Negro y vela', tagline: 'es', description: 'es', edition: null, hostCity: null, materials: { upper: 'Cuero' }, tags: ['clásico'] },
      { productId: 1, locale: 'en' as const, name: 'Air Jordan 1', colorway: 'Black and sail', tagline: 'en', description: 'en', edition: null, hostCity: null, materials: { upper: 'Leather' }, tags: ['classic'] },
    ],
    sizes: [
      { system: 'EU', label: '38', stock: 0 },
      { system: 'EU', label: '39', stock: 2 },
      { system: 'EU', label: '40', stock: 9 },
    ],
    hotspots: [
      {
        id: 1,
        productId: 1,
        key: 'toe',
        sortOrder: 0,
        position: [0.105, 0.05, 0],
        view: { pose: { yaw: 0.9, pitch: 0, bank: 0.3 }, camera: { zoom: 1.1, elev: 0.1, focus: 0.3, shift: 0 }, slot: { side: 'right', y: 0.4 }, mobile: { zoom: 1, yaw: 0.8 } },
        translations: [
          { hotspotId: 1, locale: 'es' as const, title: 'Puntera', text: 'es' },
          { hotspotId: 1, locale: 'en' as const, title: 'Toe', text: 'en' },
        ],
      },
    ],
  };
}

describe('catalog mapper', () => {
  it('convierte existencias en niveles sin exponer números', () => {
    expect([0, -1, 1, 2, 3].map(stockLevel)).toEqual(['out', 'out', 'low', 'low', 'in_stock']);
  });

  it('arma la tarjeta en el idioma pedido y cumple el contrato', () => {
    const card = toCard(row(), 'en');
    expect(card).toMatchObject({ colorway: 'Black and sail', sizeRange: { system: 'EU', min: '38', max: '40' }, price: { amountCents: 18000, currency: 'USD' } });
    expect(productCardSchema.parse(card)).toEqual(card);
  });

  it('usa el español si falta la traducción pedida', () => {
    const data = row();
    data.translations = data.translations.filter((translation) => translation.locale === 'es');
    expect(toCard(data, 'en').colorway).toBe('Negro y vela');
  });

  it('arma el detalle con tallas, hotspots y materiales del idioma', () => {
    const detail = toDetail(row(), 'en');
    expect(detail.sizes.map((size) => size.stock)).toEqual(['out', 'low', 'in_stock']);
    expect(detail.hotspots[0]).toMatchObject({ key: 'toe', title: 'Toe', position: [0.105, 0.05, 0] });
    expect(detail.materials).toEqual({ upper: 'Leather' });
    expect(productDetailSchema.parse(detail)).toEqual(detail);
  });

  it('expone el lado externo del modelo como +z o -z', () => {
    expect(toCard(row(), 'es').model?.lateralSideFacing).toBe('+z');
  });

  it('rechaza un hotspot con encuadre o posición inválidos', () => {
    const badView = row();
    badView.hotspots[0]!.view = { camera: { zoom: 1 } } as never;
    expect(() => toDetail(badView, 'es')).toThrow(CatalogDataError);
    const badPosition = row();
    badPosition.hotspots[0]!.position = [0.1, 0.2];
    expect(() => toDetail(badPosition, 'es')).toThrow(CatalogDataError);
  });

  it('informa el idioma realmente usado si faltó la traducción', () => {
    const data = row();
    data.translations = data.translations.filter((translation) => translation.locale === 'es');
    expect(toDetail(data, 'en').locale).toBe('es');
  });

  it('un producto sin tallas no tiene rango', () => {
    const data = row();
    data.sizes = [];
    expect(toCard(data, 'es').sizeRange).toBeNull();
  });
});
