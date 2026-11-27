import type { ProductCard } from '@airspace/contracts';
import type { APIRequestContext, Page } from '@playwright/test';
import { type CatalogState, facetProducts, searchText, sortProducts } from '../lib/catalog-query';
import { PAGE_SIZE } from '../lib/pagination';
import { en, es, expect, test, translate, waitForApp } from './fixtures';

// Barra de filtros del catálogo: buscador (?q=, sin tildes, con espera al
// escribir y Enter inmediato), categorías como control segmentado, menús
// Marca y Ordenar (teclado y aria), píldoras con ×, estado vacío, paginación
// con búsqueda y la hoja "Filtros" del teléfono. Los conteos esperados salen
// de la API con la misma lógica de la página (lib/catalog-query).

const API = 'http://127.0.0.1:4000';
type Code = 'es' | 'en';
const MESSAGES = { es, en } as const;

async function catalog(request: APIRequestContext, code: Code): Promise<ProductCard[]> {
  const response = await request.get(`${API}/v1/products?locale=${code}`);
  return ((await response.json()) as { items: ProductCard[] }).items;
}

// Resultados esperados para un estado, ordenados como la página.
async function expected(request: APIRequestContext, code: Code, state: CatalogState): Promise<ProductCard[]> {
  const { Catalog } = MESSAGES[code];
  const items = await catalog(request, code);
  const text = (product: ProductCard) =>
    searchText(product, { category: Catalog.category[product.category], subcategory: product.subcategory ? Catalog.subcategory[product.subcategory] : undefined });
  return sortProducts(facetProducts(items, state, text).results, state.sort, code);
}

const cards = (page: Page) => page.getByRole('main').getByRole('article');
const status = (page: Page) => page.getByRole('main').getByRole('status');
const searchBox = (page: Page, code: Code = 'es') => page.getByRole('searchbox', { name: MESSAGES[code].Catalog.searchLabel });
const countText = (code: Code, total: number) =>
  total > PAGE_SIZE ? translate(code, 'Catalog.resultRange', { start: 1, end: PAGE_SIZE, total }) : translate(code, 'Catalog.resultCount', { count: total });

for (const { code, query } of [
  { code: 'es', query: 'jordan' },
  { code: 'en', query: 'gazelle' },
  { code: 'es', query: 'sudadera' },
] as const) {
  test(`search /${code}: typing "${query}" filters after a pause, keeps the focus and adds a pill`, async ({ page, request }) => {
    const results = await expected(request, code, { q: query });
    expect(results.length).toBeGreaterThan(0);
    await page.goto(`/${code}/catalog`);
    await waitForApp(page);
    const input = searchBox(page, code);
    await input.click();
    await input.pressSequentially(query, { delay: 40 });
    await expect(page).toHaveURL(new RegExp(`/${code}/catalog\\?q=${query}$`));
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(query);
    await expect(status(page)).toHaveText(countText(code, results.length));
    await expect(cards(page)).toHaveCount(Math.min(results.length, PAGE_SIZE));
    await expect(cards(page).first().getByRole('heading')).toHaveText(results[0]!.name);

    // La píldora quita la búsqueda y vacía el campo.
    const pills = page.getByRole('list', { name: MESSAGES[code].Catalog.activeFiltersLabel });
    const pill = pills.getByRole('link', { name: translate(code, 'Catalog.removeFilter', { label: translate(code, 'Catalog.queryPill', { q: query }) }) });
    await pill.click();
    await expect(page).toHaveURL(new RegExp(`/${code}/catalog$`));
    await expect(input).toHaveValue('');
    await expect(pills).toHaveCount(0);
  });
}

test('search: accent-insensitive, Enter is immediate, other filters stay and the page resets', async ({ page, request }) => {
  // "balon" encuentra "Balones" (sin tilde) dentro de los balones de Adidas.
  const results = await expected(request, 'es', { q: 'balon', brand: 'adidas' });
  expect(results.length).toBeGreaterThan(0);
  await page.goto('/es/catalog?brand=adidas&page=2');
  await waitForApp(page);
  const input = searchBox(page);
  await input.fill('balón');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/es\/catalog\?q=bal%C3%B3n&brand=adidas$/);
  await expect(status(page)).toHaveText(countText('es', results.length));
  // Sin JS es un formulario GET real que conserva los demás filtros.
  const form = page.getByRole('search');
  await expect(form).toHaveAttribute('method', 'get');
  await expect(form).toHaveAttribute('action', '/es/catalog');
  await expect(form.locator('input[type="hidden"][name="brand"]')).toHaveValue('adidas');
  // Escape borra la búsqueda.
  await input.press('Escape');
  await expect(page).toHaveURL(/\/es\/catalog\?brand=adidas$/);
  await expect(input).toHaveValue('');
  // Las vistas con búsqueda apuntan su canónica al catálogo completo.
  await page.goto('/es/catalog?q=jordan');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/es\/catalog$/);
});

