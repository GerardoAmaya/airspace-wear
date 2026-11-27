import type { Page } from '@playwright/test';
import { es, expect, mockStylist, fulfillSse, stylistEs, test, waitForApp } from './fixtures';

// Movimiento: movimiento reducido, modo liviano y recarga en la misma
// posición (CLAUDE.md, "Motion").

// Elementos con entrada animada: el CSS los oculta hasta que su animación
// arranca. Devuelve los que siguen invisibles (opacidad 0).
const hiddenEntrances = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-enter], [data-reveal] > *'))
      .filter((element) => getComputedStyle(element).opacity === '0')
      .map((element) => element.outerHTML.slice(0, 120)),
  );

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('content is visible at once and nothing autoplays', async ({ page }) => {
    let stylistCalls = 0;
    await mockStylist(page, async (route) => {
      stylistCalls += 1;
      await fulfillSse(route, [{ type: 'error', code: 'unavailable' }]);
    });

    await page.goto('/es');
    await waitForApp(page);
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/motion-ok/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Nada queda escondido esperando una animación, ni arriba ni al bajar.
    expect(await hiddenEntrances(page)).toEqual([]);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= height; y += 800) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(2000);
    expect(await hiddenEntrances(page)).toEqual([]);

    // El estilista muestra el primer intercambio ya resuelto (estado
    // estático) y no reproduce el guion por su cuenta.
    const section = page.getByRole('region', { name: stylistEs.HomeStylist.title });
    const log = section.getByRole('log', { name: stylistEs.HomeStylist.console.logLabel });
    await expect(log).toContainText(stylistEs.HomeStylist.scenarios.comfort.question);
    expect(stylistCalls).toBe(0);
    await expect(section.getByRole('group', { name: stylistEs.HomeStylist.controls.suggestions }).getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');

    // Los saltos de ancla son inmediatos (sin desplazamiento suave). El
    // enlace "Estilista IA" ya no salta: abre el panel del robot.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('banner').getByRole('link', { name: es.Header.balls }).click();
    const target = await page.locator('#balones').evaluate((element) => Math.round(element.getBoundingClientRect().top + window.scrollY));
    await page.waitForTimeout(150);
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrolled - target)).toBeLessThan(200);
  });
});

// Saltos de ancla del encabezado (Balones en la home): los hace Lenis (suaves, con su duración; <html> lleva lenis-smooth mientras
// dura), cada sección aterriza en su borde superior bajo el encabezado fijo,
// la URL no cambia y, en el teléfono, el menú se cierra. "Estilista IA"
// abre el panel del robot en la misma página, sin desplazar.
for (const { name, viewport } of [
  { name: 'desktop', viewport: { width: 1720, height: 816 } },
  { name: 'phone', viewport: { width: 390, height: 844 } },
]) {
  test.describe(`anchor jumps (${name})`, () => {
    test.use({ viewport });

    test('header links land on their section with a smooth Lenis jump', async ({ page }) => {
      await page.goto('/es');
      await waitForApp(page);
      const header = page.getByRole('banner');
      for (const [label, id] of [[es.Header.balls, 'balones']] as const) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await page.evaluate(() => {
          const win = window as unknown as { __smooth: boolean };
          win.__smooth = false;
          new MutationObserver(() => {
            if (document.documentElement.classList.contains('lenis-smooth')) win.__smooth = true;
          }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        });
        if (name === 'phone') await header.getByRole('button', { name: es.Header.menuOpen }).click();
        await header.getByRole('link', { name: label, exact: true }).filter({ visible: true }).click();
        await expect.poll(() => page.evaluate((target) => Math.abs(Math.round(document.getElementById(target)!.getBoundingClientRect().top)), id)).toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => (window as unknown as { __smooth: boolean }).__smooth)).toBe(true);
        await expect(page).toHaveURL(/\/es$/);
        await expect(header).not.toHaveAttribute('data-menu-open');
        // Se queda ahí (sin un segundo desplazamiento).
        const landed = await page.evaluate(() => Math.round(window.scrollY));
        await page.waitForTimeout(600);
        expect(Math.abs((await page.evaluate(() => Math.round(window.scrollY))) - landed)).toBeLessThanOrEqual(1);
      }

      // Estilista IA: abre el panel sin mover la página ni cambiar la URL.
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      if (name === 'phone') await header.getByRole('button', { name: es.Header.menuOpen }).click();
      await header.getByRole('link', { name: es.Header.stylist, exact: true }).filter({ visible: true }).click();
      await expect(page.getByRole('dialog', { name: es.StylistBot.title })).toBeVisible();
      await expect(page).toHaveURL(/\/es$/);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expect(header).not.toHaveAttribute('data-menu-open');
    });
  });
}

