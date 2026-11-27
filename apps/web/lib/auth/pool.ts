import { Pool } from 'pg';
import { AUTH_DATABASE_URL } from './config';

// El Pool de Postgres de las cuentas, uno por proceso (también con la recarga
// en caliente de next dev, que vuelve a evaluar los módulos). Lo usa Better
// Auth (lib/auth/server.ts) y también /api/warm, que despierta la base antes
// de que haga falta (Neon gratis se suspende sin uso).
// Pocas conexiones por instancia: en Vercel cada función abre su Pool y Neon
// ya agrupa conexiones del lado del servidor.
const globalPool = globalThis as typeof globalThis & { airspaceAuthPool?: Pool };

export function getAuthPool(): Pool {
  if (!globalPool.airspaceAuthPool) {
    const pool = new Pool({ connectionString: AUTH_DATABASE_URL, max: 3, idleTimeoutMillis: 10_000 });
    // Una conexión libre que el servidor cierra (Neon al suspenderse) emite
    // "error" en el Pool: sin quien lo escuche, tumbaría el proceso.
    pool.on('error', () => undefined);
    globalPool.airspaceAuthPool = pool;
  }
  return globalPool.airspaceAuthPool;
}
