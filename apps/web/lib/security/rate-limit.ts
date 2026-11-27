import { clientIp } from './client-ip';

// Límite de peticiones de las rutas del servidor de la web (route handlers y
// acciones de servidor). Ventana fija por IP y por regla, en memoria.
//
// En Vercel cada instancia de la función lleva su propia cuenta (no hay un
// almacén compartido gratis): el límite frena a un cliente que insiste desde
// una IP, no a un ataque distribuido. Para eso están el límite de la API (que
// cuenta por usuario y por IP del visitante), el presupuesto diario del
// estilista y las reglas del Firewall de Vercel (docs/security.md).
//
// Solo en producción: en desarrollo todas las pruebas salen de 127.0.0.1 y
// se frenarían entre sí. WEB_RATE_LIMIT=off lo apaga (por ejemplo, para
// correr las pruebas de punta a punta contra un build de producción).

export interface RateRule {
  limit: number;
  windowMs: number;
}

export const RATE_RULES = {
  // El puente del estilista: la API ya limita a 10 por minuto por visitante;
  // aquí se corta antes de leer la sesión y abrir la conexión con la API.
  stylistChat: { limit: 20, windowMs: 60_000 },
  // ¿Tiene pedidos? Una consulta a la base por llamada (sesión y pedidos).
  ordersHint: { limit: 30, windowMs: 60_000 },
  // Datos del panel del estilista (catálogo en caché).
  stylistContext: { limit: 60, windowMs: 60_000 },
  // Botón "Pagar" (acción de servidor): la API también limita por usuario.
  checkout: { limit: 20, windowMs: 60_000 },
  // Refrescar la caché: lo llama el seed una vez por corrida.
  revalidate: { limit: 5, windowMs: 60_000 },
} satisfies Record<string, RateRule>;

export type RateRuleName = keyof typeof RATE_RULES;

const windows = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 10_000;

export const rateLimitEnabled = () => process.env.NODE_ENV === 'production' && process.env.WEB_RATE_LIMIT !== 'off';

// Cuenta una petición. Devuelve los segundos de espera si pasó el tope, o
// null si puede seguir.
export function consume(name: RateRuleName, headers: Headers, now = Date.now()): number | null {
  if (!rateLimitEnabled()) return null;
  const rule = RATE_RULES[name];
  const key = `${name}|${clientIp(headers) ?? 'shared'}`;
  if (windows.size > MAX_KEYS) for (const [stored, window] of windows) if (window.resetAt <= now) windows.delete(stored);
  let window = windows.get(key);
  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + rule.windowMs };
    windows.set(key, window);
  }
  window.count += 1;
  if (window.count <= rule.limit) return null;
  // Un aviso por ventana, sin la IP (dato personal).
  if (window.count === rule.limit + 1) console.warn(`[rate-limit] ${name}: límite superado`);
  return Math.max(1, Math.ceil((window.resetAt - now) / 1000));
}

// Para route handlers: 429 { code: 'rate_limited' } con Retry-After, o null.
export function limitResponse(name: RateRuleName, request: Request): Response | null {
  const retryAfter = consume(name, request.headers);
  if (retryAfter === null) return null;
  return Response.json({ code: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } });
}
