'use client';

// "Despertar al mostrar intención": cuando la persona se acerca a algo que
// necesita la base (pasa el cursor, enfoca o toca "Iniciar sesión", el
// avatar de la cuenta, "Mis pedidos" o "Pagar"), se manda en segundo plano
// un pedido mínimo a /api/warm (app/api/warm/route.ts) que despierta Neon,
// que en el plan gratis se suspende sin uso. Así el clic no espera el
// arranque en frío. Nunca al cargar la página: solo con intención.
//
// Como mucho una vez cada 4 minutos (Neon se suspende a los ~5): se recuerda
// en sessionStorage para toda la pestaña y en memoria por si el
// almacenamiento falla.

const WARM_KEY = 'airspace-db-warm';
const WARM_EVERY_MS = 4 * 60_000;
let lastWarm = 0;

function readLast(): number {
  try {
    return Number(sessionStorage.getItem(WARM_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function warmDatabase() {
  const now = Date.now();
  if (now - Math.max(lastWarm, readLast()) < WARM_EVERY_MS) return;
  lastWarm = now;
  try {
    sessionStorage.setItem(WARM_KEY, String(now));
  } catch {
    // Sin almacenamiento vale el recuerdo en memoria (esta página).
  }
  fetch('/api/warm', { method: 'POST', cache: 'no-store', keepalive: true }).catch(() => undefined);
}

// Para repartir en el elemento: <button {...WARM_ON_INTENT}>.
export const WARM_ON_INTENT = {
  onPointerEnter: warmDatabase,
  onFocus: warmDatabase,
  onTouchStart: warmDatabase,
} as const;
