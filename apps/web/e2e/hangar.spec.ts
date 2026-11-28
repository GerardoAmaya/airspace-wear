import type { Locator, Page } from '@playwright/test';
import boardEs from '../messages/home/board.es.json' with { type: 'json' };
import { HANGAR_CLIPS, HANGAR_FEATURES, HANGAR_WEAR_ALLOWLIST } from '../lib/avatar/hangar-features';
import { es, expect, test, translate, waitForApp } from './fixtures';

// Hangar 360°: el avatar con el par elegido. Un solo lienzo; la pestaña
// "Zapatos" cambia el par, los chips cambian la animación, "Ropa" viste al
// maniquí con la lista corta de prendas (lib/avatar/hangar-features.ts) y
// "Lleva puesto" agrega el look al carrito.

const cartLabel = (count: number) => translate('es', 'Cart.buttonLabel', { count });
const h = es.Hangar;

async function openHangar(page: Page, path = '/es/hangar') {
  await page.goto(path);
  await waitForApp(page);
  const stage = page.getByRole('slider', { name: /Avatar/ });
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  return stage;
}

// Abre una pestaña del panel derecho y devuelve su panel.
async function openTab(page: Page, name: string): Promise<Locator> {
  const tab = page.getByRole('tablist', { name: h.tabs.label }).getByRole('tab', { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  return page.getByRole('tabpanel', { name, exact: true });
}

const worn = (page: Page) => page.getByRole('region', { name: h.wearing, exact: true });

// Look por defecto (DEFAULT_PAIR y DEFAULT_OUTFIT.wear): Air Jordan 1, gorra
// NY 59FIFTY, camiseta Nike Flight negra y los pants grises. data-wear lista las prendas en el orden de
// los lugares (cabeza, ojos, torso, piernas).
const DEFAULT_PAIR = 'air-jordan-1';
const DEFAULT_CAP = 'gorra-ny-59fifty-marino';
const DEFAULT_TOP = 'camiseta-nike-flight-negra';
const DEFAULT_BOTTOM = 'pants-anorak-gris';
const DEFAULT_WEAR = `${DEFAULT_CAP},${DEFAULT_TOP},${DEFAULT_BOTTOM}`;

test('hangar loads one canvas, switches the pair and the clip, and adds the look to the cart', async ({ page, consoleErrors }) => {
  await page.goto('/es/hangar');
  await waitForApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(h.title);

  // Escenario vacío mientras carga; después entra el avatar (un solo lienzo).
  const stage = page.getByRole('slider', { name: /Avatar/ });
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('canvas')).toHaveCount(1);

  // Pestaña "Zapatos": elegir otro par cambia lo que lleva puesto.
  const shoes = await openTab(page, h.tabs.shoes);
  const picker = shoes.getByRole('region', { name: h.pickerLabel });
  // Al abrir lleva el par por defecto.
  await expect(picker.locator(`li[data-key="${DEFAULT_PAIR}"] button`)).toHaveAttribute('aria-pressed', 'true');
  await expect(stage).toHaveAttribute('data-wear', DEFAULT_WEAR, { timeout: 30_000 });
  const cards = picker.getByRole('button');
  expect(await cards.count()).toBeGreaterThan(5);
  // Por su slug: al elegirlo, la tarjeta queda en su lugar.
  const nextKey = await picker.locator('li:not(:has(button[aria-pressed="true"]))').nth(2).getAttribute('data-key');
  const next = picker.locator(`li[data-key="${nextKey}"] button`);
  await expect(next).toHaveAttribute('aria-pressed', 'false');
  const label = (await next.getAttribute('aria-label')) ?? '';
  const name = label.replace(translate('es', 'Hangar.pickerItem', { name: '' }), '').trim();
  await next.click();
  await expect(next).toHaveAttribute('aria-pressed', 'true');
  await expect(worn(page).getByRole('heading', { level: 3, name })).toBeVisible();
  await expect(stage).toHaveAccessibleName(translate('es', 'Hangar.stageLabel', { name }));

  // Chips de animación: Pose, Girar y Caminar (sin Reposo), Pose al abrir y
  // uno activo a la vez.
  const clips = page.getByRole('group', { name: h.clipsLabel });
  await expect(clips.getByRole('button')).toHaveText(HANGAR_CLIPS.map((clip) => h.clips[clip]));
  await expect(clips.getByRole('button', { name: h.clips.idle })).toHaveCount(0);
  await expect(clips.getByRole('button', { name: h.clips.pose })).toHaveAttribute('aria-pressed', 'true');
  await clips.getByRole('button', { name: h.clips.walk }).click();
  await expect(clips.getByRole('button', { name: h.clips.walk })).toHaveAttribute('aria-pressed', 'true');
  await expect(clips.getByRole('button', { name: h.clips.pose })).toHaveAttribute('aria-pressed', 'false');

  // Giro con el teclado: la lectura para lectores de pantalla cambia.
  await stage.focus();
  await page.keyboard.press('ArrowRight');
  await expect(stage).not.toHaveAttribute('aria-valuenow', '0');

  // "Agregar look completo": sin talla, lleva el foco a la talla que falta.
  const cartButton = page.locator('[aria-controls="cart-panel"]');
  await expect(cartButton).toHaveAccessibleName(cartLabel(0));
  const addLook = worn(page).getByRole('button', { name: h.look.add });
  await expect(addLook).toHaveAttribute('aria-disabled', 'true');
  const size = worn(page).getByRole('combobox', { name: translate('es', 'Hangar.look.sizeLabel', { name }) });
  // aria-disabled sigue enfocable y pulsable (Playwright lo trata como
  // deshabilitado, así que se pulsa con el teclado).
  await addLook.focus();
  await page.keyboard.press('Enter');
  await expect(size).toBeFocused();
  await expect(cartButton).toHaveAccessibleName(cartLabel(0));

  // Con talla del par, de la camiseta y de los pants (puestos por defecto),
  // agrega el look entero: el par, la camiseta, los pants y la gorra NY
  // 59FIFTY (talla única, también puesta por defecto).
  const option = await size.locator('option:not([disabled])').first().getAttribute('value');
  await size.selectOption(option ?? '');
  await expect(addLook).toHaveAttribute('aria-disabled', 'true');
  const tee = worn(page).getByRole('combobox', { name: /nike flight/i });
  await tee.selectOption('M');
  await expect(addLook).toHaveAttribute('aria-disabled', 'true');
  const pants = worn(page).getByRole('combobox', { name: /pants/i });
  await pants.selectOption('M');
  await expect(addLook).not.toHaveAttribute('aria-disabled', 'true');
  const capLink = worn(page).locator(`a[href="/es/products/${DEFAULT_CAP}"]`);
  await expect(capLink).toHaveCount(1);
  const capName = ((await capLink.textContent()) ?? '').trim();
  expect(capName).not.toBe('');
  await addLook.click();
  await expect(cartButton).toHaveAccessibleName(cartLabel(4));
  await cartButton.click();
  const cart = page.getByRole('dialog', { name: es.Cart.title });
  await expect(cart).toContainText(name);
  await expect(cart).toContainText(capName);

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

// Pestañas: solo "Zapatos" y "Ropa" ("Colores" oculta), flechas del
// teclado, y la última elegida se recuerda.
test('the panel tabs move with the arrow keys and remember the last one', async ({ page }) => {
  test.skip(HANGAR_FEATURES.colorsTab && HANGAR_FEATURES.baseOutfit, 'Con "Colores" a la vista hay tres pestañas.');
  await openHangar(page);
  const tablist = page.getByRole('tablist', { name: h.tabs.label });
  await expect(tablist.getByRole('tab')).toHaveText([h.tabs.shoes, h.tabs.wear]);
  const shoes = tablist.getByRole('tab', { name: h.tabs.shoes, exact: true });
  await expect(shoes).toHaveAttribute('aria-selected', 'true');
  await shoes.focus();
  await page.keyboard.press('ArrowRight');
  const wear = tablist.getByRole('tab', { name: h.tabs.wear, exact: true });
  await expect(wear).toBeFocused();
  await expect(wear).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(shoes).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(wear).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: h.tabs.wear })).toBeVisible();

  await page.reload();
  await waitForApp(page);
  await expect(wear).toHaveAttribute('aria-selected', 'true');
});

