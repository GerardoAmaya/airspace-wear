import { formatPrice } from '../lib/price';
import { en, es, expect, test, translate, waitForApp } from './fixtures';

// Nombre accesible del botón del carrito, con el mensaje real de cada idioma.
const cartLabel = (locale: 'es' | 'en', count: number) => translate(locale, 'Cart.buttonLabel', { count });
const usd = (dollars: number, locale: 'es' | 'en' = 'es') => formatPrice({ amountCents: dollars * 100, currency: 'USD' }, locale);
// Lee "US$180" o "$180" como número de dólares.
const dollars = (text: string | null) => Number((text ?? '').replace(/[^\d]/g, ''));

// Carrito local: cada línea es un producto con su talla y una cantidad.
// Agregar el mismo par y talla otra vez sube la cantidad; el panel tiene un
// selector (−, número, +) entre 1 y 10, y todo sobrevive a la recarga.

const SNEAKER = 'air-jordan-1';
// Balón de una sola talla: se agrega sin elegir talla.
const BALL = 'adidas-trionda-2026';

test('same pair adds quantity, stepper changes totals, remove and persist', async ({ page }) => {
  await page.goto(`/es/products/${SNEAKER}`);
  await waitForApp(page);
  const name = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  const cartButton = page.locator('[aria-controls="cart-panel"]');
  await expect(cartButton).toHaveAttribute('aria-expanded', 'false');
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 0));

  // Sin talla no se puede agregar.
  const sizes = page.getByRole('group', { name: es.Product.chooseSize });
  await expect(page.getByRole('button', { name: es.Product.pickSizeFirst })).toBeDisabled();
  await sizes.getByRole('radio', { name: '42', exact: true }).check();
  await page.getByRole('button', { name: es.Product.addToCart }).click();
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 1));

  // El mismo par y talla otra vez: sube la cantidad (no crea otra línea).
  await page.getByRole('button', { name: es.Product.added }).click();
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 2));

  // Otra talla es otra línea.
  await sizes.getByRole('radio', { name: '43', exact: true }).check();
  await page.getByRole('button', { name: es.Product.addToCart }).click();
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 3));

  // Un balón desde su ficha (sin talla que elegir).
  await page.goto(`/es/products/${BALL}`);
  await waitForApp(page);
  const ballName = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  await page.getByRole('button', { name: es.Product.addToCart }).click();
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 4));

  // Abre el panel: tres líneas (el par en 42 con cantidad 2) y el foco en "Cerrar".
  await cartButton.click();
  const drawer = page.getByRole('dialog', { name: es.Cart.title });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: es.Cart.close })).toBeFocused();
  const lines = drawer.getByRole('listitem');
  await expect(lines).toHaveCount(3);
  const pair42 = lines.filter({ hasText: 'Talla 42' });
  const pair43 = lines.filter({ hasText: 'Talla 43' });
  const ball = lines.filter({ hasText: ballName });
  const quantity = (line: typeof pair42) => line.getByRole('group', { name: translate('es', 'Cart.quantityGroup', { name: line === ball ? ballName : name }) });
  await expect(quantity(pair42)).toContainText('2');
  await expect(quantity(pair43)).toContainText('1');

  // Precio unitario, subtotal de la línea y total, con el formato de precios.
  const unit = dollars(await pair42.getByText(/c\/u/).textContent());
  const ballUnit = dollars(await ball.locator('span').nth(2).textContent());
  await expect(pair42).toContainText(usd(unit * 2));
  const totalValue = drawer.getByText(es.Cart.total).locator('..');
  await expect(totalValue).toContainText(usd(unit * 3 + ballUnit));

  // Selector: + sube a 3 y lo anuncia; el subtotal y el total cambian.
  const increase = drawer.getByRole('button', { name: translate('es', 'Cart.increase', { name }) });
  const decrease = drawer.getByRole('button', { name: translate('es', 'Cart.decrease', { name }) });
  await expect(increase).toHaveCount(2);
  await increase.first().click();
  await expect(quantity(pair42)).toContainText('3');
  await expect(drawer.getByRole('status')).toHaveText(translate('es', 'Cart.quantityStatus', { name, count: 3 }));
  await expect(pair42).toContainText(usd(unit * 3));
  await expect(totalValue).toContainText(usd(unit * 4 + ballUnit));
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 5));

  // − baja; en 1 queda deshabilitado (aria-disabled, conserva el foco) y no baja más.
  await decrease.first().click();
  await decrease.first().click();
  await expect(quantity(pair42)).toContainText('1');
  await expect(decrease.first()).toHaveAttribute('aria-disabled', 'true');
  await expect(decrease.first()).toBeFocused();
  await decrease.first().click({ force: true });
  await expect(quantity(pair42)).toContainText('1');
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 3));

  // Máximo 10 por línea: + queda deshabilitado y avisa.
  const ballIncrease = drawer.getByRole('button', { name: translate('es', 'Cart.increase', { name: ballName }) });
  for (let i = 1; i < 10; i += 1) await ballIncrease.click();
  await expect(quantity(ball)).toContainText('10');
  await expect(ballIncrease).toHaveAttribute('aria-disabled', 'true');
  await ballIncrease.click({ force: true });
  await expect(quantity(ball)).toContainText('10');
  await expect(drawer.getByRole('status')).toHaveText(translate('es', 'Cart.maxReached', { name: ballName, max: 10 }));
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 12));

  // Quitar la línea de la talla 43: quedan dos líneas y el foco va a "Cerrar".
  await pair43.getByRole('button', { name: es.Cart.remove + translate('es', 'Cart.removeLabel', { name }), exact: true }).click();
  await expect(lines).toHaveCount(2);
  await expect(drawer.getByRole('button', { name: es.Cart.close })).toBeFocused();
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 11));

  // Escape cierra y el foco vuelve al botón del carrito.
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(cartButton).toBeFocused();

  // Persiste tras recargar (localStorage), con cantidades y el panel cerrado.
  await page.reload();
  await waitForApp(page);
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 11));
  await expect(page.getByRole('dialog', { name: es.Cart.title })).toBeHidden();
  await cartButton.click();
  await expect(drawer.getByRole('listitem')).toHaveCount(2);
  await expect(quantity(ball)).toContainText('10');

  // En inglés: mismo conteo y etiquetas del selector traducidas.
  await page.goto(`/en/products/${SNEAKER}`);
  await waitForApp(page);
  await expect(cartButton).toHaveAccessibleName(cartLabel('en', 11));
  await cartButton.click();
  const drawerEn = page.getByRole('dialog', { name: en.Cart.title });
  const nameEn = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  await expect(drawerEn.getByRole('button', { name: translate('en', 'Cart.increase', { name: nameEn }) })).toBeVisible();
  await expect(drawerEn.getByText(en.Cart.total).locator('..')).toContainText(usd(unit + ballUnit * 10, 'en'));
  await page.keyboard.press('Escape');

  // Vaciar deja el carrito en cero, también tras recargar.
  await page.goto(`/es/products/${SNEAKER}`);
  await waitForApp(page);
  await cartButton.click();
  await drawer.getByRole('button', { name: es.Cart.clear }).click();
  await expect(drawer).toContainText(es.Cart.empty);
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 0));
  await page.reload();
  await waitForApp(page);
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 0));
});

