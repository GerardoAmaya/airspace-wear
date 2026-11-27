import { productViewerFor } from '../lib/product-viewer';
import { es, expect, test, waitForApp } from './fixtures';

// Del catálogo a la ficha, y los detalles 3D (hotspots) de la ficha con teclado.

// Producto con detalles 3D en el seed de la API.
const HOTSPOT_PRODUCT = 'air-jordan-1';

test('catalog card opens its product page and the breadcrumb goes back', async ({ page }) => {
  await page.goto('/es/catalog');
  await waitForApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(es.Catalog.title);

  const cards = page.getByRole('article');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(1);

  const card = cards.filter({ has: page.locator(`a[href$="/products/${HOTSPOT_PRODUCT}"]`) });
  const name = (await card.getByRole('heading').textContent())?.trim() ?? '';
  expect(name).not.toBe('');
  await card.getByRole('link').click();

  await expect(page).toHaveURL(new RegExp(`/es/products/${HOTSPOT_PRODUCT}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  await expect(page).toHaveTitle(new RegExp(name));
  await expect(page.getByRole('button', { name: es.Product.addToCart }).or(page.getByRole('button', { name: es.Product.pickSizeFirst }))).toBeVisible();

  await page.getByRole('navigation', { name: es.Product.breadcrumbLabel }).getByRole('link', { name: es.Product.backToCatalog }).click();
  await expect(page).toHaveURL(/\/es\/catalog$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(es.Catalog.title);
});

test('product hotspots are reachable and operable with the keyboard', async ({ page }) => {
  await page.goto(`/es/products/${HOTSPOT_PRODUCT}`);
  await waitForApp(page);

  const tour = page.getByRole('region', { name: es.Product.viewer.detailsTitle });
  await expect(tour).toBeVisible();
  const overview = tour.getByRole('button', { name: es.Product.viewer.overview });
  const items = tour.getByRole('listitem').getByRole('button');
  expect(await items.count()).toBeGreaterThanOrEqual(2);
  await expect(overview).toHaveAttribute('aria-pressed', 'true');

  // Con Tab desde el inicio de la página se llega al primer detalle.
  const first = items.nth(0);
  const second = items.nth(1);
  await page.locator('body').focus();
  let reached = false;
  for (let index = 0; index < 80 && !reached; index++) {
    await page.keyboard.press('Tab');
    reached = await first.evaluate((element) => element === document.activeElement);
  }
  expect(reached, 'first hotspot button reachable with Tab').toBe(true);

  // Enter activa el detalle (y apaga la vista general).
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(overview).toHaveAttribute('aria-pressed', 'false');

  // Tab al siguiente y Espacio lo activa; solo uno queda activo.
  await page.keyboard.press('Tab');
  await expect(second).toBeFocused();
  await page.keyboard.press('Space');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(first).toHaveAttribute('aria-pressed', 'false');

  // Volver a pulsarlo lo apaga y regresa a la vista general.
  await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-pressed', 'false');
  await expect(overview).toHaveAttribute('aria-pressed', 'true');

  // El visor gira con las flechas (control explícito, no con el scroll). La
  // plataforma giratoria se prueba aparte (abajo); aquí, el visor de órbita.
  if (productViewerFor('sneaker') !== 'orbit') return;
  const slider = page.getByRole('slider');
  await slider.focus();
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await page.keyboard.press('ArrowRight');
  await expect(slider).not.toHaveAttribute('aria-valuenow', '0');
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');

  // Flechas arriba y abajo inclinan el zapato (la suela hacia la cámara) y
  // Home lo deja derecho otra vez.
  const flat = await slider.getAttribute('aria-valuetext');
  await page.keyboard.press('ArrowUp');
  await expect(slider).not.toHaveAttribute('aria-valuetext', flat ?? '');
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', flat ?? '');
});

// Plataforma giratoria (lib/product-viewer.ts): gira sola, con flechas y
// hacia el detalle elegido. aria-valuenow lleva los grados; cada marcador
// lleva data-facing mientras su detalle mira a la cámara.
test.describe('product turntable', () => {
  test.skip(productViewerFor('sneaker') !== 'turntable', 'The orbit viewer is on');

  test('autoplays a slow spin while visible', async ({ page }) => {
    await page.goto(`/es/products/${HOTSPOT_PRODUCT}`);
    await waitForApp(page);
    const stage = page.getByRole('slider');
    await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
    const first = Number(await stage.getAttribute('aria-valuenow'));
    await expect.poll(async () => Number(await stage.getAttribute('aria-valuenow')), { timeout: 10_000 }).not.toBe(first);
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('stays still, turns 15 degrees per arrow key and Home goes back to 000', async ({ page }) => {
      await page.goto(`/es/products/${HOTSPOT_PRODUCT}`);
      await waitForApp(page);
      const stage = page.getByRole('slider');
      await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
      // Sin giro automático: la vista de reposo (tres cuartos) en 000°.
      await page.waitForTimeout(1500);
      await expect(stage).toHaveAttribute('aria-valuenow', '0');
      await stage.focus();
      await page.keyboard.press('ArrowRight');
      await expect(stage).toHaveAttribute('aria-valuenow', '15');
      await page.keyboard.press('ArrowRight');
      await expect(stage).toHaveAttribute('aria-valuenow', '30');
      await page.keyboard.press('ArrowLeft');
      await expect(stage).toHaveAttribute('aria-valuenow', '15');
      await page.keyboard.press('Home');
      await expect(stage).toHaveAttribute('aria-valuenow', '0');
      // Arrastre horizontal: también gira (y sin inercia ni giro después).
      const box = (await stage.boundingBox())!;
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 8 });
      await page.mouse.up();
      await expect(stage).not.toHaveAttribute('aria-valuenow', '0');
    });

    test('choosing a detail turns the platform until it faces the camera', async ({ page }) => {
      await page.goto(`/es/products/${HOTSPOT_PRODUCT}`);
      await waitForApp(page);
      const stage = page.getByRole('slider');
      await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
      const tour = page.getByRole('region', { name: es.Product.viewer.detailsTitle });
      const items = tour.getByRole('listitem').getByRole('button');
      const keys = await page.locator('[data-hotspot]').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.hotspot!));
      expect(keys.length).toBeGreaterThanOrEqual(2);

      // En 000° el lado externo mira a la cámara: la puntera y el cuello no.
      const before = await stage.getAttribute('aria-valuenow');
      const toeIndex = keys.indexOf('toe');
      test.skip(toeIndex < 0, 'El producto no tiene detalle de puntera.');
      const toe = page.locator('[data-hotspot="toe"]');
      await items.nth(toeIndex).click();
      await expect(items.nth(toeIndex)).toHaveAttribute('aria-pressed', 'true');
      await expect(stage).not.toHaveAttribute('aria-valuenow', before ?? '0');
      await expect(toe).toHaveAttribute('data-facing', '');
      await expect(toe).toHaveAttribute('data-active', 'true');

      // Cada detalle elegido queda de cara a la cámara (también la suela,
      // desde una cámara baja y sin inclinar el zapato).
      for (const [index, key] of keys.entries()) {
        await items.nth(index).click();
        await expect(page.locator(`[data-hotspot="${key}"]`)).toHaveAttribute('data-facing', '');
      }
    });
  });
});
