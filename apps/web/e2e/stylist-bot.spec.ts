import { randomUUID } from 'node:crypto';
import type { StylistOrder, StylistRequest } from '@airspace/contracts';
import type { Page } from '@playwright/test';
import { Pool } from 'pg';
import { HOME_SECTIONS } from '../lib/home';
import { formatPrice } from '../lib/price';
import { AUTH_ENABLED, createTestSession, deleteTestUser, GOOGLE_LOGIN_ENABLED, signIn } from './auth';
import { en, es, expect, fulfillSse, mockStylist, stylistEs, test, translate, waitForApp } from './fixtures';

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
  // La consola de la home está oculta tras HOME_SECTIONS.stylist (lib/home.ts).
  test.skip(!HOME_SECTIONS.stylist, 'Home stylist section hidden by its flag');
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

// ---------- Preguntas sobre pedidos ----------
// El panel pregunta al puente de la web (/api/stylist/chat, mismo origen),
// que agrega la sesión. La respuesta se simula en el navegador: la sesión y
// los pedidos de verdad se prueban en la API (test/stylist.e2e-spec.ts).

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://airspace:airspace@127.0.0.1:5434/airspace';
let pool: Pool | null = null;
const db = () => (pool ??= new Pool({ connectionString: DATABASE_URL, max: 2 }));

// Pedido pagado hace 12 minutos (paso "Enviado"; el siguiente, en unos 3).
async function seedPaidOrder(userId: string): Promise<StylistOrder> {
  const id = randomUUID();
  const paidAt = new Date(Date.now() - 12 * 60_000);
  const { rows } = await db().query<{ seq: number; createdAt: Date }>(
    `INSERT INTO "Order" (id, "userId", status, "subtotalCents", "totalCents", locale, "paidAt", "trackingNumber", "createdAt")
     VALUES ($1, $2, 'paid', 18000, 18000, 'es', $3, $4, $3) RETURNING seq, "createdAt"`,
    [id, userId, paidAt, `ASW${String(Date.now()).slice(-12)}`],
  );
  await db().query(
    `INSERT INTO "OrderItem" ("orderId", slug, brand, "nameEs", "nameEn", size, "unitPriceCents", quantity) VALUES ($1, 'air-jordan-1', 'Jordan', 'Air Jordan 1 prueba', 'Air Jordan 1 test', '42', 18000, 1)`,
    [id],
  );
  const { seq, createdAt } = rows[0]!;
  return {
    id,
    number: `AS-${createdAt.getUTCFullYear()}-${String(seq).padStart(6, '0')}`,
    status: 'paid',
    createdAt: createdAt.toISOString(),
    paidAt: paidAt.toISOString(),
    itemCount: 1,
    total: { amountCents: 18000, currency: 'USD' },
    trackingStage: 'shipped',
    nextStepAt: new Date(paidAt.getTime() + 15 * 60_000).toISOString(),
  };
}

async function askInPanel(page: Page, locale: 'es' | 'en', question: string) {
  await robotButton(page, locale).click();
  const dialog = panel(page, locale);
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('textbox', { name: (locale === 'es' ? es : en).StylistBot.inputLabel });
  await input.fill(question);
  await input.press('Enter');
  return dialog;
}

