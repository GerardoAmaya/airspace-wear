import type { Page } from '@playwright/test';
import { HOME_HANGAR_TEASER, HOME_SECTIONS } from '../lib/home';
import boardEs from '../messages/home/board.es.json' with { type: 'json' };
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

    // El estilista de la home (si está a la vista, lib/home.ts) muestra el
    // primer intercambio ya resuelto (estado estático) y no reproduce el
    // guion por su cuenta. Oculto, nada llama a la API por sí solo.
    if (HOME_SECTIONS.stylist) {
      const section = page.getByRole('region', { name: stylistEs.HomeStylist.title });
      const log = section.getByRole('log', { name: stylistEs.HomeStylist.console.logLabel });
      await expect(log).toContainText(stylistEs.HomeStylist.scenarios.comfort.question);
      await expect(section.getByRole('group', { name: stylistEs.HomeStylist.controls.suggestions }).getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
    }
    expect(stylistCalls).toBe(0);

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

// Adelanto del Hangar 360° con el maniquí (HOME_HANGAR_TEASER en lib/home.ts):
// el avatar, la ropa y el par se piden solo cuando la sección se acerca, y en
// modo liviano nunca (queda la foto fija).
const AVATAR_FILES = /\/(avatar-local|avatar-fit)\/|\/models\/air-jordan-1-lite\.glb/;
const scrollToHangar = (page: Page) =>
  page.evaluate(() => {
    const section = document.getElementById('hangar')!;
    window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY);
  });

test.describe('home hangar teaser', () => {
  test.skip(HOME_HANGAR_TEASER !== 'avatar', 'The shoe teaser is on');

  test('loads the walking avatar only when the section comes near', async ({ page }) => {
    await emulateDevice(page, 12, 8);
    const files: string[] = [];
    page.on('request', (request) => {
      if (AVATAR_FILES.test(request.url())) files.push(new URL(request.url()).pathname);
    });
    await page.goto('/es');
    await waitForApp(page);
    await page.waitForTimeout(2000);
    expect(files).toEqual([]);

    await scrollToHangar(page);
    const stage = page.locator('#hangar[data-teaser="avatar"] [data-ready]');
    await expect(stage).toHaveCount(1, { timeout: 30_000 });
    expect(files.some((path) => path.startsWith('/avatar-local/'))).toBe(true);
    expect(files.filter((path) => path.startsWith('/avatar-fit/'))).toHaveLength(3);
    // El escenario y el botón llevan al Hangar.
    await expect(page.locator('#hangar').getByRole('link', { name: boardEs.HomeBoard.hangar.cta })).toHaveAttribute('href', '/es/hangar');
  });

  test('the platform turns with drag and arrow keys, and the labels never clip', async ({ page }) => {
    await emulateDevice(page, 12, 8);
    await page.goto('/es');
    await waitForApp(page);
    await scrollToHangar(page);
    const stage = page.locator('#hangar').getByRole('slider', { name: boardEs.HomeBoard.hangar.avatar.sliderLabel });
    await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    const degrees = async () => Number(await stage.getAttribute('aria-valuenow'));

    // Arrastre horizontal: gira la plataforma (y no navega).
    const box = (await stage.boundingBox())!;
    const before = await degrees();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 12 });
    await page.mouse.up();
    await expect.poll(async () => Math.abs((await degrees()) - before)).toBeGreaterThan(20);
    await expect(page).toHaveURL(/\/es$/);

    // Flechas con el foco en la plataforma: pasos de 15°.
    await stage.focus();
    await page.waitForTimeout(1200);
    const start = await degrees();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => ((await degrees()) - start + 360) % 360).toBeGreaterThanOrEqual(14);

    // Los rótulos caben a cualquier ancho (escritorio y teléfono).
    for (const width of [1720, 1534, 1280, 1024, 900, 768, 390]) {
      await page.setViewportSize({ width, height: 816 });
      await scrollToHangar(page);
      const clipped = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('#hangar [data-h-reveal] > span')).filter((label) => {
          const rect = label.getBoundingClientRect();
          return rect.width > 0 && (label.scrollWidth > Math.ceil(rect.width) + 1 || rect.right > document.documentElement.clientWidth || rect.left < 0);
        }).map((label) => label.textContent),
      );
      expect(clipped, `${width}px`).toEqual([]);
    }
  });

  test('lite mode keeps the still image and never loads the avatar', async ({ page }) => {
    await emulateDevice(page, 2, 2);
    const files: string[] = [];
    page.on('request', (request) => {
      if (AVATAR_FILES.test(request.url())) files.push(new URL(request.url()).pathname);
    });
    await page.goto('/es');
    await expect(page.locator('html')).toHaveClass(/(^|\s)lite(\s|$)/);
    await waitForApp(page);
    await scrollToHangar(page);
    const still = page.locator('#hangar [data-still] img').filter({ visible: true });
    await expect(still).toHaveCount(1);
    await expect.poll(() => still.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.waitForTimeout(2000);
    expect(files).toEqual([]);
    await expect(page.locator('#hangar canvas')).toHaveCount(0);
  });
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
