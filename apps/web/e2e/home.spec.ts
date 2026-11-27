import { HOME_SECTIONS } from '../lib/home';
import { en, es, expect, stylistEs, test, waitForApp } from './fixtures';

// Home en ambos idiomas: carga, textos traducidos y consola sin errores
// (también al recorrer la página entera, que monta las escenas 3D y la consola
// del estilista, que aquí usa el guion porque la API está simulada).

const LOCALES = [
  { code: 'es', messages: es },
  { code: 'en', messages: en },
] as const;

for (const { code, messages } of LOCALES) {
  test(`home /${code} loads with translated chrome and no console errors`, async ({ page, consoleErrors }) => {
    const response = await page.goto(`/${code}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    await expect(page).toHaveTitle(messages.Metadata.title);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: messages.Brand.homeLabel })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText(messages.Footer.disclaimer);
    await waitForApp(page);

    // Recorre la página por tramos (scroll nativo) para montar cada sección.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= height; y += 600) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1500);

    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });
}

// "Estilista IA" oculta (HOME_SECTIONS.stylist): la sección no se pinta y el
// enlace del encabezado, sin JS, lleva al catálogo en vez de a #estilista.
test('hidden stylist section leaves no anchor behind', async ({ page }) => {
  test.skip(HOME_SECTIONS.stylist, 'Home stylist section is shown');
  await page.goto('/es');
  await expect(page.getByRole('region', { name: stylistEs.HomeStylist.title })).toHaveCount(0);
  await expect(page.locator('#estilista')).toHaveCount(0);
  const links = page.locator('a[data-stylist-open]');
  expect(await links.count()).toBeGreaterThan(0);
  for (const href of await links.evaluateAll((items) => items.map((item) => item.getAttribute('href')))) expect(href).toBe('/es/catalog');
});

test('language switch keeps the page and changes every string', async ({ page }) => {
  await page.goto('/es/catalog');
  await waitForApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(es.Catalog.title);

  // El selector visible del encabezado (el del menú móvil está oculto en escritorio).
  const switcher = page.getByRole('navigation', { name: es.LocaleSwitch.label }).filter({ visible: true });
  await expect(switcher.getByRole('link', { name: /^ES/ })).toHaveAttribute('aria-current', 'true');
  await switcher.getByRole('link', { name: /^EN/ }).click();

  await expect(page).toHaveURL(/\/en\/catalog$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.Catalog.title);
  await expect(page.getByRole('contentinfo')).toContainText(en.Footer.disclaimer);
  const enSwitcher = page.getByRole('navigation', { name: en.LocaleSwitch.label }).filter({ visible: true });
  await expect(enSwitcher.getByRole('link', { name: /^EN/ })).toHaveAttribute('aria-current', 'true');

  // Y de vuelta a español.
  await enSwitcher.getByRole('link', { name: /^ES/ }).click();
  await expect(page).toHaveURL(/\/es\/catalog$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(es.Catalog.title);
});

// Detalles de la portada ("Pieza por pieza"): todos los puntos se ven sobre
// el zapato y cada uno es un botón que elige su detalle, igual que su fila de
// la lista (fila y punto quedan activos; en escritorio aparece su etiqueta y
// en el teléfono la tarjeta).
for (const { name, viewport } of [
  { name: 'desktop', viewport: { width: 1720, height: 816 } },
  { name: 'phone', viewport: { width: 390, height: 844 } },
]) {
  test.describe(`hero detail dots (${name})`, () => {
    test.use({ viewport });

    test('clicking a dot on the shoe activates its detail and card', async ({ page }) => {
      await page.goto('/es');
      await waitForApp(page);
      await page.evaluate(() => document.getElementById('detalles')?.scrollIntoView());

      // Con la zona alineada, todos los puntos están a la vista.
      const spots = page.locator('[data-part="spot"]');
      const stage = page.locator('[data-part="stage"]');
      await expect(stage).toHaveAttribute('data-spots', '');
      await expect(stage).toHaveAttribute('data-shown', '');
      const total = await spots.count();
      expect(total).toBeGreaterThan(1);
      await expect(spots.first()).toHaveAttribute('aria-pressed', 'true');

      // Un punto inactivo y de frente a la cámara.
      const index = await spots.evaluateAll((elements) =>
        elements.findIndex((element) => element.getAttribute('aria-pressed') !== 'true' && !element.hasAttribute('data-occluded')),
      );
      expect(index).toBeGreaterThan(0);
      const spot = spots.nth(index);
      await expect(spot).toBeVisible();
      // La cámara llega al detalle por tiempo: se espera a que el punto se asiente.
      await expect
        .poll(async () => {
          const before = await spot.boundingBox();
          await page.waitForTimeout(250);
          const after = await spot.boundingBox();
          return !!before && !!after && Math.abs(before.x - after.x) + Math.abs(before.y - after.y) < 2;
        })
        .toBe(true);
      await spot.click();

      await expect(spot).toHaveAttribute('aria-pressed', 'true');
      await expect(spots.first()).toHaveAttribute('aria-pressed', 'false');
      const rows = page.locator('#detalles ol').getByRole('button');
      await expect(rows.nth(index)).toHaveAttribute('aria-pressed', 'true');
      await expect(rows.first()).toHaveAttribute('aria-pressed', 'false');

      // El rótulo del detalle elegido muestra el mismo título que su botón.
      const label = (await spot.getAttribute('aria-label')) ?? '';
      if (name === 'desktop') {
        const callout = page.locator('[data-part="label"]').nth(index);
        await expect.poll(() => callout.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
        const title = (await callout.locator('p').nth(1).textContent()) ?? '';
        expect(title.length).toBeGreaterThan(0);
        expect(label.endsWith(title)).toBe(true);
      } else {
        const cardTitle = page.locator('[data-part="card-text"]').first();
        await expect.poll(async () => label.endsWith((await cardTitle.textContent()) ?? '\u0000')).toBe(true);
      }
    });
  });
}
