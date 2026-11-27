import { AUTH_ENABLED, createTestSession, deleteTestUser, GOOGLE_LOGIN_ENABLED, sessionCount, signIn, type TestUser } from './auth';
import { en, es, expect, test, translate, waitForApp } from './fixtures';

// Login con Google (docs/plan-paso-5.md, fase 1) sin pasar por Google: la
// sesión se crea directo en la base (e2e/auth.ts). El flujo real con Google
// lo prueba el dueño con su cuenta.

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000';
const menuLabel = (locale: 'es' | 'en', name: string) => translate(locale, 'Account.menuLabel', { name });

test.describe('cuenta: sin sesión', () => {
  test('get-session responde null sin cookie', async ({ request }) => {
    const response = await request.get('/api/auth/get-session');
    expect(response.status()).toBe(200);
    expect(await response.json()).toBeNull();
  });

  test('el botón de entrar aparece solo con las claves de Google', async ({ page, consoleErrors }) => {
    await page.goto('/es');
    await waitForApp(page);
    const signInButton = page.getByRole('banner').getByRole('button', { name: es.Account.signInLabel });
    if (GOOGLE_LOGIN_ENABLED) await expect(signInButton).toBeVisible();
    else await expect(signInButton).toHaveCount(0);
    // Nunca aparece un menú de usuario sin sesión.
    await expect(page.getByRole('button', { name: menuLabel('es', 'Ada Prueba') })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('entrar lleva a Google con el cliente y la URL de retorno correctos', async ({ page, baseURL }) => {
    test.skip(!GOOGLE_LOGIN_ENABLED, 'Sin claves de Google no hay botón de entrar');
    let googleUrl: URL | null = null;
    // Nunca se llega a Google: se responde una página vacía.
    await page.route('https://accounts.google.com/**', (route) => {
      googleUrl = new URL(route.request().url());
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Google</title>' });
    });
    await page.goto('/es/catalog');
    await waitForApp(page);
    await page.getByRole('banner').getByRole('button', { name: es.Account.signInLabel }).click();
    await expect.poll(() => googleUrl?.pathname).toBe('/o/oauth2/v2/auth');
    const url = googleUrl as unknown as URL;
    expect(url.searchParams.get('client_id')).toBe(process.env.GOOGLE_CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(new URL('/api/auth/callback/google', baseURL).toString());
    expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual(['email', 'openid', 'profile']);
    // El estado del flujo viaja en una cookie httpOnly y SameSite=Lax.
    const state = (await page.context().cookies()).find((cookie) => cookie.name.endsWith('better-auth.state'));
    expect(state?.httpOnly).toBe(true);
    expect(state?.sameSite).toBe('Lax');
  });

  test('pasar el cursor por Iniciar sesión despierta la base una sola vez cada 4 minutos', async ({ page }) => {
    test.skip(!GOOGLE_LOGIN_ENABLED, 'Sin claves de Google no hay botón de entrar');
    const warms: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/warm') warms.push(request.method());
    });
    await page.goto('/es/catalog');
    await waitForApp(page);
    // Cargar la página no despierta la base: solo la intención.
    await page.waitForTimeout(500);
    expect(warms).toEqual([]);
    const signInButton = page.getByRole('banner').getByRole('button', { name: es.Account.signInLabel });
    const response = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/warm');
    await signInButton.hover();
    expect((await response).status()).toBe(204);
    expect(warms).toEqual(['POST']);
    // Otro paso del cursor (y una recarga, misma pestaña) dentro de los 4 minutos: nada.
    await page.mouse.move(10, 400);
    await signInButton.hover();
    await page.reload();
    await waitForApp(page);
    await signInButton.hover();
    await page.waitForTimeout(500);
    expect(warms).toEqual(['POST']);
  });

  test('la página de cuenta explica un error de Google', async ({ page }) => {
    await page.goto('/es/account?error=access_denied');
    await expect(page.getByRole('alert', { name: es.Account.errorTitle })).toContainText(es.Account.errorCancelled);
    await page.goto('/en/account?error=state_mismatch');
    await expect(page.getByRole('alert', { name: en.Account.errorTitle })).toContainText(en.Account.errorGeneric);
  });

  test('Mis pedidos sin sesión pide iniciar sesión', async ({ page }) => {
    await page.goto('/es/orders');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(es.Orders.title);
    await expect(page.getByRole('heading', { name: es.Orders.signInTitle })).toBeVisible();
  });
});

test.describe('cuenta: con sesión', () => {
  test.skip(!AUTH_ENABLED, 'Sin BETTER_AUTH_SECRET no hay sesiones');
  let user: TestUser;

  test.beforeEach(async ({ context, baseURL }) => {
    user = await createTestSession();
    await signIn(context, baseURL!, user);
  });

  test.afterEach(async () => {
    await deleteTestUser(user);
  });

  test('get-session y la API ven al mismo usuario', async ({ page }) => {
    const response = await page.request.get('/api/auth/get-session');
    const body = await response.json();
    expect(body.user).toMatchObject({ id: user.id, name: user.name, email: user.email });
    // La API lo reconoce con el token que la web le reenvía (Authorization).
    const me = await page.request.get(`${API_URL}/v1/me`, { headers: { Authorization: `Bearer ${user.token}` } });
    expect(me.status()).toBe(200);
    expect(await me.json()).toEqual({ id: user.id, name: user.name, email: user.email, image: null });
  });

  test('menú del usuario: teclado, Mis pedidos y cerrar sesión', async ({ page, consoleErrors }) => {
    await page.goto('/es/catalog');
    await waitForApp(page);
    const header = page.getByRole('banner');
    const userButton = header.getByRole('button', { name: menuLabel('es', user.name) });
    await expect(userButton).toBeVisible();
    // Sin foto: las iniciales.
    await expect(userButton).toContainText('AP');
    await expect(header.getByRole('button', { name: es.Account.signInLabel })).toHaveCount(0);

    // Teclado: flecha abajo abre y enfoca la primera opción; Escape cierra y
    // devuelve el foco al botón.
    await userButton.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.getByRole('menu', { name: menuLabel('es', user.name) });
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(user.email);
    await expect(menu.getByRole('menuitem', { name: es.Account.orders })).toBeFocused();
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem', { name: es.Account.signOut })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(userButton).toBeFocused();
    await expect(userButton).toHaveAttribute('aria-expanded', 'false');

    // Mis pedidos.
    await userButton.click();
    await menu.getByRole('menuitem', { name: es.Account.orders }).click();
    await expect(page).toHaveURL(/\/es\/orders$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(es.Orders.title);

    // Cerrar sesión: borra la sesión de la base y vuelve el botón de entrar.
    await userButton.click();
    await menu.getByRole('menuitem', { name: es.Account.signOut }).click();
    await expect(userButton).toHaveCount(0);
    await expect.poll(() => sessionCount(user)).toBe(0);
    if (GOOGLE_LOGIN_ENABLED) await expect(header.getByRole('button', { name: es.Account.signInLabel })).toBeVisible();
    expect(await (await page.request.get('/api/auth/get-session')).json()).toBeNull();
    expect(consoleErrors).toEqual([]);
  });

  test('textos en inglés y página de cuenta', async ({ page }) => {
    await page.goto('/en/account');
    await waitForApp(page);
    await expect(page.getByRole('banner').getByRole('button', { name: menuLabel('en', user.name) })).toBeVisible();
    await expect(page.getByRole('heading', { name: user.name })).toBeVisible();
    await expect(page.locator('main')).toContainText(user.email);
    await expect(page.locator('main').getByRole('button', { name: en.Account.signOut, exact: true })).toBeVisible();
  });

  test('el carrito local sigue igual con sesión', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('cart-seeded')) {
          localStorage.setItem('airspace-cart', JSON.stringify({ state: { items: [{ slug: 'adidas-trionda-2026', size: '5', quantity: 2 }] }, version: 0 }));
          sessionStorage.setItem('cart-seeded', '1');
        }
      } catch {
        // Sin almacenamiento la prueba falla abajo con un mensaje claro.
      }
    });
    await page.goto('/es');
    await waitForApp(page);
    const cartButton = page.locator('[aria-controls="cart-panel"]');
    await expect(cartButton).toHaveAccessibleName(translate('es', 'Cart.buttonLabel', { count: 2 }));
    await page.reload();
    await waitForApp(page);
    await expect(page.getByRole('banner').getByRole('button', { name: menuLabel('es', user.name) })).toBeVisible();
    await expect(cartButton).toHaveAccessibleName(translate('es', 'Cart.buttonLabel', { count: 2 }));
  });
});

test.describe('cuenta en el teléfono', () => {
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

  test('la cuenta vive en el menú del teléfono', async ({ page }) => {
    await page.goto('/es');
    await waitForApp(page);
    const header = page.getByRole('banner');
    // El botón del encabezado se oculta; el menú trae la cuenta.
    await expect(header.getByRole('button', { name: menuLabel('es', user.name) })).toBeHidden();
    await header.getByRole('button', { name: es.Header.menuOpen }).click();
    const nav = page.locator('#site-nav');
    await expect(nav).toContainText(user.name);
    await expect(nav.getByRole('link', { name: es.Account.orders })).toBeVisible();
    await nav.getByRole('button', { name: es.Account.signOut }).click();
    await expect(nav.getByText(user.name)).toHaveCount(0);
    await expect.poll(() => sessionCount(user)).toBe(0);
  });
});
