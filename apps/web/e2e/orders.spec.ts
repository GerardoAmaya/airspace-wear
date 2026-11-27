import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { Pool } from 'pg';
import { formatPrice } from '../lib/price';
import { AUTH_ENABLED, createTestSession, deleteTestUser, GOOGLE_LOGIN_ENABLED, signIn, type TestUser } from './auth';
import { en, es, expect, test, translate, waitForApp } from './fixtures';

// Pago de prueba y pedidos (docs/plan-paso-5.md, fases 2 y 3). Los pedidos
// se siembran directo en la base local (como las sesiones de e2e/auth.ts);
// Stripe nunca se abre en el navegador: la página de pago se intercepta.

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://airspace:airspace@127.0.0.1:5434/airspace';
let pool: Pool | null = null;
const db = () => (pool ??= new Pool({ connectionString: DATABASE_URL, max: 2 }));

const BALL = 'adidas-trionda-2026';
const CART = (items: { slug: string; size?: string; quantity: number }[]) =>
  JSON.stringify({ state: { items: items.map((item) => ({ id: item.size ? `${item.slug}:${item.size}` : item.slug, ...item })) }, version: 1 });

async function seedCart(page: Page, items: { slug: string; size?: string; quantity: number }[]) {
  await page.addInitScript((value) => localStorage.setItem('airspace-cart', value), CART(items));
}

// Pedido sembrado: pagado hace minutesAgo minutos (null: pendiente).
async function seedOrder(user: TestUser, { minutesAgo, locale = 'es' }: { minutesAgo: number | null; locale?: 'es' | 'en' }): Promise<{ id: string; seq: number }> {
  const id = randomUUID();
  const paid = minutesAgo !== null;
  const { rows } = await db().query<{ seq: number }>(
    `INSERT INTO "Order" (id, "userId", status, "subtotalCents", "totalCents", locale, "paidAt", "trackingNumber", "createdAt")
     VALUES ($1, $2, $3, 33000, 33000, $4, $5, $6, now() - interval '1 hour') RETURNING seq`,
    [id, user.id, paid ? 'paid' : 'pending', locale, paid ? new Date(Date.now() - minutesAgo * 60_000) : null, paid ? `ASW${String(Date.now()).slice(-12)}` : null],
  );
  await db().query(
    `INSERT INTO "OrderItem" ("orderId", slug, brand, "nameEs", "nameEn", "detailEs", "detailEn", size, "unitPriceCents", quantity, "sortOrder")
     VALUES ($1, 'air-jordan-1', 'Jordan', 'Air Jordan 1 prueba', 'Air Jordan 1 test', 'Rojo', 'Red', '42', 18000, 1, 0),
            ($1, $2, 'Adidas', 'Balón prueba', 'Test ball', NULL, NULL, '5', 7500, 2, 1)`,
    [id, BALL],
  );
  return { id, seq: rows[0]!.seq };
}

const orderNumber = (seq: number) => `AS-${new Date().getUTCFullYear()}-${String(seq).padStart(6, '0')}`;

