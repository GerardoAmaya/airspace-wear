import {
  type CheckoutItem,
  type CreateCheckoutResponse,
  createCheckoutResponseSchema,
  type Locale,
  type OrderDetail,
  orderDetailSchema,
  type OrderList,
  orderListSchema,
} from '@airspace/contracts';
import { connection } from 'next/server';
import { sessionAuthorization } from '@/lib/auth/api-session';

// Solo para el servidor (lee la sesión con next/headers).
// Pedidos del usuario: el servidor de la web llama a la API con el token de
// la sesión (Authorization: Bearer, ver lib/auth/api-session.ts) y la clave
// interna. Nunca en caché: son datos personales y cambian (pago, seguimiento).
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const INTERNAL_HEADERS: Record<string, string> = process.env.INTERNAL_API_KEY ? { 'x-internal-key': process.env.INTERNAL_API_KEY } : {};

// Resultado sin excepciones: la página decide qué mostrar en cada caso.
// unauthorized: sin sesión (o vencida); not_found: no existe o es de otro.
export type OrdersResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: 'unauthorized' | 'not_found' | 'invalid_request' | 'rate_limited' | 'service_unavailable' | 'unavailable'; issues?: { path: string; message: string }[] };

async function call<T>(path: string, schema: { parse(value: unknown): T }, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<OrdersResult<T>> {
  // Siempre en la petición (nunca al prerenderizar): Better Auth genera
  // valores al azar al crearse, y eso no puede pasar en el prerender.
  await connection();
  const authorization = await sessionAuthorization().catch(() => null);
  if (!authorization) return { ok: false, error: 'unauthorized' };
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: { ...INTERNAL_HEADERS, ...authorization, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      // Crear la sesión de Stripe puede tardar un poco más que una lectura.
      signal: AbortSignal.timeout(init.method === 'POST' ? 15_000 : 8000),
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    try {
      return { ok: true, data: schema.parse(body) };
    } catch {
      return { ok: false, error: 'unavailable' };
    }
  }
  const code = typeof body === 'object' && body && 'code' in body ? String(body.code) : '';
  const issues = typeof body === 'object' && body && 'issues' in body && Array.isArray(body.issues) ? (body.issues as { path: string; message: string }[]) : undefined;
  switch (code) {
    case 'unauthorized':
    case 'not_found':
    case 'invalid_request':
    case 'rate_limited':
    case 'service_unavailable':
      return { ok: false, error: code, issues };
    default:
      return { ok: false, error: 'unavailable' };
  }
}

export const fetchOrders = (): Promise<OrdersResult<OrderList>> => call('/v1/orders', orderListSchema);

export const fetchOrder = (id: string, locale: Locale): Promise<OrdersResult<OrderDetail>> =>
  call(`/v1/orders/${encodeURIComponent(id)}?locale=${locale}`, orderDetailSchema);

export const createCheckout = (locale: Locale, items: CheckoutItem[]): Promise<OrdersResult<CreateCheckoutResponse>> =>
  call('/v1/checkout', createCheckoutResponseSchema, { method: 'POST', body: { locale, items } });
