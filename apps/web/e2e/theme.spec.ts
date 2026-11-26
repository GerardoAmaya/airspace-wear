import type { Page } from '@playwright/test';
import { es, expect, test, waitForApp } from './fixtures';

// Tema: la elección se guarda y sobrevive a la recarga sin parpadeo. El HTML
// del servidor trae data-theme="dark"; el script del <head> debe fijar el
// tema correcto antes del primer cuadro pintado.

// Registra cada cambio de data-theme en <html> con su instante y lo compara
// con el primer pintado (performance "first-paint"). Devuelve el tema que
// tenía la página en ese primer cuadro y si algo lo cambió después.
async function recordThemeChanges(page: Page) {
  await page.addInitScript(() => {
    const log: { value: string | null; at: number }[] = [];
    (window as unknown as { __themeLog: typeof log }).__themeLog = log;
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.target === document.documentElement) log.push({ value: document.documentElement.getAttribute('data-theme'), at: performance.now() });
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-theme'] });
  });
}

async function themeAtFirstPaint(page: Page) {
  await page.waitForFunction(() => performance.getEntriesByType('paint').some((entry) => entry.name === 'first-paint'));
  return page.evaluate(() => {
    const paint = performance.getEntriesByType('paint').find((entry) => entry.name === 'first-paint')!.startTime;
    const log = (window as unknown as { __themeLog: { value: string | null; at: number }[] }).__themeLog;
    const before = log.filter((entry) => entry.at <= paint);
    const after = log.filter((entry) => entry.at > paint);
    // Sin cambios antes de pintar, el cuadro usó el valor del HTML del servidor ("dark").
    const painted = before.at(-1)?.value ?? 'dark';
    return { painted, changedAfterPaint: after.some((entry) => entry.value !== painted), bootScriptRan: before.length > 0 };
  });
}

const firstFrameTheme = async (page: Page) => {
  const result = await themeAtFirstPaint(page);
  expect(result.bootScriptRan, 'the <head> script sets data-theme before the first paint').toBe(true);
  expect(result.changedAfterPaint, 'data-theme must not change after the first paint').toBe(false);
  return result.painted;
};

test('saved theme persists across reloads with no flash', async ({ page }) => {
  await recordThemeChanges(page);
  await page.goto('/es');
  await waitForApp(page);

  // Sin elección guardada manda el sistema (oscuro en la configuración).
  expect(await firstFrameTheme(page)).toBe('dark');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: es.Theme.toLight }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: es.Theme.toDark })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('airspace-theme'))).toBe('light');

  await page.reload();
  // Claro desde el primer cuadro, aunque el sistema pida oscuro.
  expect(await firstFrameTheme(page)).toBe('light');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await waitForApp(page);
  await expect(page.getByRole('button', { name: es.Theme.toDark })).toBeVisible();

  // También en otra página y en otro idioma.
  await page.goto('/en/catalog');
  expect(await firstFrameTheme(page)).toBe('light');

  // De vuelta a oscuro, también guardado.
  await page.goto('/es');
  await waitForApp(page);
  await page.getByRole('button', { name: es.Theme.toDark }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  expect(await firstFrameTheme(page)).toBe('dark');
});

test.describe('system light preference', () => {
  test.use({ colorScheme: 'light' });

  test('follows the system before paint when nothing is saved', async ({ page }) => {
    await recordThemeChanges(page);
    await page.goto('/es');
    expect(await firstFrameTheme(page)).toBe('light');
    await waitForApp(page);
    await expect(page.getByRole('button', { name: es.Theme.toDark })).toBeVisible();
  });
});
