import { headers } from 'next/headers';
import { getAuth } from './server';

// Para llamar a la API en nombre del usuario (pedidos, GET /v1/me): el
// servidor de la web lee su sesión y reenvía el token en Authorization. La
// API lo busca en la tabla session (apps/api/src/auth). La cookie nunca sale
// del dominio de la web. null si no hay sesión (o no hay cuentas).
export async function sessionAuthorization(): Promise<{ Authorization: string } | null> {
  const auth = getAuth();
  if (!auth) return null;
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? { Authorization: `Bearer ${session.session.token}` } : null;
}