test.describe('carrito: pagar', () => {
  test('muestra el aviso de modo de prueba y el botón Pagar', async ({ page }) => {
    await seedCart(page, [{ slug: BALL, size: '5', quantity: 1 }]);
    // ?cart=open abre el carrito al llegar (vuelta de Google o de Stripe) y se quita de la URL.
    await page.goto('/es/catalog?cart=open');
    await waitForApp(page);
    const drawer = page.getByRole('dialog', { name: es.Cart.title });
    await expect(drawer).toBeVisible();
    await expect(page).not.toHaveURL(/cart=open/);
    await expect(drawer.getByRole('complementary', { name: es.Checkout.testModeLabel })).toContainText('4242 4242 4242 4242');
    await expect(drawer.getByRole('button', { name: es.Cart.pay })).toBeEnabled();
  });

  test('sin sesión, Pagar lleva a Google y vuelve con el carrito abierto', async ({ page }) => {
    await seedCart(page, [{ slug: BALL, size: '5', quantity: 1 }]);
    let googleUrl: URL | null = null;
    await page.route('https://accounts.google.com/**', (route) => {
      googleUrl = new URL(route.request().url());
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Google</title>' });
    });
    await page.goto('/es/catalog?cart=open');
    await waitForApp(page);
    const drawer = page.getByRole('dialog', { name: es.Cart.title });
    await drawer.getByRole('button', { name: es.Cart.pay }).click();
    if (!GOOGLE_LOGIN_ENABLED) {
      await expect(drawer.getByRole('alert')).toHaveText(es.Cart.checkoutError.signin_unavailable);
      return;
    }
    await expect.poll(() => googleUrl?.pathname).toBe('/o/oauth2/v2/auth');
    // El carrito no se vació.
    expect(await page.evaluate(() => localStorage.getItem('airspace-cart'))).toContain(BALL);
  });

  test('con sesión, Pagar crea el pedido y abre Stripe Checkout (o avisa si no está configurado)', async ({ page, context, baseURL }) => {
    test.skip(!AUTH_ENABLED, 'Sin BETTER_AUTH_SECRET no hay sesiones');
    const user = await createTestSession();
    try {
      await signIn(context, baseURL!, user);
      await seedCart(page, [{ slug: BALL, size: '5', quantity: 2 }]);
      let stripeUrl: URL | null = null;
      // Nunca se carga la página de Stripe: se responde una vacía.
      await page.route('https://checkout.stripe.com/**', (route) => {
        stripeUrl = new URL(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Stripe</title>' });
      });
      await page.goto('/es/catalog?cart=open');
      await waitForApp(page);
      const drawer = page.getByRole('dialog', { name: es.Cart.title });
      await drawer.getByRole('button', { name: es.Cart.pay }).click();
      // Sin claves de Stripe en la API, el carrito lo explica y sigue igual.
      const alert = drawer.getByRole('alert');
      let outcome: 'stripe' | 'off' | null = null;
      await expect
        .poll(
          async () => {
            const stripeHost = (stripeUrl as URL | null)?.hostname;
            if (stripeHost === 'checkout.stripe.com') outcome = 'stripe';
            else if ((await alert.textContent({ timeout: 500 }).catch(() => '')) === es.Cart.checkoutError.payments_unavailable) outcome = 'off';
            return outcome;
          },
          { timeout: 20_000 },
        )
        .not.toBeNull();
      const { rows } = await db().query<{ status: string; totalCents: number; count: string }>(
        `SELECT o.status, o."totalCents", count(i.*) FROM "Order" o JOIN "OrderItem" i ON i."orderId" = o.id WHERE o."userId" = $1 GROUP BY o.id`,
        [user.id],
      );
      if (outcome === 'stripe') {
        expect(rows).toHaveLength(1);
        expect(rows[0]!.status).toBe('pending');
        // El carrito sigue hasta que el pago se confirme.
        expect(await page.evaluate(() => localStorage.getItem('airspace-cart'))).toContain(BALL);
      } else {
        expect(rows).toHaveLength(0);
      }
    } finally {
      await deleteTestUser(user);
    }
  });
});

test.describe('mis pedidos', () => {
  test('sin sesión pide iniciar sesión y no se indexa', async ({ page }) => {
    await page.goto('/es/orders');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(es.Orders.title);
    await expect(page.getByRole('heading', { name: es.Orders.signInTitle })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('lista, detalle con seguimiento y vuelta de Stripe que vacía el carrito', async ({ page, context, baseURL }) => {
    test.skip(!AUTH_ENABLED, 'Sin BETTER_AUTH_SECRET no hay sesiones');
    const user = await createTestSession();
    const other = await createTestSession({ name: 'Otra Persona' });
    try {
      const shipped = await seedOrder(user, { minutesAgo: 12 });
      const pending = await seedOrder(user, { minutesAgo: null });
      const foreign = await seedOrder(other, { minutesAgo: 1 });
      await signIn(context, baseURL!, user);

      await page.goto('/es/orders');
      await waitForApp(page);
      const rows = page.getByRole('link', { name: new RegExp(`^${translate('es', 'Orders.viewOrder', { number: 'AS-' })}`) });
      await expect(rows).toHaveCount(2);
      const shippedRow = page.getByRole('link', { name: translate('es', 'Orders.viewOrder', { number: orderNumber(shipped.seq) }) });
      await expect(shippedRow).toContainText(es.Orders.stage.shipped);
      await expect(shippedRow).toContainText(formatPrice({ amountCents: 33000, currency: 'USD' }, 'es'));
      await expect(shippedRow).toContainText(translate('es', 'Orders.itemCount', { count: 3 }));
      await expect(page.getByRole('link', { name: translate('es', 'Orders.viewOrder', { number: orderNumber(pending.seq) }) })).toContainText(es.Orders.status.pending);
      await expect(page.getByText(orderNumber(foreign.seq))).toHaveCount(0);

      // Vuelta de Stripe con el pedido ya pagado: aviso y carrito vacío.
      await seedCart(page, [{ slug: BALL, size: '5', quantity: 1 }]);
      await page.goto(`/es/orders/${shipped.id}?paid=1`);
      await waitForApp(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(orderNumber(shipped.seq));
      await expect(page.getByRole('heading', { name: es.Orders.paidTitle })).toBeVisible();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('airspace-cart') ?? '{}').state?.items?.length)).toBe(0);

      // Seguimiento: a los 12 minutos, Enviado es el paso actual.
      const steps = page.getByRole('list', { name: es.Orders.trackingLabel }).getByRole('listitem');
      await expect(steps).toHaveCount(5);
      await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step');
      await expect(steps.nth(2)).toContainText(es.Orders.stage.shipped);
      await expect(steps.nth(0)).toHaveAttribute('data-state', 'done');
      await expect(steps.nth(4)).toHaveAttribute('data-state', 'upcoming');
      await expect(page.getByText('Air Jordan 1 prueba')).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

      // En inglés, los nombres guardados en inglés.
      await page.goto(`/en/orders/${shipped.id}`);
      await expect(page.getByText('Air Jordan 1 test')).toBeVisible();
      await expect(page.getByRole('list', { name: en.Orders.trackingLabel })).toBeVisible();

      // El pedido de otra persona responde 404.
      const response = await page.goto(`/es/orders/${foreign.id}`);
      expect(response?.status()).toBeLessThan(500);
      await expect(page.getByText('Air Jordan 1 prueba')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(orderNumber(foreign.seq));
    } finally {
      await deleteTestUser(user);
      await deleteTestUser(other);
    }
  });

  test('en el teléfono la línea de tiempo es vertical', async ({ browser, baseURL }) => {
    test.skip(!AUTH_ENABLED, 'Sin BETTER_AUTH_SECRET no hay sesiones');
    const user = await createTestSession();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const order = await seedOrder(user, { minutesAgo: 30 });
      await signIn(context, baseURL!, user);
      const page = await context.newPage();
      await page.goto(`/es/orders/${order.id}`);
      const steps = page.getByRole('list', { name: es.Orders.trackingLabel }).getByRole('listitem');
      await expect(steps).toHaveCount(5);
      // Entregado: todos completos y el aviso final.
      await expect(page.getByText(es.Orders.deliveredNote)).toBeVisible();
      const first = await steps.nth(0).boundingBox();
      const second = await steps.nth(1).boundingBox();
      expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);
      // Sin scroll horizontal.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } finally {
      await context.close();
      await deleteTestUser(user);
    }
  });
});
