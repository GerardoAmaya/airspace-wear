import type { StylistEvent } from '@airspace/contracts';
import type { NextRequest } from 'next/server';
import { sessionAuthorization } from '@/lib/auth/api-session';

// Puente del estilista: el navegador pregunta aquí (mismo origen) y este
// servidor reenvía a la API (POST /v1/stylist/chat) con la sesión del
// visitante, si la tiene, para que el estilista pueda responder sobre sus
// pedidos. La cookie de sesión es de la web y nunca llega al dominio de la
// API: viaja el token en Authorization (lib/auth/api-session.ts), igual que
// en "Mis pedidos". La respuesta (SSE) vuelve sin tocar, trozo a trozo.
//
// Con la clave interna la API no limita por la IP de este servidor (que es
// la misma para todos): limita por la del visitante, que va en x-client-ip.

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const INTERNAL_HEADERS: Record<string, string> = process.env.INTERNAL_API_KEY ? { 'x-internal-key': process.env.INTERNAL_API_KEY } : {};
// La API valida el cuerpo; aquí solo se corta lo que no puede ser un chat
// (20 mensajes de hasta 4.000 caracteres caben con margen).
const MAX_BODY_BYTES = 128 * 1024;

const SSE_HEADERS = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Accel-Buffering': 'no' };

// Sin la API (caída o sin red) se responde como si la IA no estuviera
// disponible: el panel sigue con el guion.
function unavailable(): Response {
  const event: StylistEvent = { type: 'error', code: 'unavailable' };
  return new Response(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`, { status: 200, headers: SSE_HEADERS });
}

// IP del visitante: la primera de x-forwarded-for (la pone Vercel o el proxy
// de desarrollo). Sin ella, la API cuenta a todos juntos ("web").
function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return Response.json({ code: 'invalid_request' }, { status: 413 });
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return Response.json({ code: 'invalid_request' }, { status: 413 });

  const ip = clientIp(request);
  // Si no se puede leer la sesión (base caída), se pregunta sin ella.
  const authorization = await sessionAuthorization().catch(() => null);
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/v1/stylist/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        ...INTERNAL_HEADERS,
        ...(ip ? { 'x-client-ip': ip } : {}),
        ...(authorization ?? {}),
      },
      body,
      // Si el visitante cancela (otra pregunta, cerrar), se corta también la API.
      signal: request.signal,
      cache: 'no-store',
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return unavailable();
  }

  // Errores con JSON (429, 400): mismo estado y cuerpo, el panel los traduce.
  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text(), { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' } });
  }
  return new Response(upstream.body, { status: 200, headers: SSE_HEADERS });
}