// Modo liviano: el script del <head> lo activa en equipos modestos
// (hardwareConcurrency o deviceMemory <= 4, Save-Data, 2g/3g). No existe un
// parámetro ?lite, así que se simula un equipo de 2 núcleos y 2 GB.
const emulateDevice = (page: Page, cores: number, memory: number) =>
  page.addInitScript(
    ([hardware, ram]) => {
      Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => hardware, configurable: true });
      Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => ram, configurable: true });
    },
    [cores, memory],
  );

const MODEL_PRODUCT = 'air-jordan-1';

test('lite mode on a low-end device loads the lite model', async ({ page }) => {
  await emulateDevice(page, 2, 2);
  const models: string[] = [];
  page.on('request', (request) => {
    if (/\/models\/[^/]+\.glb(\?|$)/.test(request.url())) models.push(new URL(request.url()).pathname);
  });

  await page.goto(`/es/products/${MODEL_PRODUCT}`);
  await expect(page.locator('html')).toHaveClass(/(^|\s)lite(\s|$)/);
  await waitForApp(page);
  await expect.poll(() => models.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(models).toContain(`/models/${MODEL_PRODUCT}-lite.glb`);
  expect(models.filter((path) => !path.endsWith('-lite.glb'))).toEqual([]);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('a capable device does not enter lite mode and loads the hero model', async ({ page }) => {
  await emulateDevice(page, 12, 8);
  const models: string[] = [];
  page.on('request', (request) => {
    if (/\/models\/[^/]+\.glb(\?|$)/.test(request.url())) models.push(new URL(request.url()).pathname);
  });

  await page.goto(`/es/products/${MODEL_PRODUCT}`);
  await waitForApp(page);
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)lite(\s|$)/);
  await expect.poll(() => models, { timeout: 20_000 }).toContain(`/models/${MODEL_PRODUCT}.glb`);
});

// Recarga (Cmd+R) a media página: vuelve a la misma posición.
for (const path of ['/es', '/es/catalog']) {
  test(`reload restores the scroll position on ${path}`, async ({ page }) => {
    await page.goto(path);
    await waitForApp(page);
    // La página ya tiene su alto final (secciones montadas).
    await page.waitForTimeout(800);
    const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(max).toBeGreaterThan(400);

    for (const fraction of [0.35, 0.7]) {
      const target = Math.round(max * fraction);
      await page.evaluate((top) => window.scrollTo(0, top), target);
      await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(target);
      await page.waitForTimeout(300);

      await page.reload();
      await expect.poll(() => page.evaluate(() => Math.round(window.scrollY)), { timeout: 10_000 }).toBeGreaterThanOrEqual(target - 2);
      expect(Math.abs((await page.evaluate(() => Math.round(window.scrollY))) - target)).toBeLessThanOrEqual(2);
      // El contenido vuelve a verse (la clase restoring se quita).
      await expect(page.locator('html')).not.toHaveClass(/restoring/);
      // Y se queda ahí (nada lo mueve después).
      await page.waitForTimeout(1200);
      expect(Math.abs((await page.evaluate(() => Math.round(window.scrollY))) - target)).toBeLessThanOrEqual(2);
    }
  });
}
