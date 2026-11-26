import { es, expect, test, waitForApp } from './fixtures';

// Carrito local: agregar, abrir el panel, cambiar la cantidad, quitar y que
// sobreviva a la recarga. El carrito no tiene un selector de cantidad: cada
// "Agregar" suma una línea (un par con su talla), así que la cantidad cambia
// agregando o quitando líneas.

const SNEAKER = 'air-jordan-1';
// Balón de una sola talla: se agrega sin elegir talla.
const BALL = 'adidas-trionda-2026';

test('add, open the drawer, change quantity, remove and persist', async ({ page }) => {
  await page.goto(`/es/products/${SNEAKER}`);
  await waitForApp(page);
  const name = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  const cartButton = page.locator('[aria-controls="cart-panel"]');
  await expect(cartButton).toHaveAttribute('aria-expanded', 'false');
  await expect(cartButton).toHaveAccessibleName(/vacío/);

  // Sin talla no se puede agregar.
  const pick = page.getByRole('button', { name: es.Product.pickSizeFirst });
  await expect(pick).toBeDisabled();
  await page.getByRole('group', { name: es.Product.chooseSize }).getByRole('radio', { name: '42', exact: true }).check();
  const add = page.getByRole('button', { name: es.Product.addToCart });
  await add.click();
  await expect(page.getByRole('button', { name: es.Product.added })).toBeVisible();
  await expect(cartButton).toHaveAccessibleName(/1 producto/);

  // Otra unidad del mismo par (talla 43): la cantidad sube a 2.
  await page.getByRole('group', { name: es.Product.chooseSize }).getByRole('radio', { name: '43', exact: true }).check();
  await page.getByRole('button', { name: es.Product.addToCart }).click();
  await expect(cartButton).toHaveAccessibleName(/2 productos/);

  // Un balón desde su ficha (sin talla que elegir).
  await page.goto(`/es/products/${BALL}`);
  await waitForApp(page);
  const ballName = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  await page.getByRole('button', { name: es.Product.addToCart }).click();
  await expect(cartButton).toHaveAccessibleName(/3 productos/);

  // Abre el panel: tres líneas y el foco en "Cerrar".
  await cartButton.click();
  const drawer = page.getByRole('dialog', { name: es.Cart.title });
  await expect(drawer).toBeVisible();
  await expect(cartButton).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer.getByRole('button', { name: es.Cart.close })).toBeFocused();
  const lines = drawer.getByRole('listitem');
  await expect(lines).toHaveCount(3);
  await expect(lines.filter({ hasText: name })).toHaveCount(2);
  await expect(lines.filter({ hasText: ballName })).toHaveCount(1);
  await expect(lines.filter({ hasText: name }).first()).toContainText('Talla 42');
  const totalBefore = await drawer.getByText(es.Cart.total).locator('..').textContent();

  // Quita una unidad del par: quedan dos líneas y el total baja.
  await lines.filter({ hasText: 'Talla 43' }).getByRole('button', { name: new RegExp(es.Cart.remove) }).click();
  await expect(lines).toHaveCount(2);
  await expect(cartButton).toHaveAccessibleName(/2 productos/);
  await expect(drawer.getByText(es.Cart.total).locator('..')).not.toHaveText(totalBefore ?? '');

  // Escape cierra y el foco vuelve al botón del carrito.
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(cartButton).toBeFocused();

  // Persiste tras recargar (localStorage), con el panel cerrado.
  await page.reload();
  await waitForApp(page);
  await expect(cartButton).toHaveAccessibleName(/2 productos/);
  await expect(page.getByRole('dialog', { name: es.Cart.title })).toBeHidden();
  await cartButton.click();
  await expect(drawer.getByRole('listitem')).toHaveCount(2);
  await expect(drawer.getByRole('listitem').filter({ hasText: name })).toContainText('Talla 42');

  // También en el otro idioma (los nombres y precios salen del catálogo en inglés).
  await page.goto(`/en/products/${SNEAKER}`);
  await waitForApp(page);
  await expect(cartButton).toHaveAccessibleName(/2 items/);

  // Vaciar deja el carrito en cero, también tras recargar.
  await page.goto(`/es/products/${SNEAKER}`);
  await waitForApp(page);
  await cartButton.click();
  await drawer.getByRole('button', { name: es.Cart.clear }).click();
  await expect(drawer).toContainText(es.Cart.empty);
  await expect(cartButton).toHaveAccessibleName(/vacío/);
  await page.reload();
  await waitForApp(page);
  await expect(cartButton).toHaveAccessibleName(/vacío/);
});