test('search: pagination works on the search results', async ({ page, request }) => {
  const results = await expected(request, 'es', { q: 'air' });
  test.skip(results.length <= PAGE_SIZE, 'La búsqueda "air" cabe en una página.');
  await page.goto('/es/catalog?q=air');
  await waitForApp(page);
  const next = page.getByRole('navigation', { name: es.Catalog.paginationLabel }).getByRole('link', { name: es.Catalog.nextPage });
  await expect(next).toHaveAttribute('href', '/es/catalog?q=air&page=2');
  await next.click();
  await expect(page).toHaveURL(/\/es\/catalog\?q=air&page=2$/);
  await expect(cards(page)).toHaveCount(Math.min(results.length - PAGE_SIZE, PAGE_SIZE));
  await expect(cards(page).first().getByRole('heading')).toHaveText(results[PAGE_SIZE]!.name);
  await expect(searchBox(page)).toHaveValue('air');
});

test('brand menu: keyboard, aria, no layout shift, and brand plus category', async ({ page, request }) => {
  await page.goto('/es/catalog');
  await waitForApp(page);
  const button = page.getByRole('button', { name: new RegExp(`^${es.Catalog.brandLabel}`) });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  const before = await status(page).boundingBox();

  await button.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu', { name: es.Catalog.brandLabel });
  await expect(menu).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  // El foco va a la opción elegida ("Todas las marcas").
  const all = menu.getByRole('menuitemradio', { name: new RegExp(`^${es.Catalog.allBrands}`) });
  await expect(all).toBeFocused();
  await expect(all).toHaveAttribute('aria-checked', 'true');
  // Abrir el menú no mueve nada.
  expect((await status(page).boundingBox())!.y).toBe(before!.y);
  // Flechas, Fin y Escape (el foco vuelve al botón).
  await page.keyboard.press('ArrowDown');
  await expect(all).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();

  // La inicial salta a la marca y Enter la elige.
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await page.keyboard.press('n');
  const newBalance = menu.getByRole('menuitemradio', { name: /^New Balance,/ });
  await expect(newBalance).toBeFocused();
  await page.keyboard.press('n');
  await expect(menu.getByRole('menuitemradio', { name: /^New York Yankees,/ })).toBeFocused();
  await page.keyboard.press('n');
  const nike = menu.getByRole('menuitemradio', { name: /^Nike,/ });
  await expect(nike).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/es\/catalog\?brand=nike$/);
  await expect(button).toContainText('Nike');
  await expect(button).toBeFocused();
  const nikeOnly = await expected(request, 'es', { brand: 'nike' });
  await expect(status(page)).toHaveText(countText('es', nikeOnly.length));

  // Marca más categoría: el segmento conserva la marca y cuenta con ella.
  const sneakers = await expected(request, 'es', { brand: 'nike', category: 'sneaker' });
  const segment = page.getByRole('list', { name: es.Catalog.categoryLabel }).getByRole('link', { name: new RegExp(`^${es.Catalog.category.sneaker}`) });
  await expect(segment).toContainText(String(sneakers.length));
  await segment.click();
  await expect(page).toHaveURL(/\/es\/catalog\?category=sneaker&brand=nike$/);
  await expect(segment).toHaveAttribute('aria-current', 'true');
  await expect(status(page)).toHaveText(countText('es', sneakers.length));
  // Un clic fuera cierra el menú.
  await button.click();
  await expect(menu).toBeVisible();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(menu).toBeHidden();
});

test('sort menu: price low to high and high to low, name A-Z', async ({ page, request }) => {
  await page.goto('/es/catalog?category=sneaker');
  await waitForApp(page);
  const button = page.getByRole('button', { name: new RegExp(`^${es.Catalog.sortLabel}`) });
  await expect(button).toContainText(es.Catalog.sortOption.featured);
  for (const [sort, label] of [
    ['price-asc', es.Catalog.sortOption.priceAsc],
    ['price-desc', es.Catalog.sortOption.priceDesc],
    ['name', es.Catalog.sortOption.name],
  ] as const) {
    await button.click();
    await page.getByRole('menu', { name: es.Catalog.sortLabel }).getByRole('menuitemradio', { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`/es/catalog\\?category=sneaker&sort=${sort}$`));
    await expect(button).toContainText(label);
    const results = await expected(request, 'es', { category: 'sneaker', sort });
    await expect(cards(page).getByRole('heading')).toHaveText(results.slice(0, PAGE_SIZE).map((item) => item.name));
  }
  // Los filtros conservan el orden; el orden no es una píldora.
  await expect(page.getByRole('list', { name: es.Catalog.activeFiltersLabel }).getByRole('link')).toHaveCount(2);
});

test('pills: each × removes its filter and "Clear all" keeps only the sort', async ({ page }) => {
  await page.goto('/es/catalog?q=gazelle&category=sneaker&brand=adidas&sort=price-asc');
  await waitForApp(page);
  const pills = page.getByRole('list', { name: es.Catalog.activeFiltersLabel });
  const remove = (label: string) => pills.getByRole('link', { name: translate('es', 'Catalog.removeFilter', { label }) });
  await expect(remove(translate('es', 'Catalog.queryPill', { q: 'gazelle' }))).toBeVisible();
  await expect(remove(es.Catalog.category.sneaker)).toBeVisible();
  await remove('Adidas').click();
  await expect(page).toHaveURL(/\/es\/catalog\?q=gazelle&category=sneaker&sort=price-asc$/);
  await pills.getByRole('link', { name: es.Catalog.clearAll }).click();
  await expect(page).toHaveURL(/\/es\/catalog\?sort=price-asc$/);
  await expect(pills).toHaveCount(0);
  await expect(searchBox(page)).toHaveValue('');
});

