import { en, es, expect, test, waitForApp } from './fixtures';

// Créditos: se llega desde el pie, lista modelos, fuentes y librerías con su
// autor y licencia, y existe en ambos idiomas.

test('credits page lists every group and is linked from the footer', async ({ page }) => {
  await page.goto('/es');
  await waitForApp(page);
  await page.getByRole('contentinfo').getByRole('link', { name: es.Footer.credits }).click();
  await expect(page).toHaveURL(/\/es\/credits$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(es.Credits.title);
  await expect(page).toHaveTitle(new RegExp(es.Credits.metaTitle));

  for (const kind of ['model', 'font', 'library'] as const) {
    const group = page.getByRole('region', { name: es.Credits.group[kind] });
    await expect(group).toBeVisible();
    expect(await group.getByRole('listitem').count(), `${kind} credits`).toBeGreaterThan(0);
  }

  // Los modelos 3D enlazan a su original en otra pestaña.
  const models = page.getByRole('region', { name: es.Credits.group.model });
  await expect(models).toContainText(es.Credits.modelsNote);
  const source = models.getByRole('link').first();
  await expect(source).toHaveAttribute('target', '_blank');
  await expect(source).toHaveAttribute('rel', /noopener/);
  await expect(source).toHaveAttribute('href', /^https:\/\//);
});

test('credits page in English', async ({ page }) => {
  await page.goto('/en/credits');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.Credits.title);
  await expect(page.getByRole('region', { name: en.Credits.group.model })).toBeVisible();
});