test.describe('orders', () => {
  test('signed out: the answer offers to sign in', async ({ page }) => {
    const urls: string[] = [];
    await mockStylist(page, async (route) => {
      urls.push(route.request().url());
      await fulfillSse(route, [{ type: 'text', text: 'Para ver tus pedidos necesitas iniciar sesión.' }, { type: 'sign_in' }, { type: 'done' }]);
    });
    await page.goto('/es/catalog');
    await waitForApp(page);
    const dialog = await askInPanel(page, 'es', '¿Cómo van mis pedidos?');
    await expect(dialog.getByRole('log')).toContainText('Para ver tus pedidos necesitas iniciar sesión.');
    // Mismo origen: el navegador nunca llama a la API directo.
    expect(new URL(urls[0]!).origin).toBe(new URL(page.url()).origin);
    expect(new URL(urls[0]!).pathname).toBe('/api/stylist/chat');
    if (GOOGLE_LOGIN_ENABLED) {
      const button = dialog.getByRole('button', { name: es.StylistBot.signIn });
      await expect(button).toBeVisible();
      // Lleva a Google (interceptado: no sale a la red).
      let googleUrl: URL | null = null;
      await page.route('https://accounts.google.com/**', (route) => {
        googleUrl = new URL(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Google</title>' });
      });
      await button.click();
      await expect.poll(() => googleUrl?.pathname).toBe('/o/oauth2/v2/auth');
    } else {
      await expect(dialog).toContainText(es.StylistBot.signInUnavailable);
    }
  });

  test('signed in: order cards link to the order page', async ({ page, context, baseURL }) => {
    test.skip(!AUTH_ENABLED, 'Sin BETTER_AUTH_SECRET no hay sesiones');
    const user = await createTestSession();
    try {
      const order = await seedPaidOrder(user.id);
      await signIn(context, baseURL!, user);
      await mockStylist(page, (route) =>
        fulfillSse(route, [
          { type: 'text', text: `Tu pedido ${order.number} ya fue enviado.` },
          { type: 'orders', items: [order] },
          { type: 'done' },
        ]),
      );
      await page.goto('/es/catalog');
      await waitForApp(page);
      const dialog = await askInPanel(page, 'es', '¿Cómo van mis pedidos?');
      const cards = dialog.getByRole('list', { name: es.StylistBot.ordersLabel }).getByRole('listitem');
      await expect(cards).toHaveCount(1);
      await expect(cards.first().getByRole('heading', { level: 3 })).toHaveText(order.number);
      await expect(cards.first()).toContainText(es.Orders.stage.shipped);
      await expect(cards.first()).toContainText(translate('es', 'StylistBot.orderTotal', { total: formatPrice(order.total, 'es') }));
      await expect(cards.first()).toContainText(es.Orders.stage.in_transit);
      const link = cards.first().getByRole('link', { name: translate('es', 'StylistBot.viewOrderLabel', { number: order.number }) });
      await expect(link).toHaveAttribute('href', `/es/orders/${order.id}`);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`/es/orders/${order.id}$`));
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(order.number);
    } finally {
      await deleteTestUser(user);
    }
  });

  test('fallback notices are translated (English, no model)', async ({ page }) => {
    const order: StylistOrder = {
      id: randomUUID(),
      number: 'AS-2026-000123',
      status: 'paid',
      createdAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      itemCount: 2,
      total: { amountCents: 33000, currency: 'USD' },
      trackingStage: 'delivered',
      nextStepAt: null,
    };
    await mockStylist(page, (route) => fulfillSse(route, [{ type: 'notice', code: 'orders_found', count: 1 }, { type: 'orders', items: [order] }, { type: 'done' }]));
    await page.goto('/en/catalog');
    await waitForApp(page);
    const dialog = await askInPanel(page, 'en', 'What did I buy last time?');
    await expect(dialog.getByRole('log')).toContainText(translate('en', 'StylistBot.notice.orders_found', { count: 1 }));
    const card = dialog.getByRole('list', { name: en.StylistBot.ordersLabel }).getByRole('listitem');
    await expect(card).toContainText(en.Orders.stage.delivered);
    await expect(card.getByRole('link', { name: translate('en', 'StylistBot.viewOrderLabel', { number: order.number }) })).toHaveAttribute('href', `/en/orders/${order.id}`);
  });

  test('order questions still reach the API after the AI went offline', async ({ page }) => {
    let calls = 0;
    await mockStylist(page, async (route) => {
      calls += 1;
      // La primera pregunta: IA no disponible (el resto de la visita usa el guion).
      if (calls === 1) return fulfillSse(route, [{ type: 'error', code: 'unavailable' }]);
      await fulfillSse(route, [{ type: 'notice', code: 'sign_in_required' }, { type: 'sign_in' }, { type: 'done' }]);
    });
    await page.goto('/es/catalog');
    await waitForApp(page);
    const dialog = await askInPanel(page, 'es', 'Busco algo para la oficina');
    await expect(dialog.getByRole('log')).toContainText(stylistEs.HomeStylist.freeReply.slice(0, 20));
    const input = dialog.getByRole('textbox', { name: es.StylistBot.inputLabel });
    // Otra pregunta cualquiera ya no llama a la API...
    await input.fill('¿Y algo para el fin de semana?');
    await input.press('Enter');
    await expect(dialog.getByRole('log').locator('p').last()).not.toHaveText('');
    expect(calls).toBe(1);
    // ...pero una de pedidos sí (la API responde con datos aunque no haya IA).
    await input.fill('¿Cómo van mis pedidos?');
    await input.press('Enter');
    await expect(dialog.getByRole('log')).toContainText(es.StylistBot.notice.sign_in_required);
    expect(calls).toBe(2);
  });
});

test.afterAll(async () => {
  await pool?.end();
  pool = null;
});