test('empty state: no results for the query, clear filters and category suggestions', async ({ page }) => {
  await page.goto('/es/catalog?q=zzzz');
  await waitForApp(page);
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByText(translate('es', 'Catalog.emptyQuery', { q: 'zzzz' }))).toBeVisible();
  // Un solo mensaje a la vista: el conteo ("Sin resultados") queda como aviso
  // para lectores de pantalla, oculto a la vista.
  await expect(status(page)).toHaveText(translate('es', 'Catalog.resultCount', { count: 0 }));
  expect((await status(page).boundingBox())!.width).toBeLessThanOrEqual(1);
  await expect(page.getByRole('link', { name: es.Catalog.clearFilters })).toHaveAttribute('href', '/es/catalog');
  const suggestion = page.getByRole('main').getByRole('link', { name: new RegExp(`^${es.Catalog.category.ball}`) }).last();
  await expect(suggestion).toHaveAttribute('href', '/es/catalog?category=ball');
  await expect(page.getByRole('navigation', { name: es.Catalog.paginationLabel })).toHaveCount(0);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('filters sheet: opens, traps the focus, filters live, closes on Escape and restores the focus', async ({ page, request }) => {
    await page.goto('/es/catalog?category=apparel');
    await waitForApp(page);
    // Sin menús de escritorio; el buscador ocupa el ancho.
    await expect(page.getByRole('button', { name: new RegExp(`^${es.Catalog.brandLabel}`) })).toBeHidden();
    const box = await searchBox(page).boundingBox();
    expect(box!.width).toBeGreaterThan(330);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    const trigger = page.getByRole('button', { name: new RegExp(`^${es.Catalog.filtersButton}`) });
    await trigger.click();
    const sheet = page.getByRole('dialog', { name: es.Catalog.filtersLabel });
    await expect(sheet).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Tipos de prenda, marca y orden.
    await expect(sheet.getByRole('heading', { name: es.Catalog.subcategoryLabel })).toBeVisible();
    await expect(sheet.getByRole('heading', { name: es.Catalog.brandLabel })).toBeVisible();
    await expect(sheet.getByRole('heading', { name: es.Catalog.sortLabel })).toBeVisible();
    // El foco no sale de la hoja.
    for (let index = 0; index < 40; index += 1) await page.keyboard.press('Tab');
    expect(await sheet.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    // Elegir una marca filtra detrás sin cerrar la hoja.
    await sheet.getByRole('link', { name: /^AIRSPACE,/ }).click();
    await expect(page).toHaveURL(/\/es\/catalog\?category=apparel&brand=airspace$/);
    await expect(sheet).toBeVisible();
    const results = await expected(request, 'es', { category: 'apparel', brand: 'airspace' });
    await expect(sheet.getByRole('button', { name: translate('es', 'Catalog.showResults', { count: results.length }) })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
    // El botón dice cuántos filtros de la hoja hay puestos.
    await expect(trigger).toHaveAccessibleName(`${es.Catalog.filtersButton} ${translate('es', 'Catalog.activeCount', { count: 1 })}`);

    // "Ver N resultados" cierra y baja a la rejilla.
    await trigger.click();
    await sheet.getByRole('button', { name: translate('es', 'Catalog.showResults', { count: results.length }) }).click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('catalog-results')!.getBoundingClientRect().top))).toBeLessThan(160);

    // "Limpiar" quita marca, orden y tipo, y conserva la categoría. (Con
    // teclado: en desarrollo el indicador de Next tapa esa esquina.)
    await trigger.click();
    await sheet.getByRole('link', { name: es.Catalog.clearSheet, exact: true }).press('Enter');
    await expect(page).toHaveURL(/\/es\/catalog\?category=apparel$/);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });

  test('filters sheet: fades in place (no slide) with reduced motion', async ({ page }) => {
    await page.goto('/es/catalog');
    await waitForApp(page);
    await page.getByRole('button', { name: es.Catalog.filtersButton, exact: true }).click();
    const sheet = page.getByRole('dialog', { name: es.Catalog.filtersLabel });
    await expect(sheet).toBeVisible();
    // Sin desplazamiento: la hoja no se mueve en Y en ningún momento.
    expect(await sheet.evaluate((element) => getComputedStyle(element).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  });
});

// Sin JS, el contenido en streaming no se inserta (lo hace un script), así
// que el buscador vive en el cascarón estático: se ve y envía ?q=.
test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the search form renders in the static shell and submits the query', async ({ page }) => {
    await page.goto('/es/catalog');
    const input = searchBox(page);
    await expect(input).toBeVisible();
    await input.fill('jordan');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/es\/catalog\?q=jordan$/);
    await expect(searchBox(page)).toBeVisible();
  });
});
