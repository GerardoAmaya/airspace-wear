import boardEs from '../messages/home/board.es.json' with { type: 'json' };
import { es, expect, test, translate, waitForApp } from './fixtures';

// Hangar 360°: el avatar con el par elegido. Un solo lienzo, el selector
// cambia el par (y su ficha), los chips cambian la animación y el par que
// lleva puesto se agrega al carrito.

const cartLabel = (count: number) => translate('es', 'Cart.buttonLabel', { count });

test('hangar loads one canvas, switches the pair and the clip, and adds to cart', async ({ page, consoleErrors }) => {
  await page.goto('/es/hangar');
  await waitForApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(es.Hangar.title);

  // Escenario vacío mientras carga; después entra el avatar (un solo lienzo).
  const stage = page.getByRole('slider', { name: /Avatar/ });
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('canvas')).toHaveCount(1);

  // Selector: elegir otro par cambia el nombre del que lleva puesto.
  const picker = page.getByRole('region', { name: es.Hangar.pickerLabel });
  const cards = picker.getByRole('button');
  expect(await cards.count()).toBeGreaterThan(5);
  const next = cards.nth(2);
  await expect(next).toHaveAttribute('aria-pressed', 'false');
  const label = (await next.getAttribute('aria-label')) ?? '';
  const name = label.replace(translate('es', 'Hangar.pickerItem', { name: '' }), '').trim();
  await next.click();
  await expect(next).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  await expect(stage).toHaveAccessibleName(translate('es', 'Hangar.stageLabel', { name }));

  // Chips de animación: uno activo a la vez.
  const clips = page.getByRole('group', { name: es.Hangar.clipsLabel });
  await clips.getByRole('button', { name: es.Hangar.clips.walk }).click();
  await expect(clips.getByRole('button', { name: es.Hangar.clips.walk })).toHaveAttribute('aria-pressed', 'true');
  await expect(clips.getByRole('button', { name: es.Hangar.clips.idle })).toHaveAttribute('aria-pressed', 'false');

  // Giro con el teclado: la lectura para lectores de pantalla cambia.
  await stage.focus();
  await page.keyboard.press('ArrowRight');
  await expect(stage).not.toHaveAttribute('aria-valuenow', '0');

  // Carrito: talla disponible y agregar el par puesto.
  const cartButton = page.locator('[aria-controls="cart-panel"]');
  await expect(cartButton).toHaveAccessibleName(cartLabel(0));
  await page.getByRole('group', { name: es.Product.chooseSize }).locator('input[type=radio]:not([disabled])').first().check();
  await page.getByRole('button', { name: es.Product.addToCart }).click();
  await expect(cartButton).toHaveAccessibleName(cartLabel(1));
  await cartButton.click();
  await expect(page.getByRole('dialog', { name: es.Cart.title })).toContainText(name);

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('the home Hangar 360° section links to the hangar page', async ({ page }) => {
  await page.goto('/es');
  await waitForApp(page);
  const link = page.getByRole('link', { name: boardEs.HomeBoard.hangar.cta });
  await expect(link).toHaveAttribute('href', '/es/hangar');
});
