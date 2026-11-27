import type { OrderSummary, Price } from '@airspace/contracts';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { AUTH_ENABLED, GOOGLE_LOGIN_ENABLED } from '@/lib/auth/config';
import { getAuth } from '@/lib/auth/server';
import { fetchOrders } from '@/lib/orders/api';
import { AccountError, SignInCard, Unavailable } from './AccountPanel';
import { AccountDashboard, type AccountOrders } from './AccountDashboard';

// Cuántos pedidos muestra "Pedidos recientes".
const RECENT_COUNT = 3;

// Contenido de /[locale]/account (lee la sesión: va dentro de un Suspense).
// Con sesión: el panel completo, con los pedidos de GET /v1/orders (si la
// API no responde, el panel sigue y los pedidos muestran un aviso). Sin
// sesión: la tarjeta para entrar con Google. El aviso de error de Google
// (?error=<código>) se muestra en ambos casos.
export async function AccountContent() {
  await connection();
  const auth = getAuth();
  if (!AUTH_ENABLED || !auth) {
    return (
      <>
        <AccountError />
        <Unavailable />
      </>
    );
  }
  const requestHeaders = await headers();
  const [session, orders] = await Promise.all([auth.api.getSession({ headers: requestHeaders }).catch(() => null), fetchOrders()]);
  if (!session) {
    return (
      <>
        <AccountError />
        {GOOGLE_LOGIN_ENABLED ? <SignInCard /> : <Unavailable />}
      </>
    );
  }
  const { user } = session;
  return (
    <>
      <AccountError />
      <AccountDashboard
        user={{ name: user.name, email: user.email, image: user.image ?? null, createdAt: new Date(user.createdAt).toISOString() }}
        orders={orders.ok ? summarize(orders.data.items) : null}
      />
    </>
  );
}

// Resumen para el panel: pedidos pagados (los pendientes o vencidos no
// cuentan como compras), total gastado y los más recientes de cualquier estado.
function summarize(items: OrderSummary[]): AccountOrders {
  const paid = items.filter((order) => order.status === 'paid');
  const currency = paid[0]?.total.currency ?? items[0]?.total.currency ?? 'USD';
  const spent: Price = { amountCents: paid.filter((order) => order.total.currency === currency).reduce((sum, order) => sum + order.total.amountCents, 0), currency };
  return {
    paidCount: paid.length,
    spent,
    // La API los entrega del más reciente al más antiguo.
    lastPaidAt: paid[0]?.paidAt ?? paid[0]?.createdAt ?? null,
    recent: items.slice(0, RECENT_COUNT),
  };
}