// Lo guardado por una versión anterior (pestaña "Colores", prendas que el
// Hangar ya no ofrece) se limpia: vuelve "Zapatos" y la prenda de fábrica de
// ese lugar.
test('old saved state with hidden tabs or garments is sanitized', async ({ page }) => {
  test.skip(HANGAR_FEATURES.colorsTab, 'La pestaña "Colores" está a la vista.');
  await page.addInitScript(() => {
    localStorage.setItem(
      'airspace-hangar-outfit',
      JSON.stringify({
        state: { tab: 'colors', wear: { top: 'sudadera-nike-club-fleece', eyes: 'lentes-sol-negros', head: 'gorra-adidas-negra' } },
        version: 1,
      }),
    );
  });
  const stage = await openHangar(page);
  const tablist = page.getByRole('tablist', { name: h.tabs.label });
  await expect(tablist.getByRole('tab', { name: h.tabs.shoes, exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(stage).toHaveAttribute('data-wear', `gorra-adidas-negra,${DEFAULT_TOP}`, { timeout: 30_000 });
});

// Filtros de "Zapatos": búsqueda sin acentos ni mayúsculas, chip de marca,
// conteo anunciado, "Limpiar filtros" y el par puesto fijado arriba aunque
// los filtros lo dejen fuera.
test.describe('shoes tab filters', () => {
  const f = h.filters;
  const count = (n: number) => translate('es', 'Hangar.filters.count', { count: n });
  const itemPrefix = translate('es', 'Hangar.pickerItem', { name: '' });

  async function openFilters(page: Page) {
    await openHangar(page);
    const panel = await openTab(page, h.tabs.shoes);
    const picker = panel.getByRole('region', { name: h.pickerLabel });
    return {
      panel,
      picker,
      search: panel.getByRole('searchbox', { name: f.search }),
      status: panel.getByRole('search', { name: f.label }).getByRole('status'),
      brands: panel.getByRole('group', { name: f.brands }),
      // Pares de los resultados (sin el puesto, que va aparte).
      others: picker.getByRole('button', { pressed: false }),
    };
  }

  const labels = async (cards: Locator) => (await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''))).map((label) => label.replace(itemPrefix, '').trim());

  test('search matches the name without accents or case and pins the worn pair', async ({ page, consoleErrors }) => {
    const { picker, search, status, others } = await openFilters(page);
    const total = await picker.getByRole('button').count();
    await expect(status).toHaveText(count(total));

    // El par puesto no se llama Gazelle: sigue visible al final con "Puesto".
    const wornCard = picker.getByRole('button', { pressed: true });
    const wornName = (await labels(wornCard))[0];
    expect(wornName).not.toMatch(/gazelle/i);
    await search.fill('GAZÉLLE');
    await expect(picker.getByRole('button').last()).toHaveAttribute('aria-pressed', 'true');
    await expect(wornCard).toContainText(f.worn);
    const found = await labels(others);
    expect(found.length).toBeGreaterThan(0);
    for (const name of found) expect(name).toMatch(/gazelle/i);
    await expect(status).toHaveText(count(found.length));

    // Sin resultados: el aviso y "Limpiar filtros" vuelven a la lista entera.
    await search.fill('zzzz');
    await expect(status).toHaveText(f.empty);
    await expect(others).toHaveCount(0);
    await expect(wornCard).toBeVisible();
    await page.getByRole('button', { name: f.clear }).click();
    await expect(search).toHaveValue('');
    await expect(status).toHaveText(count(total));

    // Botón de borrar la búsqueda.
    await search.fill('jordan');
    await page.getByRole('button', { name: f.clearSearch }).click();
    await expect(search).toHaveValue('');
    // El foco vuelve al campo (el botón desaparece).
    await expect(search).toBeFocused();

    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });

  test('a brand chip filters the pairs and is remembered after a reload', async ({ page, consoleErrors }) => {
    const { brands, status, others } = await openFilters(page);
    const all = brands.getByRole('button', { name: new RegExp(`^${f.allBrands}`) });
    const adidas = brands.getByRole('button', { name: /^Adidas/ });
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await adidas.click();
    await expect(adidas).toHaveAttribute('aria-pressed', 'true');
    await expect(all).toHaveAttribute('aria-pressed', 'false');
    const found = await labels(others);
    expect(found.length).toBeGreaterThan(1);
    for (const name of found) expect(name).toMatch(/^Adidas/);
    await expect(status).toHaveText(count(found.length));

    // El filtro se guarda como la pestaña.
    await page.reload();
    await waitForApp(page);
    await expect(adidas).toHaveAttribute('aria-pressed', 'true');
    await expect(status).toHaveText(count(found.length));

    // Volver a pulsar la marca la quita.
    await adidas.click();
    await expect(all).toHaveAttribute('aria-pressed', 'true');

    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });
});

// Vestuario base: prendas, accesorios y colores; lo elegido sobrevive a la
// recarga. Necesita el vestuario local (pnpm avatar:build y la copia en
// public/avatar-local/); sin él, el Hangar va sin ropa base.
// Oculto hoy (HANGAR_FEATURES.baseOutfit y colorsTab en false): corre solo si
// se vuelven a encender.
test('the base outfit toggles garments, picks colors and remembers them', async ({ page, consoleErrors }) => {
  test.skip(!HANGAR_FEATURES.baseOutfit || !HANGAR_FEATURES.colorsTab || !HANGAR_FEATURES.socks || HANGAR_FEATURES.resetToBare, 'Vestuario base oculto (hangar-features.ts).');
  const o = h.outfit;
  const stage = await openHangar(page);
  await expect(stage).not.toHaveAttribute('data-outfit', 'loading');
  test.skip((await stage.getAttribute('data-outfit')) !== 'ready', 'Sin vestuario local (pnpm avatar:build).');

  let panel = await openTab(page, h.tabs.wear);
  const head = panel.getByRole('group', { name: o.catalog.slots.head, exact: true });
  const legs = panel.getByRole('group', { name: o.catalog.slots.bottom, exact: true });
  const shirt = panel.getByRole('group', { name: o.shirt });
  const bottoms = panel.getByRole('group', { name: o.bottoms, exact: true });
  const extras = panel.getByRole('group', { name: o.accessories });
  const pressed = (scope: Locator, name: string) => expect(scope.getByRole('button', { name, exact: true }));

  // Por defecto: camiseta con mangas, shorts, gorra y calcetines con franjas; sin lentes.
  await pressed(shirt, o.shirtStyles.sleeves).toHaveAttribute('aria-pressed', 'true');
  await pressed(bottoms, o.bottomsStyles.shorts).toHaveAttribute('aria-pressed', 'true');
  await pressed(extras, o.cap).toHaveAttribute('aria-pressed', 'true');
  await pressed(extras, o.glasses).toHaveAttribute('aria-pressed', 'false');
  await pressed(extras, o.socks).toHaveAttribute('aria-pressed', 'true');
  await pressed(extras, o.stripes).toHaveAttribute('aria-pressed', 'true');

  // La gorra y los pants del catálogo vienen puestos por defecto: mientras
  // tanto, "Colores" no ofrece la gorra ni la parte de abajo base (las del
  // catálogo conservan su color).
  await expect(head.getByRole('button', { name: o.catalog.base, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(stage).toHaveAttribute('data-wear', new RegExp(`^${DEFAULT_CAP},`), { timeout: 30_000 });
  panel = await openTab(page, h.tabs.colors);
  const targets = panel.getByRole('combobox', { name: o.colorTarget });
  await expect(targets.locator('option', { hasText: o.slots.cap })).toHaveCount(0);
  await expect(targets.locator('option', { hasText: o.slots.shirt })).toHaveCount(0);
  await expect(targets.locator('option', { hasText: o.slots.bottoms })).toHaveCount(0);
  await expect(targets.locator('option', { hasText: o.slots.socks })).toHaveCount(1);
  // "Base" en la cabeza y en las piernas vuelve a la gorra y la parte de
  // abajo generadas, con su color.
  panel = await openTab(page, h.tabs.wear);
  await head.getByRole('button', { name: o.catalog.base, exact: true }).click();
  await expect(head.getByRole('button', { name: o.catalog.base, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await legs.getByRole('button', { name: o.catalog.base, exact: true }).click();
  await expect(legs.getByRole('button', { name: o.catalog.base, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(stage).toHaveAttribute('data-wear', DEFAULT_TOP, { timeout: 30_000 });

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

  // "Colores": color de la parte de abajo, una muestra de la paleta.
  panel = await openTab(page, h.tabs.colors);
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

  // Recarga: todo sigue igual (y la pestaña de colores sigue abierta).
  await page.reload();
  await waitForApp(page);
  await expect(stage).toHaveAttribute('data-outfit', 'ready', { timeout: 30_000 });
  await expect(match).toHaveAttribute('aria-pressed', 'true');
  await panel.getByRole('combobox', { name: o.colorTarget }).selectOption({ label: o.slots.bottoms });
  await expect(palette.getByRole('button', { name: o.swatches.olive })).toHaveAttribute('aria-pressed', 'true');
  panel = await openTab(page, h.tabs.wear);
  await pressed(shirt, o.shirtStyles.tank).toHaveAttribute('aria-pressed', 'true');
  await pressed(bottoms, o.bottomsStyles.pants).toHaveAttribute('aria-pressed', 'true');
  await pressed(extras, o.glasses).toHaveAttribute('aria-pressed', 'true');
  await pressed(extras, o.cap).toHaveAttribute('aria-pressed', 'true');

  // La gorra y la parte de abajo base siguen elegidas tras la recarga.
  await expect(head.getByRole('button', { name: o.catalog.base, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(legs.getByRole('button', { name: o.catalog.base, exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Restablecer vuelve a lo de fábrica, con la gorra y los pants del catálogo
  // otra vez puestos.
  await panel.getByRole('button', { name: o.reset }).click();
  await pressed(shirt, o.shirtStyles.sleeves).toHaveAttribute('aria-pressed', 'true');
  await pressed(bottoms, o.bottomsStyles.shorts).toHaveAttribute('aria-pressed', 'true');
  await expect(head.getByRole('button', { name: o.catalog.base, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(stage).toHaveAttribute('data-wear', DEFAULT_WEAR, { timeout: 30_000 });

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('the home Hangar 360° section links to the hangar page', async ({ page }) => {
  await page.goto('/es');
  await waitForApp(page);
  const link = page.getByRole('link', { name: boardEs.HomeBoard.hangar.cta });
  await expect(link).toHaveAttribute('href', '/es/hangar');
});

// "Ropa": solo la lista corta (gorras, camiseta Nike Flight, hoodies Nike, anorak y pants). Cada prenda se pone y
// se quita (con "Ninguna" o pulsándola otra vez), aparece en "Lleva puesto"
// con enlace a su ficha, y "Restablecer" deja el maniquí sin ropa con el par.
test('the wear tab offers only the allowlist, garments come off and reset leaves the bare mannequin', async ({ page, consoleErrors }) => {
  test.skip(HANGAR_FEATURES.baseOutfit || !HANGAR_FEATURES.resetToBare, 'Con vestuario base, "Ropa" cambia.');
  const c = h.outfit.catalog;
  const stage = await openHangar(page);
  await expect(stage).not.toHaveAttribute('data-outfit');
  const panel = await openTab(page, h.tabs.wear);
  await expect(panel.getByRole('heading', { name: h.outfit.baseTitle, exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: h.outfit.socks })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: c.base, exact: true })).toHaveCount(0);
  await expect(stage).toHaveAttribute('data-wear', DEFAULT_WEAR, { timeout: 30_000 });

  // Solo las prendas de la lista, en sus lugares (sin "Ojos": los lentes no están).
  const wearPrefix = translate('es', 'Hangar.outfit.catalog.wearItem', { name: '' });
  const chips = panel.getByRole('button', { name: new RegExp(`^${wearPrefix}`) });
  await expect(chips).toHaveCount(HANGAR_WEAR_ALLOWLIST?.length ?? 0);
  await expect(panel.getByRole('group', { name: c.slots.eyes, exact: true })).toHaveCount(0);
  const head = panel.getByRole('group', { name: c.slots.head, exact: true });
  const torso = panel.getByRole('group', { name: c.slots.top, exact: true });
  const legs = panel.getByRole('group', { name: c.slots.bottom, exact: true });
  await expect(head.getByRole('button', { name: new RegExp(`^${wearPrefix}`) })).toHaveCount(3);
  await expect(torso.getByRole('button', { name: new RegExp(`^${wearPrefix}`) })).toHaveCount(4);
  await expect(legs.getByRole('button', { name: new RegExp(`^${wearPrefix}`) })).toHaveCount(1);

  // Otra gorra: reemplaza a la NY 59FIFTY y aparece en "Lleva puesto".
  const other = head.getByRole('button', { name: new RegExp(`^${wearPrefix}`), pressed: false }).first();
  const name = ((await other.getAttribute('aria-label')) ?? '').replace(wearPrefix, '').trim();
  const chip = head.getByRole('button', { name: translate('es', 'Hangar.outfit.catalog.wearItem', { name }), exact: true });
  await chip.hover();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(stage).toHaveAttribute('data-wear', new RegExp(`^(?!${DEFAULT_CAP})[a-z0-9-]+,${DEFAULT_TOP},${DEFAULT_BOTTOM}$`), { timeout: 30_000 });
  const capSlug = ((await stage.getAttribute('data-wear')) ?? '').split(',')[0];
  await expect(worn(page).getByRole('link', { name, exact: true })).toHaveAttribute('href', `/es/products/${capSlug}`);

  // Pulsar la gorra puesta la quita; "Ninguna" queda elegida.
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(head.getByRole('button', { name: c.none, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(stage).toHaveAttribute('data-wear', `${DEFAULT_TOP},${DEFAULT_BOTTOM}`);
  await expect(worn(page).getByRole('link', { name, exact: true })).toHaveCount(0);

  // "Ninguna" quita la camiseta.
  await torso.getByRole('button', { name: c.none, exact: true }).click();
  await expect(stage).toHaveAttribute('data-wear', DEFAULT_BOTTOM);

  // "Restablecer": el maniquí sin ropa, con el mismo par.
  await panel.getByRole('button', { name: h.outfit.resetBare }).click();
  await expect(stage).not.toHaveAttribute('data-wear');
  for (const group of [head, torso, legs]) await expect(group.getByRole('button', { name: c.none, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(worn(page).getByRole('heading', { level: 3 })).toHaveCount(1);
  await expect(worn(page).locator(`a[href="/es/products/${DEFAULT_PAIR}"]`)).toHaveCount(1);

  // Se recuerda tras recargar.
  await page.reload();
  await waitForApp(page);
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(stage).not.toHaveAttribute('data-wear');
  await expect(page.getByRole('tabpanel', { name: h.tabs.wear, exact: true })).toBeVisible();

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('the product page of a fitted garment opens the hangar with it preselected', async ({ page, consoleErrors }) => {
  // La gorra Adidas (la NY 59FIFTY ya viene puesta por defecto).
  const slug = 'gorra-adidas-negra';
  await page.goto(`/es/products/${slug}`);
  await waitForApp(page);
  const tryOn = page.getByRole('link', { name: es.Product.tryInHangar });
  await expect(tryOn).toHaveAttribute('href', `/es/hangar?wear=${slug}`);

  await tryOn.click();
  await expect(page).toHaveURL(new RegExp(`/es/hangar\\?wear=${slug}$`));
  const stage = page.getByRole('slider', { name: /Avatar/ });
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  // La gorra Adidas reemplaza a la NY; la camiseta y los pants siguen puestos.
  await expect(stage).toHaveAttribute('data-wear', `${slug},${DEFAULT_TOP},${DEFAULT_BOTTOM}`, { timeout: 30_000 });

  // Se abre la pestaña "Ropa" con la prenda elegida.
  const panel = page.getByRole('tabpanel', { name: h.tabs.wear, exact: true });
  await expect(panel).toBeVisible();
  const head = panel.getByRole('group', { name: h.outfit.catalog.slots.head, exact: true });
  await expect(head.getByRole('button', { pressed: true })).toHaveCount(1);
  await expect(worn(page).locator(`a[href="/es/products/${slug}"]`)).toHaveCount(1);
  await expect(worn(page).locator(`a[href="/es/products/${DEFAULT_CAP}"]`)).toHaveCount(0);

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

// Prendas ajustadas fuera de la lista del Hangar (la sudadera Nike): su ficha
// no enlaza al Hangar y ?wear= no la pone.
test('a fitted garment outside the hangar allowlist has no hangar link', async ({ page }) => {
  test.skip(HANGAR_WEAR_ALLOWLIST === null || HANGAR_WEAR_ALLOWLIST.includes('sudadera-nike-club-fleece'), 'La sudadera está en la lista.');
  await page.goto('/es/products/sudadera-nike-club-fleece');
  await waitForApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: es.Product.tryInHangar })).toHaveCount(0);

  const stage = await openHangar(page, '/es/hangar?wear=sudadera-nike-club-fleece');
  await expect(stage).toHaveAttribute('data-wear', DEFAULT_WEAR, { timeout: 30_000 });
});

test('a product without avatar fit has no hangar link', async ({ page }) => {
  await page.goto('/es/products/chaqueta-acolchada-roja');
  await waitForApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: es.Product.tryInHangar })).toHaveCount(0);
});

// "Girar": vuelta procedural de 360° (sin el clip de Mixamo). La lectura de
// giro la sigue: en unos segundos recorre buena parte de la vuelta.
test('"Girar" turns the avatar a full lap and the reading follows', async ({ page, consoleErrors }) => {
  const stage = await openHangar(page);
  const clips = page.getByRole('group', { name: h.clipsLabel });
  const start = Number(await stage.getAttribute('aria-valuenow'));
  await clips.getByRole('button', { name: h.clips.turn }).click();
  await expect(clips.getByRole('button', { name: h.clips.turn })).toHaveAttribute('aria-pressed', 'true');
  // A mitad de la vuelta (unos 2,3 s) el giro supera los 90° desde el inicio.
  await expect
    .poll(async () => ((Number(await stage.getAttribute('aria-valuenow')) - start + 360) % 360), { timeout: 6_000 })
    .toBeGreaterThan(90);
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('opens on the static pose', async ({ page }) => {
    await openHangar(page);
    const clips = page.getByRole('group', { name: h.clipsLabel });
    await expect(clips.getByRole('button', { name: h.clips.pose })).toHaveAttribute('aria-pressed', 'true');
  });

  test('"Girar" stays still', async ({ page }) => {
    const stage = await openHangar(page);
    const clips = page.getByRole('group', { name: h.clipsLabel });
    const start = await stage.getAttribute('aria-valuenow');
    await clips.getByRole('button', { name: h.clips.turn }).click();
    await page.waitForTimeout(1500);
    await expect(stage).toHaveAttribute('aria-valuenow', start ?? '0');
  });
});
