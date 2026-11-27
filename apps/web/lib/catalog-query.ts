import { type Category, categorySchema, type ProductCard, slugSchema, type Subcategory, subcategorySchema } from '@airspace/contracts';

// Estado del catálogo en la URL: búsqueda (?q), categoría, marca, tipo de
// prenda, orden (?sort) y página. Lo usan la página (servidor) y la barra de
// filtros (cliente), así los enlaces se arman igual en los dos lados.

export const SORTS = ['featured', 'price-asc', 'price-desc', 'name'] as const;
export type CatalogSort = (typeof SORTS)[number];

// Largo máximo de la búsqueda (lo que pase se recorta).
export const QUERY_MAX = 60;

export interface CatalogState {
  q?: string;
  category?: Category;
  brand?: string;
  subcategory?: Subcategory;
  // featured (el orden de la API) es el valor por defecto y no va en la URL.
  sort?: Exclude<CatalogSort, 'featured'>;
}

export type CatalogHref = { pathname: '/catalog'; query: Record<string, string> };

type RawQuery = Record<string, string | string[] | undefined>;

// Limpia la búsqueda: sin espacios de más y con un largo tope. Vacía = sin búsqueda.
export function cleanQuery(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const q = raw.replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX).trim();
  return q || undefined;
}

// Filtros válidos de la URL. Parámetros inválidos se ignoran (se muestra
// todo) en lugar de fallar. El tipo de prenda solo aplica dentro de la ropa.
export function parseCatalogState(query: RawQuery): CatalogState {
  const category = categorySchema.safeParse(query.category).data;
  const sort = SORTS.find((value) => value !== 'featured' && value === query.sort) as CatalogState['sort'];
  return {
    q: cleanQuery(query.q),
    category,
    brand: slugSchema.safeParse(query.brand).data,
    subcategory: category === 'apparel' ? subcategorySchema.safeParse(query.subcategory).data : undefined,
    sort,
  };
}

// Algún filtro activo (la búsqueda cuenta; el orden no filtra pero cambia la vista).
export function isFiltered(state: CatalogState): boolean {
  return Boolean(state.q ?? state.category ?? state.brand ?? state.subcategory ?? state.sort);
}

// Enlace del catálogo con este estado. Sin página: cambiar un filtro o la
// búsqueda vuelve a la 1. El tipo de prenda se pierde si se sale de la ropa.
export function catalogHref(state: CatalogState, page?: number): CatalogHref {
  const entries: [string, string | undefined][] = [
    ['q', state.q],
    ['category', state.category],
    ['brand', state.brand],
    ['subcategory', state.category === 'apparel' ? state.subcategory : undefined],
    ['sort', state.sort],
    ['page', page && page > 1 ? String(page) : undefined],
  ];
  return { pathname: '/catalog', query: Object.fromEntries(entries.filter((entry): entry is [string, string] => Boolean(entry[1]))) };
}

// Texto comparable: minúsculas y sin tildes ("Balón" = "balon").
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

// Texto donde busca cada producto, en el idioma de la página: nombre, marca,
// color, etiquetas, referencia y los nombres de su categoría y tipo de prenda
// (así "sudadera" encuentra también los hoodies).
export function searchText(product: ProductCard, labels: { category: string; subcategory?: string }): string {
  return normalizeText([product.name, product.brand.name, product.colorway ?? '', ...product.tags, product.reference, labels.category, labels.subcategory ?? ''].join(' '));
}

// Cada palabra de la búsqueda tiene que aparecer (en cualquier orden).
export function matchesQuery(text: string, q: string): boolean {
  return normalizeText(q)
    .split(' ')
    .filter(Boolean)
    .every((word) => text.includes(word));
}

// Orden estable: con el mismo precio se respeta el orden destacado.
export function sortProducts(products: ProductCard[], sort: CatalogState['sort'], locale: string): ProductCard[] {
  if (!sort) return products;
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const sorted = [...products];
  if (sort === 'price-asc') sorted.sort((a, b) => a.price.amountCents - b.price.amountCents);
  else if (sort === 'price-desc') sorted.sort((a, b) => b.price.amountCents - a.price.amountCents);
  else sorted.sort((a, b) => collator.compare(a.name, b.name));
  return sorted;
}

export interface CatalogFacets {
  // Resultados filtrados (sin ordenar).
  results: ProductCard[];
  // Conteos de cada opción con los demás filtros aplicados.
  all: number;
  categories: Partial<Record<Category, number>>;
  brands: Record<string, number>;
  subcategories: Partial<Record<Subcategory, number>>;
}

// Filtra la lista completa y cuenta cada opción con los otros filtros puestos
// (la categoría cuenta con búsqueda y marca; la marca, con búsqueda, categoría
// y tipo de prenda), así cada número dice cuántos resultados daría elegirla.
export function facetProducts(products: ProductCard[], state: CatalogState, text: (product: ProductCard) => string): CatalogFacets {
  const searched = state.q ? products.filter((product) => matchesQuery(text(product), state.q!)) : products;
  const inBrand = state.brand ? searched.filter((product) => product.brand.slug === state.brand) : searched;
  const inCategory = state.category ? inBrand.filter((product) => product.category === state.category) : inBrand;
  const results = state.subcategory ? inCategory.filter((product) => product.subcategory === state.subcategory) : inCategory;
  const forBrands = searched.filter((product) => (!state.category || product.category === state.category) && (!state.subcategory || product.subcategory === state.subcategory));

  const count = <K extends string>(items: ProductCard[], key: (product: ProductCard) => K | null) => {
    const counts: Partial<Record<K, number>> = {};
    for (const item of items) {
      const value = key(item);
      if (value) counts[value] = (counts[value] ?? 0) + 1;
    }
    return counts;
  };

  return {
    results,
    all: inBrand.length,
    categories: count(inBrand, (product) => product.category),
    brands: count(forBrands, (product) => product.brand.slug) as Record<string, number>,
    subcategories: count(
      inBrand.filter((product) => product.category === 'apparel'),
      (product) => product.subcategory,
    ),
  };
}
