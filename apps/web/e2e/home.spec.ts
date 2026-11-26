import { en, es, expect, test, waitForApp } from './fixtures';

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
