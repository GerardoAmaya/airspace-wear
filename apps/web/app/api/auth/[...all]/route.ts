import { type NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth/server';

// Rutas de Better Auth (/api/auth/*): inicio de sesión con Google, retorno
// de Google (/api/auth/callback/google), sesión actual y cierre de sesión.
// El proxy (proxy.ts) no pasa por /api/. Sin BETTER_AUTH_SECRET no hay
// cuentas: la sesión responde null (como sin sesión) y lo demás 404.
async function handle(request: NextRequest): Promise<Response> {
  const auth = getAuth();
  if (auth) return auth.handler(request);
  if (request.method === 'GET' && request.nextUrl.pathname === '/api/auth/get-session') {
    return NextResponse.json(null, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ code: 'not_found' }, { status: 404 });
}

export { handle as GET, handle as POST };
