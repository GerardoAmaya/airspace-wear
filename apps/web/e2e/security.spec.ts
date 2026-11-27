import { AUTH_ENABLED, createTestSession, deleteTestUser, GOOGLE_LOGIN_ENABLED, sessionCount, signedSessionCookie } from './auth';
import { expect, test, waitForApp } from './fixtures';

// Revisión de seguridad (docs/security.md): cabeceras y CSP sin romper el
// sitio, sin redirecciones abiertas al iniciar sesión, CSRF en las rutas de
// cuenta y el puente del estilista solo con JSON.

const EVIL = 'https://evil.example.com';

test.describe('seguridad: cabeceras', () => {
  for (const path of ['/es', '/en/products/air-jordan-1', '/api/stylist/context?locale=es']) {
    test(`cabeceras de seguridad en ${path}`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const headers = response.headers();
      const csp = headers['content-security-policy'] ?? '';
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload');
      expect(headers['permissions-policy']).toContain('camera=(self)');
      expect(headers['permissions-policy']).toContain('microphone=()');
      expect(headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(headers['x-powered-by']).toBeUndefined();
    });
  }

  test('la CSP no bloquea nada en la home ni en una ficha', async ({ page, consoleErrors }) => {
    const violations: string[] = [];
    await page.exposeFunction('reportCspViolation', (entry: string) => violations.push(entry));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        void (window as unknown as { reportCspViolation: (entry: string) => void }).reportCspViolation(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    for (const path of ['/es', '/en/products/air-jordan-1']) {
      await page.goto(path);
      await waitForApp(page);
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(1500);
    }
    expect(violations).toEqual([]);
    expect(consoleErrors.filter((error) => /Content Security Policy/i.test(error))).toEqual([]);
  });
});

test.describe('seguridad: cuenta', () => {
  test('iniciar sesión no acepta URLs de retorno de otro sitio (sin redirección abierta)', async ({ request, baseURL }) => {
    test.skip(!GOOGLE_LOGIN_ENABLED, 'Sin claves de Google no hay inicio de sesión');
    const signIn = (body: object) => request.post('/api/auth/sign-in/social', { data: { provider: 'google', ...body }, headers: { origin: baseURL! } });
    for (const target of [`${EVIL}/robar`, '//evil.example.com', 'javascript:alert(1)']) {
      expect((await signIn({ callbackURL: target })).status(), target).toBe(403);
      expect((await signIn({ callbackURL: '/es', errorCallbackURL: target })).status(), target).toBe(403);
    }
    const ok = await signIn({ callbackURL: '/es/account' });
    expect(ok.status()).toBe(200);
    expect(new URL(((await ok.json()) as { url: string }).url).hostname).toBe('accounts.google.com');
  });

  test('una petición con cookie de sesión desde otro origen se rechaza (CSRF)', async ({ request, baseURL }) => {
    test.skip(!AUTH_ENABLED, 'Sin BETTER_AUTH_SECRET no hay sesiones');
    const user = await createTestSession();
    try {
      const cookie = `better-auth.session_token=${signedSessionCookie(user.token)}`;
      const forged = await request.post('/api/auth/revoke-other-sessions', { headers: { cookie, origin: EVIL }, data: {} });
      expect(forged.status()).toBe(403);
      const signOut = await request.post('/api/auth/sign-out', { headers: { cookie, origin: EVIL }, data: {} });
      expect(signOut.status()).toBe(403);
      // La sesión sigue viva: ninguna de las dos hizo efecto.
      expect(await sessionCount(user)).toBe(1);
      // Control: la misma petición desde el origen del sitio sí pasa (la cookie es válida).
      const legit = await request.post('/api/auth/revoke-other-sessions', { headers: { cookie, origin: baseURL! }, data: {} });
      expect(legit.status()).toBe(200);
    } finally {
      await deleteTestUser(user);
    }
  });
});

test.describe('seguridad: rutas del servidor', () => {
  test('el puente del estilista solo acepta JSON', async ({ request }) => {
    const response = await request.post('/api/stylist/chat', { headers: { 'content-type': 'text/plain' }, data: '{"locale":"es","messages":[{"role":"user","content":"hola"}]}' });
    expect(response.status()).toBe(415);
  });

  test('el puente del estilista corta cuerpos enormes', async ({ request }) => {
    const response = await request.post('/api/stylist/chat', { headers: { 'content-type': 'application/json' }, data: JSON.stringify({ locale: 'es', messages: [{ role: 'user', content: 'x'.repeat(200_000) }] }) });
    expect(response.status()).toBe(413);
  });

  test('los archivos sensibles no existen', async ({ request }) => {
    for (const path of ['/.env', '/.git/config', '/api/../.env']) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
      expect(await response.text()).not.toMatch(/DATABASE_URL|BETTER_AUTH_SECRET|\[core\]/);
    }
  });
});
