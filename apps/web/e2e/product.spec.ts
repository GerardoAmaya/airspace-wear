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

  // El visor gira con las flechas (control explícito, no con el scroll).
  const slider = page.getByRole('slider');
  await slider.focus();
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await page.keyboard.press('ArrowRight');
  await expect(slider).not.toHaveAttribute('aria-valuenow', '0');
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
});
