import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { Pool } from 'pg';
import { AUTH_BASE_URL, AUTH_DATABASE_URL, AUTH_ENABLED } from './config';

// Primer nombre y primer apellido. Si Google no trae los campos separados, se
// usa el nombre completo tal cual.
export function shortName(given?: string, family?: string, full?: string): string {
  const first = given?.trim().split(/\s+/)[0];
  const last = family?.trim().split(/\s+/)[0];
  if (first && last) return `${first} ${last}`;
  return first ?? full?.trim() ?? '';
}

// Better Auth en el servidor de la web (docs/plan-paso-5.md, fase 1): login
// con Google y sesiones guardadas en Postgres (tablas de la migración
// auth_tables de la API). Usa su adaptador de Postgres con un Pool de pg:
// la web no tiene el cliente de Prisma, y el esquema sigue en
// apps/api/prisma/schema.prisma, así pnpm db:migrate crea las tablas igual
// en local y en Neon. Al primer uso Better Auth comprueba que las tablas y
// columnas coincidan con las que espera.
//
// Cookies: httpOnly, SameSite=Lax y, con una base https (producción),
// Secure y con el prefijo __Secure-.

function createAuth() {
  const baseURL = AUTH_BASE_URL;
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Siempre muestra el selector de cuentas (útil con varias cuentas).
            prompt: 'select_account' as const,
            // Solo primer nombre y primer apellido ("Gerardo Amaya" en vez del
            // nombre completo de Google). Google los entrega por separado.
            mapProfileToUser: (profile: { given_name?: string; family_name?: string; name?: string }) => ({
              name: shortName(profile.given_name, profile.family_name, profile.name),
            }),
            // En cada inicio de sesión se actualizan nombre y foto desde Google.
            overrideUserInfoOnSignIn: true,
          },
        }
      : {};
  return betterAuth({
    appName: 'AIRSPACE Wear',
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL,
    // Pocas conexiones por instancia: en Vercel cada función abre su Pool y
    // Neon ya agrupa conexiones del lado del servidor.
    database: new Pool({ connectionString: AUTH_DATABASE_URL, max: 3, idleTimeoutMillis: 10_000 }),
    socialProviders: google,
    // En desarrollo también se puede abrir el sitio en 127.0.0.1.
    trustedOrigins: process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    // Un error del flujo de Google (por ejemplo, acceso cancelado) vuelve a la
    // página de cuenta, que lo explica en el idioma del visitante (?error=...).
    onAPIError: { errorURL: '/account' },
    advanced: {
      useSecureCookies: baseURL ? baseURL.startsWith('https://') : process.env.NODE_ENV === 'production',
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
    },
    // nextCookies va al final: deja que las acciones de servidor fijen cookies.
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

// Una sola instancia (y un solo Pool) por proceso, también con la recarga
// en caliente de next dev, que vuelve a evaluar los módulos.
const globalAuth = globalThis as typeof globalThis & { airspaceAuth?: Auth };

// null si no hay BETTER_AUTH_SECRET: el sitio sigue funcionando sin cuentas.
export function getAuth(): Auth | null {
  if (!AUTH_ENABLED) return null;
  globalAuth.airspaceAuth ??= createAuth();
  return globalAuth.airspaceAuth;
}
