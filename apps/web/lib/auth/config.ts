// Configuración del login con Google (Better Auth), leída del entorno del
// servidor. Sin las claves de Google el botón "Iniciar sesión" no aparece y
// el sitio funciona igual que antes; sin BETTER_AUTH_SECRET no hay sesiones.
// Ver "Login con Google" en docs/development.md.

const isProduction = process.env.NODE_ENV === 'production';

// Hay sesiones (la ruta /api/auth responde) si existe el secreto de las cookies.
export const AUTH_ENABLED = Boolean(process.env.BETTER_AUTH_SECRET);

// Se puede iniciar sesión con Google: secreto y ambas claves de Google.
export const GOOGLE_LOGIN_ENABLED = AUTH_ENABLED && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// Dirección pública de la web: base de las URLs de retorno de Google
// (<base>/api/auth/callback/google). BETTER_AUTH_URL gana; si falta se usa
// SITE_URL, y en desarrollo localhost:3000. En producción sin ninguna,
// Better Auth la deduce de cada petición.
export const AUTH_BASE_URL = process.env.BETTER_AUTH_URL ?? process.env.SITE_URL ?? (isProduction ? undefined : 'http://localhost:3000');

// Base de Postgres: la misma de la API (las tablas user, session, account y
// verification las crea su migración). En desarrollo, la de docker-compose.
export const AUTH_DATABASE_URL = process.env.DATABASE_URL ?? (isProduction ? undefined : 'postgresql://airspace:airspace@127.0.0.1:5434/airspace');
