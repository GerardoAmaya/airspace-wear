import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { formatPrice } from '../lib/price';
import { AUTH_ENABLED, createTestSession, deleteTestUser, GOOGLE_LOGIN_ENABLED, sessionCount, signIn, type TestUser } from './auth';
import { en, es, expect, test, waitForApp } from './fixtures';

// Página "Mi cuenta" (paso 5): perfil, resumen, pedidos recientes,
// preferencias y sesión. Las sesiones y los pedidos se siembran directo en
// la base local (como e2e/auth.ts y e2e/orders.spec.ts).

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://airspace:airspace@127.0.0.1:5434/airspace';
let pool: Pool | null = null;
const db = () => (pool ??= new Pool({ connectionString: DATABASE_URL, max: 2 }));

// Pedido sembrado: pagado hace minutesAgo minutos (null: pendiente).
async function seedOrder(user: TestUser, { minutesAgo, cents }: { minutesAgo: number | null; cents: number }): Promise<string> {
  const id = randomUUID();
  const paid = minutesAgo !== null;
  await db().query(
    `INSERT INTO "Order" (id, "userId", status, "subtotalCents", "totalCents", locale, "paidAt", "trackingNumber", "createdAt")
     VALUES ($1, $2, $3, $4, $4, 'es', $5, $6, now() - interval '1 hour')`,
    [id, user.id, paid ? 'paid' : 'pending', cents, paid ? new Date(Date.now() - minutesAgo * 60_000) : null, paid ? `ASW${randomBytes(6).toString('hex')}` : null],
  );
  await db().query(
    `INSERT INTO "OrderItem" ("orderId", slug, brand, "nameEs", "nameEn", size, "unitPriceCents", quantity) VALUES ($1, 'air-jordan-1', 'Jordan', 'AJ1 prueba', 'AJ1 test', '42', $2, 1)`,
    [id, cents],
  );
  return id;
}

// Otra sesión del mismo usuario (otro navegador o teléfono).
async function addSession(user: TestUser): Promise<void> {
  const suffix = randomBytes(6).toString('hex');
  await db().query('INSERT INTO "session" (id, token, "expiresAt", "userId") VALUES ($1, $2, now() + interval \'1 hour\', $3)', [`e2e-session-${suffix}`, `e2e${suffix}token`, user.id]);
}

