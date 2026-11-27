import type { Page } from '@playwright/test';
import { PAGE_SIZE } from '../lib/pagination';
import { en, es, expect, test, translate, waitForApp } from './fixtures';

// Paginación del catálogo: 12 por página con ?page=N en la URL, enlaces
// reales con rel prev y next, conteo "Mostrando 13 a 24 de 74", salto al
// inicio de los resultados, filtros que vuelven a la página 1, canónica,
// recarga, atrás y adelante, y la vista compacta del teléfono.

const API = 'http://127.0.0.1:4000';

async function catalogTotal(request: import('@playwright/test').APIRequestContext, query = ''): Promise<number> {
  const response = await request.get(`${API}/v1/products?locale=es${query}`);
  return ((await response.json()) as { items: unknown[] }).items.length;
}

const pager = (page: Page, messages: typeof es) => page.getByRole('navigation', { name: messages.Catalog.paginationLabel });
const cards = (page: Page) => page.getByRole('main').getByRole('article');
const resultsTop = (page: Page) => page.evaluate(() => Math.round(document.getElementById('catalog-results')!.getBoundingClientRect().top));
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

for (const { code, messages } of [
  { code: 'es', messages: es },
  { code: 'en', messages: en },
] as const) {
  test(`pagination /${code}: next goes to page 2 with its count, links and scroll`, async ({ page, request }) => {
    const total = await catalogTotal(request);
    const pages = Math.ceil(total / PAGE_SIZE);
    expect(pages).toBeGreaterThan(2);

    await page.goto(`/${code}/catalog`);
    await waitForApp(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE);
    await expect(page.getByRole('main').getByRole('status')).toHaveText(translate(code, 'Catalog.resultRange', { start: 1, end: PAGE_SIZE, total }));

    const nav = pager(page, messages);
    // Página 1: Anterior no es enlace; la actual tampoco, y lleva aria-current.
    await expect(nav.getByRole('link', { name: messages.Catalog.previousPage })).toHaveCount(0);
    await expect(nav.locator('[aria-current="page"]')).toHaveAccessibleName(translate(code, 'Catalog.pageLink', { page: 1 }));
    await expect(nav.getByRole('link', { name: translate(code, 'Catalog.pageLink', { page: pages }), exact: true })).toHaveAttribute('href', `/${code}/catalog?page=${pages}`);
    const next = nav.getByRole('link', { name: messages.Catalog.nextPage });
    await expect(next).toHaveAttribute('rel', 'next');
    await expect(next).toHaveAttribute('href', `/${code}/catalog?page=2`);

    const firstOnPage1 = await cards(page).first().getByRole('heading').textContent();
    await next.scrollIntoViewIfNeeded();
    expect(await resultsTop(page)).toBeLessThan(0);
    await next.click();

    await expect(page).toHaveURL(new RegExp(`/${code}/catalog\\?page=2$`));
    await expect(page.getByRole('main').getByRole('status')).toHaveText(translate(code, 'Catalog.resultRange', { start: PAGE_SIZE + 1, end: 2 * PAGE_SIZE, total }));
    await expect(cards(page)).toHaveCount(PAGE_SIZE);
    await expect(cards(page).first().getByRole('heading')).not.toHaveText(firstOnPage1 ?? '');
    // Aterriza al inicio de los resultados, bajo el encabezado fijo.
    await expect.poll(() => resultsTop(page)).toBeGreaterThanOrEqual(0);
    expect(await resultsTop(page)).toBeLessThan(160);
    await expect(nav.getByRole('link', { name: messages.Catalog.previousPage })).toHaveAttribute('rel', 'prev');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/${code}/catalog\\?page=2$`));
  });
}

test('pagination: the new page cards play their entrance', async ({ page }) => {
  await page.goto('/es/catalog');
  await waitForApp(page);
  // Anota la opacidad de las tarjetas de la rejilla nueva apenas se monta.
  await page.evaluate(() => {
    const win = window as unknown as { __opacities: number[] };
    win.__opacities = [];
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node instanceof HTMLElement && node.matches('ul[data-reveal]'))
            requestAnimationFrame(() => requestAnimationFrame(() => win.__opacities.push(...[...node.children].map((item) => Number(getComputedStyle(item).opacity)))));
    }).observe(document.querySelector('main')!, { subtree: true, childList: true });
  });
  await pager(page, es).getByRole('link', { name: es.Catalog.nextPage }).click();
  await expect(page).toHaveURL(/\?page=2$/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opacities: number[] }).__opacities.length)).toBe(PAGE_SIZE);
  // Recién montadas, empiezan ocultas (entran con la animación)...
  const opacities = await page.evaluate(() => (window as unknown as { __opacities: number[] }).__opacities);
  expect(Math.min(...opacities)).toBeLessThan(0.5);
  // ...y terminan visibles.
  await expect(cards(page).first()).toBeVisible();
  await expect.poll(() => cards(page).first().evaluate((card) => Number(getComputedStyle(card.closest('li')!).opacity))).toBe(1);
});

test('pagination: the last page, and out of range or invalid pages redirect', async ({ page, request }) => {
  const total = await catalogTotal(request);
  const last = Math.ceil(total / PAGE_SIZE);

  await page.goto(`/es/catalog?page=${last}`);
  await waitForApp(page);
  await expect(cards(page)).toHaveCount(total - (last - 1) * PAGE_SIZE);
  const nav = pager(page, es);
  await expect(nav.getByRole('link', { name: es.Catalog.nextPage })).toHaveCount(0);
  await expect(nav.locator('[aria-current="page"]')).toHaveAccessibleName(translate('es', 'Catalog.pageLink', { page: last }));

  await page.goto('/es/catalog?page=999');
  await expect(page).toHaveURL(new RegExp(`/es/catalog\\?page=${last}$`));
  for (const bad of ['abc', '0', '-2', '1']) {
    await page.goto(`/es/catalog?page=${bad}`);
    await expect(page).toHaveURL(/\/es\/catalog$/);
  }
  // Son redirecciones HTTP de verdad (proxy.ts), no un 200 que redirige en
  // el cliente: 308 cuando el valor no sirve, 307 a la última página.
  for (const [path, status, target] of [
    ['/es/catalog?page=999', 307, new RegExp(`/es/catalog\\?page=${last}$`)],
    ['/es/catalog?page=abc&brand=nike', 308, /\/es\/catalog\?brand=nike$/],
    ['/en/catalog?q=jordan&page=9', 307, /\/en\/catalog\?q=jordan$/],
  ] as const) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(status);
    expect(response.headers()['location'], path).toMatch(target);
  }
  expect((await request.get(`/es/catalog?page=${last}`, { maxRedirects: 0 })).status()).toBe(200);
});

test('pagination: filters reset to page 1, keep the page in their own pager, and one item has no pager', async ({ page, request }) => {
  const nike = await catalogTotal(request, '&brand=nike');
  const cleats = await catalogTotal(request, '&category=cleat');

  await page.goto('/es/catalog?page=2');
  await waitForApp(page);
  await page.getByRole('button', { name: new RegExp(`^${es.Catalog.brandLabel}`) }).click();
  await page.getByRole('menu', { name: es.Catalog.brandLabel }).getByRole('menuitemradio', { name: /^Nike,/ }).click();
  await expect(page).toHaveURL(/\/es\/catalog\?brand=nike$/);
  await expect(cards(page)).toHaveCount(Math.min(nike, PAGE_SIZE));

  if (nike > PAGE_SIZE) {
    const next = pager(page, es).getByRole('link', { name: es.Catalog.nextPage });
    await expect(next).toHaveAttribute('href', '/es/catalog?brand=nike&page=2');
    await next.click();
    await expect(page).toHaveURL(/\/es\/catalog\?brand=nike&page=2$/);
    await expect(cards(page)).toHaveCount(Math.min(nike - PAGE_SIZE, PAGE_SIZE));
    // Las vistas filtradas apuntan su canónica al catálogo completo.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/es\/catalog$/);
  }

  await page.goto('/es/catalog?category=cleat');
  await waitForApp(page);
  await expect(cards(page)).toHaveCount(cleats);
  expect(cleats).toBeLessThanOrEqual(PAGE_SIZE);
  await expect(pager(page, es)).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('status')).toHaveText(translate('es', 'Catalog.resultCount', { count: cleats }));
});

test('pagination: reload on page 2 keeps the page and the position; back and forward switch pages', async ({ page }) => {
  await page.goto('/es/catalog');
  await waitForApp(page);
  const firstOnPage1 = await cards(page).first().getByRole('heading').textContent();
  await pager(page, es).getByRole('link', { name: es.Catalog.nextPage }).click();
  await expect(page).toHaveURL(/\?page=2$/);
  const firstOnPage2 = await cards(page).first().getByRole('heading').textContent();
  await expect.poll(() => resultsTop(page)).toBeGreaterThanOrEqual(0);
  // La página nueva puede llegar antes de que termine el salto suave: se
  // espera a que Lenis acabe para no pisarlo con el scroll de la prueba.
  await expect(page.locator('html')).not.toHaveClass(/lenis-scrolling/);

  const target = 900;
  await page.evaluate((top) => window.scrollTo(0, top), target);
  await expect.poll(() => scrollY(page)).toBe(target);
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page).toHaveURL(/\?page=2$/);
  await expect.poll(() => scrollY(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(target - 2);
  expect(Math.abs((await scrollY(page)) - target)).toBeLessThanOrEqual(2);
  await expect(page.locator('html')).not.toHaveClass(/restoring/);
  await expect(cards(page).first().getByRole('heading')).toHaveText(firstOnPage2 ?? '');

  await page.goBack();
  await expect(page).toHaveURL(/\/es\/catalog$/);
  await expect(cards(page).first().getByRole('heading')).toHaveText(firstOnPage1 ?? '');
  await page.goForward();
  await expect(page).toHaveURL(/\?page=2$/);
  await expect(cards(page).first().getByRole('heading')).toHaveText(firstOnPage2 ?? '');
});

test('pagination: a card on page 2 opens its product with the morph and back returns to page 2', async ({ page }) => {
  await page.addInitScript(() => {
    const original = document.startViewTransition?.bind(document);
    (window as unknown as { __transitions: number }).__transitions = 0;
    if (original) {
      document.startViewTransition = ((...args: Parameters<typeof original>) => {
        (window as unknown as { __transitions: number }).__transitions += 1;
        return original(...args);
      }) as typeof document.startViewTransition;
    }
  });
  await page.goto('/es/catalog?page=2');
  await waitForApp(page);
  const link = cards(page).first().getByRole('link');
  const href = await link.getAttribute('href');
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __transitions: number }).__transitions)).toBeGreaterThan(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/es\/catalog\?page=2$/);
  await expect(cards(page)).toHaveCount(PAGE_SIZE);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('pagination: compact pager and two columns', async ({ page, request }) => {
    const total = await catalogTotal(request);
    const pages = Math.ceil(total / PAGE_SIZE);
    await page.goto('/es/catalog?page=2');
    await waitForApp(page);
    await expect(cards(page)).toHaveCount(PAGE_SIZE);
    const nav = pager(page, es);
    await expect(nav.getByText(translate('es', 'Catalog.pageOf', { page: 2, total: pages }))).toBeVisible();
    await expect(nav.getByRole('list')).toBeHidden();
    await expect(nav.getByRole('link', { name: es.Catalog.previousPage })).toBeVisible();
    await expect(nav.getByRole('link', { name: es.Catalog.nextPage })).toBeVisible();
    // Dos columnas: las dos primeras tarjetas comparten fila.
    const [first, second] = await Promise.all([cards(page).nth(0).boundingBox(), cards(page).nth(1).boundingBox()]);
    expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
    expect(second!.x).toBeGreaterThan(first!.x);
    // Sin scroll horizontal.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('pagination: the jump to the results is instant', async ({ page }) => {
    await page.goto('/es/catalog');
    await waitForApp(page);
    const next = pager(page, es).getByRole('link', { name: es.Catalog.nextPage });
    await next.scrollIntoViewIfNeeded();
    await next.click();
    await expect(page).toHaveURL(/\?page=2$/);
    const top = await resultsTop(page);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(160);
  });
});

// El clic pide la página nueva al instante (a la vez que sube a los
// resultados) y, mientras llega, la rejilla actual se atenúa: con una red
// lenta (RSC con 1,5 s de demora) el clic nunca queda sin respuesta.
test('pagination: the click answers at once and dims the grid while the page loads', async ({ page }) => {
  await page.goto('/es/catalog?category=apparel');
  await waitForApp(page);
  let requested = 0;
  await page.route('**/*', async (route) => {
    if (route.request().headers()['rsc'] && route.request().url().includes('page=2')) {
      requested = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await route.continue();
  });
  const next = pager(page, es).getByRole('link', { name: es.Catalog.nextPage });
  await next.scrollIntoViewIfNeeded();
  const clicked = Date.now();
  await next.click();
  const results = page.locator('#catalog-results');
  await expect(results).toHaveAttribute('aria-busy', 'true', { timeout: 500 });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#catalog-results ul')!).opacity)).toBe('0.4');
  // La petición sale con el clic, no al final del salto (0,8 s).
  expect(requested).toBeGreaterThan(0);
  expect(requested - clicked).toBeLessThan(500);
  await expect(page).toHaveURL(/\/es\/catalog\?category=apparel&page=2$/);
  await expect(results).not.toHaveAttribute('aria-busy');
  await expect.poll(() => resultsTop(page)).toBeGreaterThanOrEqual(0);
  expect(await resultsTop(page)).toBeLessThan(160);
});
