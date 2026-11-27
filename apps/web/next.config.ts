import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Next solo lee los .env de apps/web. Las variables compartidas del monorepo
// (DATABASE_URL, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID...) viven en el .env de
// la raíz, igual que para la API: se carga aquí sin pisar las que ya existen
// (nunca se imprime). En Vercel y Docker llegan del entorno y no hay archivo.
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // Solo la imagen de Docker (apps/web/Dockerfile) construye con
  // BUILD_STANDALONE=1: genera .next/standalone con un server.js mínimo.
  // pnpm dev, next build y next start en local siguen igual que antes.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  // Valores por defecto de Next 16.4 (plantilla oficial).
  cacheComponents: true,
  partialPrefetching: true,
  // Modelos, pósters y prendas ajustadas al maniquí (avatar-fit): se guardan un día en el navegador y se revalidan en
  // segundo plano. Así el prefetch al pasar el cursor sirve de verdad y la
  // ficha no vuelve a pedir el GLB. (Si un modelo se reoptimiza con el mismo
  // nombre, el cambio llega a más tardar al día siguiente.)
  async headers() {
    const cache = { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' };
    return [
      { source: '/models/:file*', headers: [cache] },
      { source: '/posters/:file*', headers: [cache] },
      { source: '/avatar-fit/:file*', headers: [cache] },
      { source: '/vendor/:file*', headers: [cache] },
    ];
  },
};

// next-intl lee su configuración de i18n/request.ts.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
