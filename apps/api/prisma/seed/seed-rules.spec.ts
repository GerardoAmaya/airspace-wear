import { APPAREL_PRODUCTS } from './apparel.js';
import { BRANDS, PRODUCTS, type SeedProduct } from './catalog.js';
import { assertProductRules } from './index.js';

// Reglas del seed que el tipo SeedProduct no alcanza a expresar (tallas por
// categoría, letras en orden, subcategoría solo en la ropa).

const base: SeedProduct = {
  slug: 'test-garment',
  reference: 'AS-T01',
  category: 'apparel',
  subcategory: 'tshirt',
  brand: 'airspace',
  priceCents: 1000,
  availability: 'available',
  sizes: { system: 'ALPHA', labels: ['S', 'M', 'L', 'XL'] },
  attributes: {},
  text: {
    es: { name: 'Camiseta', tagline: 't', description: 'd', materials: {}, tags: [] },
    en: { name: 'T-shirt', tagline: 't', description: 'd', materials: {}, tags: [] },
  },
};

describe('reglas del seed', () => {
  it('todo el catálogo semilla cumple las reglas', () => {
    for (const product of PRODUCTS) expect(() => assertProductRules(product)).not.toThrow();
  });

  it('la ropa del seed usa marcas conocidas y tallas de letra o talla única', () => {
    const brands = new Set<string>(BRANDS.map((brand) => brand.slug));
    for (const product of APPAREL_PRODUCTS) {
      expect(product.category).toBe('apparel');
      expect(brands.has(product.brand)).toBe(true);
      expect(['ALPHA', 'ONE']).toContain(product.sizes.system);
    }
  });

  it('acepta tallas S a XL y talla única en la ropa', () => {
    expect(() => assertProductRules(base)).not.toThrow();
    expect(() => assertProductRules({ ...base, subcategory: 'cap', avatarSlot: 'head', sizes: { system: 'ONE' } })).not.toThrow();
  });

  it('rechaza letras fuera de orden, repetidas o vacías', () => {
    expect(() => assertProductRules({ ...base, sizes: { system: 'ALPHA', labels: ['M', 'S'] } })).toThrow(/fuera de orden/);
    expect(() => assertProductRules({ ...base, sizes: { system: 'ALPHA', labels: ['M', 'M'] } })).toThrow(/fuera de orden/);
    expect(() => assertProductRules({ ...base, sizes: { system: 'ALPHA', labels: [] } })).toThrow(/fuera de orden/);
  });

  it('rechaza un sistema de tallas que no corresponde a la categoría', () => {
    expect(() => assertProductRules({ ...base, sizes: { system: 'EU', from: 38, to: 46 } })).toThrow(/no usa tallas EU/);
    expect(() => assertProductRules({ ...base, category: 'sneaker', subcategory: undefined, sizes: { system: 'ALPHA', labels: ['S'] } })).toThrow(/no usa tallas ALPHA/);
  });

  it('la ropa necesita subcategoría y solo la ropa tiene subcategoría o lugar en el avatar', () => {
    expect(() => assertProductRules({ ...base, subcategory: undefined })).toThrow(/necesita subcategory/);
    const sneaker: SeedProduct = { ...base, category: 'sneaker', subcategory: undefined, sizes: { system: 'EU', from: 38, to: 46 } };
    expect(() => assertProductRules(sneaker)).not.toThrow();
    expect(() => assertProductRules({ ...sneaker, avatarSlot: 'top' })).toThrow(/solo de la ropa/);
    expect(() => assertProductRules({ ...sneaker, subcategory: 'tshirt' })).toThrow(/solo de la ropa/);
  });
});
