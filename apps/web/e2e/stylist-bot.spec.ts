import type { StylistRequest } from '@airspace/contracts';
import type { Page } from '@playwright/test';
import { en, es, expect, fulfillSse, mockStylist, stylistEs, test, waitForApp } from './fixtures';

// Estilista flotante (robot abajo a la derecha y panel del chat). La IA se
// simula con SSE (route de Playwright), igual que en stylist.spec.ts: nunca
// se llama a la API real ni a Anthropic.

const QUESTION = 'Busco algo para correr por la mañana';
const PICKS = [
  { slug: 'nike-pegasus-36', match: 94, reason: 'Ligera y con buena amortiguación.' },
  { slug: 'new-balance-997', match: 81, reason: 'Cómoda para todo el día.' },
];

async function mockAnswer(page: Page, calls: StylistRequest[] = []) {
  await mockStylist(page, async (route) => {
    const body = route.request().postDataJSON() as StylistRequest;
    calls.push(body);
    await fulfillSse(route, [
      { type: 'text', text: 'Para correr temprano te recomiendo ' },
      { type: 'text', text: 'dos pares ligeros.' },
      { type: 'products', items: PICKS.map(({ slug, match, reason }) => ({ slug, match, reason })) },
      { type: 'done' },
    ]);
  });
}

// El robot llega en reposo, después de la página.
// La entrada de la primera visita (caminar y girar) se da por vista en todas
// las pruebas (fixtures.ts, stylistEntrance); las de la entrada la activan.
const INTRO_KEY = 'airspace-stylist-robot-intro';

// Caja del robot dentro de la ventana (no fuera, a la derecha).
const robotInView = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector('[data-stylist-robot]')?.getBoundingClientRect();
    return Boolean(box && box.right <= window.innerWidth && box.left >= 0);
  });

const robotButton = (page: Page, locale: 'es' | 'en') => page.getByRole('button', { name: (locale === 'es' ? es : en).StylistBot.button, exact: true });
const panel = (page: Page, locale: 'es' | 'en') => page.getByRole('dialog', { name: (locale === 'es' ? es : en).StylistBot.title });

test('opens from the robot without moving the page, answers and closes with Escape', async ({ page, request }) => {
  const catalog = (await (await request.get('http://127.0.0.1:4000/v1/products?locale=es')).json()) as { items: { slug: string; name: string }[] };
  const names = PICKS.map((pick) => catalog.items.find((item) => item.slug === pick.slug)?.name ?? pick.slug);
  const calls: StylistRequest[] = [];
  await mockAnswer(page, calls);

  await page.goto('/es/catalog');
  await waitForApp(page);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(300);
  const url = page.url();
  const scrollY = await page.evaluate(() => window.scrollY);

  const robot = robotButton(page, 'es');
  await robot.click();
  const dialog = panel(page, 'es');
  await expect(dialog).toBeVisible();
  // El foco entra al panel (al campo, con mouse).
  const input = dialog.getByRole('textbox', { name: es.StylistBot.inputLabel });
  await expect(input).toBeFocused();
  // Misma página y misma posición.
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);

  await input.fill(QUESTION);
  await input.press('Enter');
  const log = dialog.getByRole('log', { name: es.StylistBot.logLabel });
  await expect(log).toContainText(QUESTION);
  await expect(log).toContainText('Para correr temprano te recomiendo dos pares ligeros.');
  const cards = dialog.getByRole('list', { name: es.StylistBot.listLabel }).getByRole('listitem');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByRole('heading', { level: 3 })).toHaveText(names[0]);
  await expect(cards.nth(0)).toContainText(PICKS[0].reason);
  // La tarjeta enlaza a la ficha, pero solo navega si se toca.
  await expect(cards.nth(0).getByRole('link')).toHaveAttribute('href', `/es/products/${PICKS[0].slug}`);
  expect(page.url()).toBe(url);

  // El pedido va en el idioma de la página.
  expect(calls.at(-1)?.locale).toBe('es');
  expect(calls.at(-1)?.messages.at(-1)).toEqual({ role: 'user', content: QUESTION });

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(robot).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test('the header link opens the panel in English, ideas answer with products', async ({ page }) => {
  await page.goto('/en/catalog');
  await waitForApp(page);
  const url = page.url();
  await page.getByRole('navigation', { name: en.Header.navLabel }).getByRole('link', { name: en.Header.stylist }).click();
  const dialog = panel(page, 'en');
  await expect(dialog).toBeVisible();
  expect(page.url()).toBe(url);

  // Idea sugerida: responde el guion (sin IA), en inglés y con tarjetas.
  await dialog.getByRole('group', { name: en.StylistBot.suggestionsTitle }).getByRole('button').first().click();
  await expect(dialog.getByRole('list', { name: en.StylistBot.listLabel }).getByRole('listitem').first()).toBeVisible();
  await expect(dialog.getByRole('list', { name: en.StylistBot.listLabel }).getByRole('listitem').first()).toContainText(en.StylistBot.view);

  await dialog.getByRole('button', { name: en.StylistBot.close }).click();
  await expect(dialog).toBeHidden();
});

