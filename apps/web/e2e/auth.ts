import { createHmac, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from '@playwright/test';
import { Pool } from 'pg';

// Sesiones de prueba sin Google: se crea el usuario y la fila de sesión
// directo en la base que usa el servidor de la web y se pone en el navegador
// la cookie que Better Auth habría puesto (el token firmado con
// BETTER_AUTH_SECRET: "<token>.<HMAC-SHA256 en base64>", codificado como URL).
// Las variables vienen del .env de la raíz, igual que en next.config.ts.

const rootEnv = path.resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export const AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? '';
// Lo mismo que lib/auth/config.ts: sin secreto no hay sesiones; sin las dos
// claves de Google no hay botón de entrar. E2E_GOOGLE_LOGIN=0 fuerza el caso
// sin Google (servidor arrancado sin las claves).
export const AUTH_ENABLED = Boolean(AUTH_SECRET);
export const GOOGLE_LOGIN_ENABLED = process.env.E2E_GOOGLE_LOGIN === '0' ? false : AUTH_ENABLED && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://airspace:airspace@127.0.0.1:5434/airspace';
const SESSION_COOKIE = 'better-auth.session_token';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  token: string;
}

let pool: Pool | null = null;
const db = () => (pool ??= new Pool({ connectionString: DATABASE_URL, max: 2 }));

// Crea un usuario con una sesión válida por una hora. Los ids empiezan con
// "e2e-" para poder borrarlos sin tocar cuentas reales.
export async function createTestSession(overrides: Partial<Pick<TestUser, 'name' | 'image'>> = {}): Promise<TestUser> {
  const suffix = randomBytes(6).toString('hex');
  const user: TestUser = {
    id: `e2e-user-${suffix}`,
    name: overrides.name ?? 'Ada Prueba',
    email: `ada.${suffix}@example.com`,
    image: overrides.image ?? null,
    token: randomBytes(24).toString('base64url').replace(/[-_]/g, 'x').slice(0, 32),
  };
  await db().query('INSERT INTO "user" (id, name, email, "emailVerified", image) VALUES ($1, $2, $3, true, $4)', [user.id, user.name, user.email, user.image]);
  await db().query('INSERT INTO "session" (id, token, "expiresAt", "userId") VALUES ($1, $2, now() + interval \'1 hour\', $3)', [`e2e-session-${suffix}`, user.token, user.id]);
  return user;
}

export async function deleteTestUser(user: TestUser): Promise<void> {
  // Borra también sus sesiones (ON DELETE CASCADE).
  await db().query('DELETE FROM "user" WHERE id = $1', [user.id]);
}

export async function sessionCount(user: TestUser): Promise<number> {
  const result = await db().query<{ count: string }>('SELECT count(*) FROM "session" WHERE "userId" = $1', [user.id]);
  return Number(result.rows[0]?.count ?? 0);
}

export function signedSessionCookie(token: string): string {
  const signature = createHmac('sha256', AUTH_SECRET).update(token).digest('base64');
  return encodeURIComponent(`${token}.${signature}`);
}

export async function signIn(context: BrowserContext, baseURL: string, user: TestUser): Promise<void> {
  const url = new URL(baseURL);
  await context.addCookies([{ name: SESSION_COOKIE, value: signedSessionCookie(user.token), domain: url.hostname, path: '/', httpOnly: true, sameSite: 'Lax', secure: false }]);
}
