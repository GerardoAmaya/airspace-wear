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

// Vestuario: prendas, accesorios y colores; lo elegido sobrevive a la recarga.
// Necesita el vestuario local (pnpm avatar:build y la copia en
// public/avatar-local/); sin él, el Hangar va sin ropa y no hay panel.
test('the outfit panel toggles garments, picks colors and remembers them', async ({ page, consoleErrors }) => {
  const o = es.Hangar.outfit;
  await page.goto('/es/hangar');
  await waitForApp(page);
  const stage = page.getByRole('slider', { name: /Avatar/ });
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(stage).not.toHaveAttribute('data-outfit', 'loading');
  test.skip((await stage.getAttribute('data-outfit')) !== 'ready', 'Sin vestuario local (pnpm avatar:build).');

  const panel = page.getByRole('region', { name: o.title });
  const shirt = panel.getByRole('group', { name: o.shirt });
  const bottoms = panel.getByRole('group', { name: o.bottoms });
  const extras = panel.getByRole('group', { name: o.accessories });
  const pressed = (scope: typeof panel, name: string) => expect(scope.getByRole('button', { name, exact: true }));

  // Por defecto: camiseta con mangas, shorts, gorra y calcetines con franjas; sin lentes.
  await pressed(shirt, o.shirtStyles.sleeves).toHaveAttribute('aria-pressed', 'true');
  await pressed(bottoms, o.bottomsStyles.shorts).toHaveAttribute('aria-pressed', 'true');
  await pressed(extras, o.cap).toHaveAttribute('aria-pressed', 'true');
  await pressed(extras, o.glasses).toHaveAttribute('aria-pressed', 'false');
  await pressed(extras, o.socks).toHaveAttribute('aria-pressed', 'true');
  await pressed(extras, o.stripes).toHaveAttribute('aria-pressed', 'true');

  // Cambios de prenda.
  await shirt.getByRole('button', { name: o.shirtStyles.tank }).click();
  await bottoms.getByRole('button', { name: o.bottomsStyles.pants }).click();
  await extras.getByRole('button', { name: o.glasses }).click();
  await extras.getByRole('button', { name: o.cap }).click();
  await pressed(shirt, o.shirtStyles.tank).toHaveAttribute('aria-pressed', 'true');
  await pressed(shirt, o.shirtStyles.sleeves).toHaveAttribute('aria-pressed', 'false');
  await pressed(bottoms, o.bottomsStyles.pants).toHaveAttribute('aria-pressed', 'true');
  await pressed(extras, o.glasses).toHaveAttribute('aria-pressed', 'true');
  await pressed(extras, o.cap).toHaveAttribute('aria-pressed', 'false');

  // Sin calcetines, las franjas no se pueden tocar.
  await extras.getByRole('button', { name: o.socks }).click();
  await expect(extras.getByRole('button', { name: o.stripes })).toBeDisabled();
  await extras.getByRole('button', { name: o.socks }).click();
  await expect(extras.getByRole('button', { name: o.stripes })).toBeEnabled();

  // Color de la parte de abajo: una muestra de la paleta.
  await panel.getByRole('combobox', { name: o.colorTarget }).selectOption({ label: o.slots.bottoms });
  const palette = panel.getByRole('group', { name: translate('es', 'Hangar.outfit.palette', { garment: o.slots.bottoms }) });
  await palette.getByRole('button', { name: o.swatches.olive }).click();
  await expect(palette.getByRole('button', { name: o.swatches.olive })).toHaveAttribute('aria-pressed', 'true');
  await expect(palette.getByRole('button', { name: o.swatches.black })).toHaveAttribute('aria-pressed', 'false');

  // "Combinar con el zapato" vuelve a poner la gorra.
  const match = panel.getByRole('button', { name: o.match });
  await expect(match).toHaveAttribute('aria-pressed', 'false');
  await panel.getByRole('combobox', { name: o.colorTarget }).selectOption({ label: o.slots.cap });
  await panel.getByRole('button', { name: o.swatches.orange }).click();
  await match.click();
  await expect(match).toHaveAttribute('aria-pressed', 'true');
  await pressed(extras, o.cap).toHaveAttribute('aria-pressed', 'true');

  // Recarga: todo sigue igual.
  await page.reload();
  await waitForApp(page);
  await expect(stage).toHaveAttribute('data-outfit', 'ready', { timeout: 30_000 });
  await pressed(shirt, o.shirtStyles.tank).toHaveAttribute('aria-pressed', 'true');
  await pressed(bottoms, o.bottomsStyles.pants).toHaveAttribute('aria-pressed', 'true');
  await pressed(extras, o.glasses).toHaveAttribute('aria-pressed', 'true');
  await expect(match).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('combobox', { name: o.colorTarget }).selectOption({ label: o.slots.bottoms });
  await expect(palette.getByRole('button', { name: o.swatches.olive })).toHaveAttribute('aria-pressed', 'true');

  // Restablecer vuelve a lo de fábrica.
  await panel.getByRole('button', { name: o.reset }).click();
  await pressed(shirt, o.shirtStyles.sleeves).toHaveAttribute('aria-pressed', 'true');
  await pressed(bottoms, o.bottomsStyles.shorts).toHaveAttribute('aria-pressed', 'true');

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('the home Hangar 360° section links to the hangar page', async ({ page }) => {
  await page.goto('/es');
  await waitForApp(page);
  const link = page.getByRole('link', { name: boardEs.HomeBoard.hangar.cta });
  await expect(link).toHaveAttribute('href', '/es/hangar');
});