test('migrates a cart saved in the old format (one line per add)', async ({ page }) => {
  // Formato viejo (versión 0): sin cantidad, una línea por cada "Agregar".
  await page.addInitScript(
    ({ slug, ball }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const items = [
        { id: 'a', slug, size: '42' },
        { id: 'b', slug, size: '42' },
        { id: 'c', slug, size: '43' },
        { id: 'd', slug: ball },
      ];
      localStorage.setItem('airspace-cart', JSON.stringify({ state: { items }, version: 0 }));
    },
    { slug: SNEAKER, ball: BALL },
  );
  await page.goto(`/es/products/${SNEAKER}`);
  await waitForApp(page);
  const name = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  const cartButton = page.locator('[aria-controls="cart-panel"]');
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 4));
  await cartButton.click();
  const drawer = page.getByRole('dialog', { name: es.Cart.title });
  await expect(drawer.getByRole('listitem')).toHaveCount(3);
  await expect(
    drawer.getByRole('listitem').filter({ hasText: 'Talla 42' }).getByRole('group', { name: translate('es', 'Cart.quantityGroup', { name }) }),
  ).toContainText('2');

  // Se guarda ya en el formato nuevo y sigue igual tras recargar.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('airspace-cart') ?? '{}'));
  expect(saved.version).toBe(1);
  expect(saved.state.items).toHaveLength(3);
  await page.reload();
  await waitForApp(page);
  await expect(cartButton).toHaveAccessibleName(cartLabel('es', 4));
});
