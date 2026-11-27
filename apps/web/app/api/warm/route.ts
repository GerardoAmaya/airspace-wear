import { AUTH_ENABLED } from '@/lib/auth/config';
import { getAuthPool } from '@/lib/auth/pool';
import { limitResponse } from '@/lib/security/rate-limit';

// Despierta la base de datos antes de que haga falta. Neon gratis suspende
// la base tras unos 5 minutos sin uso y la primera consulta después tarda
// segundos: cuando la persona muestra intención de usar algo con sesión
// (pasa el cursor por "Iniciar sesión", el avatar, "Mis pedidos" o "Pagar",
// ver lib/auth/warm.ts), el navegador llama aquí y un SELECT 1 la despierta.
// La API usa la misma base, así que también le sirve a ella.
//
// POST: nunca se prerenderiza ni se guarda en caché. Sin datos ni cuerpo,
// siempre 204: si la base no responde a tiempo, el intento ya la despertó.
const WARM_TIMEOUT_MS = 3_000;

export async function POST(request: Request) {
  const limited = limitResponse('warm', request);
  if (limited) return limited;
  if (AUTH_ENABLED) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, WARM_TIMEOUT_MS);
    });
    await Promise.race([getAuthPool().query('SELECT 1').then(() => undefined), timeout]).catch(() => undefined);
    clearTimeout(timer);
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