test.describe('mi cuenta: sin sesión', () => {
  test('muestra la tarjeta para entrar con Google', async ({ page, consoleErrors }) => {
    await page.goto('/es/account');
    await waitForApp(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(es.Account.title);
    const main = page.locator('main');
    if (GOOGLE_LOGIN_ENABLED) {
      await expect(main.getByRole('heading', { name: es.Account.signInTitle })).toBeVisible();
      await expect(main.getByRole('button', { name: es.Account.signInLabel })).toBeVisible();
    } else {
      await expect(main).toContainText(es.Account.unavailable);
    }
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('mi cuenta: con sesión', () => {
  test.skip(!AUTH_ENABLED, 'Sin BETTER_AUTH_SECRET no hay sesiones');
  let user: TestUser;

  test.beforeEach(async ({ context, baseURL }) => {
    user = await createTestSession({ name: 'Ada Prueba' });
    await signIn(context, baseURL!, user);
  });

  test.afterEach(async () => {
    await deleteTestUser(user);
  });

  test('perfil, resumen en cero y pedidos vacíos', async ({ page, consoleErrors }) => {
    await page.goto('/es/account');
    await waitForApp(page);
    const main = page.locator('main');
    const profile = main.getByRole('region', { name: user.name });
    await expect(profile.getByRole('heading', { name: user.name })).toBeVisible();
    await expect(profile).toContainText(user.email);
    await expect(profile).toContainText(es.Account.sessionActive);
    await expect(profile).toContainText(es.Account.memberSince);
    await expect(profile.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);

    const stats = main.getByRole('region', { name: es.Account.statsTitle });
    await expect(stats).toContainText(es.Account.statOrders);
    await expect(stats.locator('[data-stat="orders"] .visually-hidden')).toHaveText('0');
    await expect(stats.locator('[data-stat="spent"] .visually-hidden')).toHaveText(formatPrice({ amountCents: 0, currency: 'USD' }, 'es'));
    await expect(stats).toContainText(es.Account.statNone);

    const recent = main.getByRole('region', { name: es.Account.recentTitle });
    await expect(recent.getByRole('heading', { name: es.Account.emptyTitle })).toBeVisible();
    await recent.getByRole('link', { name: es.Account.browse }).click();
    await expect(page).toHaveURL(/\/es\/catalog$/);
    expect(consoleErrors).toEqual([]);
  });

  test('pedidos recientes y resumen con pedidos', async ({ page }) => {
    await seedOrder(user, { minutesAgo: 30, cents: 25000 });
    await seedOrder(user, { minutesAgo: 2, cents: 18000 });
    await seedOrder(user, { minutesAgo: null, cents: 7500 });
    const latest = await seedOrder(user, { minutesAgo: 1, cents: 9900 });
    await page.goto('/es/account');
    await waitForApp(page);
    const main = page.locator('main');
    const stats = main.getByRole('region', { name: es.Account.statsTitle });
    // Solo cuentan los pagados.
    await expect(stats.locator('[data-stat="orders"] .visually-hidden')).toHaveText('3');
    await expect(stats.locator('[data-stat="spent"] .visually-hidden')).toHaveText(formatPrice({ amountCents: 52900, currency: 'USD' }, 'es'));
    // El contador termina en el valor final.
    await expect(stats.locator('[data-stat="orders"] [data-count]')).toHaveText('3');

    const recent = main.getByRole('region', { name: es.Account.recentTitle });
    // Hasta 3 tarjetas, cada una lleva a su pedido.
    await expect(recent.locator('a[href*="/orders/"]')).toHaveCount(3);
    await expect(recent.getByRole('link', { name: es.Account.viewAll })).toHaveAttribute('href', '/es/orders');
    await recent.locator(`a[href="/es/orders/${latest}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/es/orders/${latest}$`));
  });

  test('preferencias: idioma y tema', async ({ page }) => {
    await page.goto('/es/account');
    await waitForApp(page);
    const prefs = page.locator('main').getByRole('region', { name: es.Account.preferencesTitle });
    await expect(prefs).toHaveAttribute('data-ready', '');
    const dark = prefs.getByRole('button', { name: es.Theme.night });
    const light = prefs.getByRole('button', { name: es.Theme.day });
    await expect(dark).toHaveAttribute('aria-pressed', 'true');
    await light.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(light).toHaveAttribute('aria-pressed', 'true');
    await expect(dark).toHaveAttribute('aria-pressed', 'false');
    await dark.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await expect(prefs.getByRole('link', { name: es.LocaleSwitch.es })).toHaveAttribute('aria-current', 'true');
    await prefs.getByRole('link', { name: es.LocaleSwitch.en }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.Account.title);
    const prefsEn = page.locator('main').getByRole('region', { name: en.Account.preferencesTitle });
    await expect(prefsEn.getByRole('link', { name: en.LocaleSwitch.en })).toHaveAttribute('aria-current', 'true');
  });

  test('cerrar sesión vuelve a la home', async ({ page, consoleErrors }) => {
    await page.goto('/es/account');
    await waitForApp(page);
    const session = page.locator('main').getByRole('region', { name: es.Account.sessionTitle });
    // El panel llega en streaming: data-ready marca que ya hidrató.
    await expect(session).toHaveAttribute('data-ready', '');
    await session.getByRole('button', { name: es.Account.signOut, exact: true }).click();
    await expect(page).toHaveURL(/\/es$/);
    await expect.poll(() => sessionCount(user)).toBe(0);
    expect(await (await page.request.get('/api/auth/get-session')).json()).toBeNull();
    expect(consoleErrors).toEqual([]);
  });

  test('cerrar sesión en todos los dispositivos', async ({ page }) => {
    await addSession(user);
    expect(await sessionCount(user)).toBe(2);
    await page.goto('/es/account');
    await waitForApp(page);
    const session = page.locator('main').getByRole('region', { name: es.Account.sessionTitle });
    // El panel llega en streaming: data-ready marca que ya hidrató.
    await expect(session).toHaveAttribute('data-ready', '');
    await session.getByRole('button', { name: es.Account.signOutAll }).click();
    await expect(page).toHaveURL(/\/es$/);
    await expect.poll(() => sessionCount(user)).toBe(0);
  });

  test('con movimiento reducido todo se ve al instante', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedOrder(user, { minutesAgo: 6, cents: 18000 });
    await page.goto('/es/account');
    await waitForApp(page);
    const blocks = page.locator('main [data-enter]');
    await expect(blocks).toHaveCount(5);
    // Sin esperar ninguna entrada: opacidad final y números con su valor.
    const opacities = await page.locator('main [data-enter], main [data-enter] [data-item], main [data-enter] [data-name]').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).opacity));
    expect(opacities.every((value) => value === '1')).toBe(true);
    await expect(page.locator('[data-stat="orders"] [data-count]')).toHaveText('1');
    await expect(page.locator('[data-stat="spent"] [data-count]')).toHaveText(formatPrice({ amountCents: 18000, currency: 'USD' }, 'es'));
  });
});

test.describe('mi cuenta en el teléfono', () => {
  test.skip(!AUTH_ENABLED, 'Sin BETTER_AUTH_SECRET no hay sesiones');
  test.use({ viewport: { width: 390, height: 844 } });
  let user: TestUser;

  test.beforeEach(async ({ context, baseURL }) => {
    user = await createTestSession({ name: 'Grace Hopper' });
    await signIn(context, baseURL!, user);
  });

  test.afterEach(async () => {
    await deleteTestUser(user);
  });

  test('una sola columna sin scroll horizontal', async ({ page }) => {
    await page.goto('/es/account');
    await waitForApp(page);
    const main = page.locator('main');
    const profile = await main.getByRole('region', { name: user.name }).boundingBox();
    const stats = await main.getByRole('region', { name: es.Account.statsTitle }).boundingBox();
    expect(profile && stats && Math.abs(profile.x - stats.x) < 1 && stats.y > profile.y).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
