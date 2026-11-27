import { type NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth/server';

// Rutas de Better Auth (/api/auth/*): inicio de sesión con Google, retorno
// de Google (/api/auth/callback/google), sesión actual y cierre de sesión.
// El proxy (proxy.ts) no pasa por /api/. Sin BETTER_AUTH_SECRET no hay
// cuentas: la sesión responde null (como sin sesión) y lo demás 404.

// Ningún cuerpo de estas rutas pasa de unos cientos de bytes.
const MAX_BODY_BYTES = 16 * 1024;

async function handle(request: NextRequest): Promise<Response> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ code: 'invalid_request' }, { status: 413 });
  }
  const auth = getAuth();
  if (auth) {
    const response = await auth.handler(request);
    // El límite de Better Auth responde 429 con X-Retry-After: se agrega la
    // cabecera estándar Retry-After.
    if (response.status === 429 && !response.headers.has('retry-after')) {
      const wait = response.headers.get('x-retry-after');
      if (wait) {
        const headers = new Headers(response.headers);
        headers.set('Retry-After', wait);
        return new Response(response.body, { status: 429, headers });
      }
    }
    return response;
  }
  if (request.method === 'GET' && request.nextUrl.pathname === '/api/auth/get-session') {
    return NextResponse.json(null, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ code: 'not_found' }, { status: 404 });
}

export { handle as GET, handle as POST };