test('the home console shows what was asked in the panel (shared conversation)', async ({ page }) => {
  await mockAnswer(page);
  await page.goto('/es/catalog');
  await waitForApp(page);
  await robotButton(page, 'es').click();
  const dialog = panel(page, 'es');
  const input = dialog.getByRole('textbox', { name: es.StylistBot.inputLabel });
  await input.fill(QUESTION);
  await input.press('Enter');
  await expect(dialog.getByRole('list', { name: es.StylistBot.listLabel }).getByRole('listitem')).toHaveCount(2);
  await page.keyboard.press('Escape');

  // Navegación del cliente a la home: la conversación sigue en memoria.
  await page.getByRole('link', { name: es.Brand.homeLabel }).first().click();
  await expect(page).toHaveURL(/\/es$/);
  const section = page.getByRole('region', { name: stylistEs.HomeStylist.title });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole('log', { name: stylistEs.HomeStylist.console.logLabel })).toContainText(QUESTION);

  // Y el panel la conserva.
  await robotButton(page, 'es').click();
  await expect(dialog.getByRole('log', { name: es.StylistBot.logLabel })).toContainText(QUESTION);
});

test('the waving arm stays attached to the body while hovering and dragging', async ({ page }) => {
  await page.goto('/es/catalog');
  await waitForApp(page);
  const robot = robotButton(page, 'es');
  const box = (await robot.boundingBox())!;
  // El brazo (su caja en pantalla) siempre dentro de la del robot, con un margen.
  const armAttached = () =>
    page.evaluate(() => {
      const svg = document.querySelector('[data-stylist-robot] svg')!.getBoundingClientRect();
      const arm = document.querySelector('[data-stylist-robot] [data-robot-arm]')!.getBoundingClientRect();
      const slack = svg.width * 0.25;
      return arm.left >= svg.left - slack && arm.right <= svg.right + slack && arm.top >= svg.top - slack && arm.bottom <= svg.bottom + slack;
    });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (const wait of [150, 300, 500]) {
    await page.waitForTimeout(wait);
    expect(await armAttached()).toBe(true);
  }
  await page.mouse.down();
  for (let step = 1; step <= 5; step++) {
    await page.mouse.move(box.x + box.width / 2 - step * 70, box.y + box.height / 2 - step * 30, { steps: step % 2 ? 1 : 6 });
    expect(await armAttached()).toBe(true);
  }
  await page.mouse.up();
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the robot stays still and the panel still works', async ({ page }) => {
    await mockAnswer(page);
    await page.goto('/es');
    await waitForApp(page);
    const robot = robotButton(page, 'es');
    await expect(robot).toBeVisible();
    // Quieto: sin globo automático ni flotación.
    await page.waitForTimeout(500);
    const before = await robot.locator('svg').boundingBox();
    await page.waitForTimeout(700);
    expect(await robot.locator('svg').boundingBox()).toEqual(before);

    await robot.focus();
    await page.keyboard.press('Enter');
    const dialog = panel(page, 'es');
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole('textbox', { name: es.StylistBot.inputLabel });
    await input.fill(QUESTION);
    await input.press('Enter');
    await expect(dialog.getByRole('list', { name: es.StylistBot.listLabel }).getByRole('listitem')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(robot).toBeFocused();
  });

  test.describe('first visit', () => {
    test.use({ stylistEntrance: true });

    test('a short fade in place, no walk and no spin', async ({ page }) => {
      await page.goto('/es/catalog');
      await waitForApp(page);
      const robot = robotButton(page, 'es');
      await expect(robot).toBeVisible();
      // Aparece ya en su esquina, sin la capa de la vuelta (espalda).
      expect(await robotInView(page)).toBe(true);
      await page.waitForTimeout(1500);
      expect(await robotInView(page)).toBe(true);
      expect(await robot.locator('svg').count()).toBe(1);
      expect(await page.evaluate((key) => localStorage.getItem(key), INTRO_KEY)).toBe('1');
    });
  });
});

test.describe('first visit entrance', () => {
  test.use({ stylistEntrance: true });

  test('walks in once, greets, and is in place on reload', async ({ page }) => {
    await page.goto('/es/catalog');
    await waitForApp(page);
    await page.waitForSelector('[data-stylist-robot]', { state: 'attached' });
    // Fuera de la pantalla hasta que empieza a caminar.
    expect(await robotInView(page)).toBe(false);
    // Llega a su esquina, gira (frente y espalda) y saluda con su primer globo.
    await expect.poll(() => robotInView(page), { timeout: 15_000 }).toBe(true);
    await expect(page.locator('[data-stylist-bubble]')).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate((key) => localStorage.getItem(key), INTRO_KEY)).toBe('1');

    // La X cierra el globo sin abrir el chat.
    await page.locator('[data-stylist-bubble]').getByRole('button', { name: es.StylistBot.closeBubble }).click();
    await expect(page.locator('[data-stylist-bubble]')).toBeHidden();
    await expect(panel(page, 'es')).toBeHidden();
    // Y el robot sigue respondiendo al clic.
    await robotButton(page, 'es').click();
    await expect(panel(page, 'es')).toBeVisible();
    await page.keyboard.press('Escape');

    // Recargar: ya no camina, aparece en su sitio.
    await page.reload();
    await waitForApp(page);
    await page.waitForSelector('[data-stylist-robot]', { state: 'attached' });
    expect(await robotInView(page)).toBe(true);
  });
});
