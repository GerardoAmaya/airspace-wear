import { es, expect, test } from './fixtures';

// Sitemap, robots y vistas previas al compartir (Open Graph y X).

const PRODUCT = 'jordan-4-travis-scott';

test('the sitemap lists both locales and every product, with hreflang alternates', async ({ request }) => {
  const response = await request.get('/sitemap.xml', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const xml = await response.text();
  for (const path of ['/es', '/en', '/es/catalog', '/en/balls', '/es/club', '/en/credits', '/es/legal', `/es/products/${PRODUCT}`, `/en/products/${PRODUCT}`]) {
    expect(xml, path).toMatch(new RegExp(`<loc>[^<]*${path}</loc>`));
  }
  expect(xml).toContain('hreflang="x-default"');
  expect(await (await request.get('/robots.txt')).text()).toMatch(/Sitemap: \S+\/sitemap\.xml/);
});

test('home and product pages share a branded large image', async ({ page, request }) => {
  for (const path of ['/es', `/en/products/${PRODUCT}`]) {
    await page.goto(path);
    const image = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(image, path).toBeTruthy();
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    const response = await request.get(new URL(image!).pathname);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
  }
  await page.goto('/es');
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', es.Metadata.ogAlt);
});

test('catalog searches are noindex, follow; filtered, sorted and paged views keep their canonical', async ({ page }) => {
  const canonical = page.locator('link[rel="canonical"]');
  const robots = page.locator('meta[name="robots"]');
  await page.goto('/es/catalog?q=jordan');
  await expect(robots).toHaveAttribute('content', 'noindex, follow');
  await expect(canonical).toHaveAttribute('href', /\/es\/catalog$/);
  for (const [path, href] of [
    ['/es/catalog', /\/es\/catalog$/],
    ['/es/catalog?brand=nike&sort=price-asc', /\/es\/catalog$/],
    ['/en/catalog?page=2', /\/en\/catalog\?page=2$/],
  ] as const) {
    await page.goto(path);
    // La canónica ya llegó: los metadatos están completos.
    await expect(canonical, path).toHaveAttribute('href', href);
    await expect(robots, path).toHaveCount(0);
  }
});
