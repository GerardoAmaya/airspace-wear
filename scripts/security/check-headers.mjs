// Chequeo de seguridad sin efectos, apto para producción (docs/security.md):
// cabeceras de la web y de la API, CORS, redirección abierta al iniciar
// sesión, flags de las cookies y rutas protegidas. Hace unas 15 peticiones,
// casi todas GET, y ninguna cambia datos.
//
// Uso:
//   pnpm security:check
//   pnpm security:check -- --web http://localhost:3100 --api http://127.0.0.1:4000
// Termina con código 1 si algo falla.

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1].replace(/\/$/, '') : fallback;
};
const WEB = option('web', 'https://airspace-wear-web.vercel.app');
const API = option('api', 'https://airspace-wear-api.vercel.app');
const HTTPS = WEB.startsWith('https://');

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? `  (${detail})` : ''}`);
};

async function get(url, init = {}) {
  return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), ...init });
}

// ---------- Web ----------
for (const path of ['/es', '/en/products/air-jordan-1']) {
  const response = await get(`${WEB}${path}`);
  const h = response.headers;
  const csp = h.get('content-security-policy') ?? '';
  console.log(`\nWeb ${path} (${response.status})`);
  check(response.status === 200, 'responde 200', String(response.status));
  for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'"]) check(csp.includes(directive), `CSP ${directive}`);
  check(!/'unsafe-eval'/.test(csp), "CSP sin 'unsafe-eval' (solo en desarrollo)");
  check(h.get('x-frame-options') === 'DENY', 'X-Frame-Options DENY', h.get('x-frame-options'));
  check(h.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options nosniff');
  check(h.get('referrer-policy') === 'strict-origin-when-cross-origin', 'Referrer-Policy', h.get('referrer-policy'));
  check(/max-age=(6307200\d|[7-9]\d{7}|\d{9,})/.test(h.get('strict-transport-security') ?? '') || !HTTPS, 'HSTS de 2 años', h.get('strict-transport-security'));
  check((h.get('permissions-policy') ?? '').includes('camera=(self)'), 'Permissions-Policy (cámara solo para el sitio)');
  check(h.get('cross-origin-opener-policy') === 'same-origin', 'Cross-Origin-Opener-Policy same-origin');
  check(!h.has('x-powered-by'), 'sin X-Powered-By', h.get('x-powered-by'));
}

console.log('\nWeb: rutas protegidas');
{
  const revalidate = await get(`${WEB}/api/revalidate`, { method: 'POST', headers: { 'x-revalidate-secret': 'not-the-secret' } });
  check(revalidate.status === 403 || revalidate.status === 429 || !HTTPS, 'POST /api/revalidate con un secreto falso: 403', String(revalidate.status));
  const fitting = await get(`${WEB}/api/dev/avatar-fitting`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check(fitting.status === 404 || !HTTPS, 'herramienta de desarrollo apagada (404)', String(fitting.status));
  const plain = await get(`${WEB}/api/stylist/chat`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hola' });
  check(plain.status === 415 || plain.status === 429, 'el puente del estilista rechaza text/plain', String(plain.status));
  for (const path of ['/.env', '/.git/config']) {
    // /.git/config redirige al idioma (/es/.git/config) y ahí responde 404.
    const response = await get(`${WEB}${path}`, { redirect: 'follow' });
    const text = await response.text();
    check(response.status === 404 && !/DATABASE_URL|BETTER_AUTH_SECRET|\[core\]/.test(text), `${path} no existe`, String(response.status));
  }
}

console.log('\nWeb: inicio de sesión');
{
  const signIn = (body) =>
    get(`${WEB}/api/auth/sign-in/social`, { method: 'POST', headers: { 'content-type': 'application/json', origin: WEB }, body: JSON.stringify({ provider: 'google', ...body }) });
  const external = await signIn({ callbackURL: 'https://evil.example.com/x' });
  check(external.status === 403 || external.status === 429, 'callbackURL de otro sitio: 403 (sin redirección abierta)', String(external.status));
  const relative = await signIn({ callbackURL: '//evil.example.com' });
  check(relative.status === 403 || relative.status === 429, 'callbackURL //otro-sitio: 403', String(relative.status));
  const ok = await signIn({ callbackURL: '/es/account' });
  if (ok.status === 200) {
    const cookie = ok.headers.getSetCookie().find((value) => value.includes('better-auth.state')) ?? '';
    check(/HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie), 'cookie de estado HttpOnly y SameSite=Lax', cookie.split(';')[0]?.split('=')[0]);
    if (HTTPS) check(/; Secure/i.test(cookie) && cookie.startsWith('__Secure-'), 'cookie Secure con prefijo __Secure-');
    const url = new URL((await ok.json()).url);
    check(url.hostname === 'accounts.google.com', 'redirige solo a Google', url.hostname);
  } else {
    check(ok.status === 429 || ok.status === 404, 'inicio de sesión disponible o limitado', String(ok.status));
  }
}

// ---------- API ----------
console.log('\nAPI');
{
  const response = await get(`${API}/v1/brands`);
  const h = response.headers;
  check(response.status === 200, 'GET /v1/brands responde 200', String(response.status));
  check((h.get('content-security-policy') ?? '').startsWith("default-src 'none'"), "CSP default-src 'none'", h.get('content-security-policy'));
  check(h.get('x-frame-options') === 'DENY', 'X-Frame-Options DENY', h.get('x-frame-options'));
  check(h.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options nosniff');
  check(!h.has('x-powered-by'), 'sin X-Powered-By');
  const foreign = await get(`${API}/v1/brands`, { headers: { origin: 'https://evil.example.com' } });
  check(!foreign.headers.has('access-control-allow-origin'), 'CORS: otro origen no recibe Access-Control-Allow-Origin');
  check(!foreign.headers.has('access-control-allow-credentials'), 'CORS: sin credenciales');
  for (const path of ['/v1/me', '/v1/orders', '/v1/orders/00000000-0000-4000-8000-000000000000']) {
    const unauthorized = await get(`${API}${path}`, { headers: { authorization: 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } });
    check(unauthorized.status === 401 || unauthorized.status === 429, `${path} sin sesión válida: 401`, String(unauthorized.status));
  }
  const broken = await get(`${API}/v1/stylist/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"locale":' });
  const body = await broken.text();
  check((broken.status === 400 || broken.status === 429) && !/node_modules|at \w+ \(|SyntaxError/.test(body), 'JSON roto: 400 sin trazas', `${broken.status} ${body.slice(0, 80)}`);
  const unsigned = await get(`${API}/v1/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check(unsigned.status === 400 || unsigned.status === 503 || unsigned.status === 429, 'webhook de Stripe sin firma: rechazado', String(unsigned.status));
}

console.log(failures ? `\n${failures} chequeo(s) fallaron` : '\nTodo en orden');
process.exit(failures ? 1 : 0);
