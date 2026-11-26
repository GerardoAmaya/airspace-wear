import { en, es, expect, test } from './fixtures';

// Rutas que no existen: siempre 404 (nunca 500) y, cuando se puede, con el
// 404 del sitio en el idioma que toca. Antes /x.txt o /models/balls llegaban
// a las páginas con un "idioma" inventado y respondían 500.

const FILE_LIKE = ['/x.txt', '/foo.php', '/wp-login.php', '/.env', '/favicon.ico', '/models.txt'];
const FAKE_LOCALE = ['/models/balls', '/vendor/products/air-jordan-1', '/api/balls', '/es/x.txt'];

test('file-like paths outside a locale answer the localized 404', async ({ request }) => {
  for (const path of FILE_LIKE) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    expect(await response.text(), path).toContain(es.NotFound.title);
  }
  // Con el idioma guardado por next-intl, el 404 sale en ese idioma.
  const english = await request.get('/wp-login.php', { maxRedirects: 0, headers: { cookie: 'NEXT_LOCALE=en' } });
  expect(english.status()).toBe(404);
  // Hasta el apóstrofo: según dónde salga, el HTML lo escapa o no.
  expect(await english.text()).toContain(en.NotFound.title.split("'")[0]);
});

test('paths that skip the proxy with a fake locale answer 404', async ({ request }) => {
  for (const path of FAKE_LOCALE) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
  }
});

test('static files, robots and the locale redirect still work', async ({ request }) => {
  for (const path of ['/robots.txt', '/icon.svg', '/vendor/meshopt_decoder.cjs']) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(200);
  }
  const root = await request.get('/', { maxRedirects: 0 });
  expect(root.status()).toBe(307);
  expect(root.headers().location).toMatch(/\/es$/);
});
