import { defineConfig } from 'vitest/config';
import { resolveTestDatabaseUrl } from './test/support/test-database.js';

// Pruebas e2e: la app completa contra la base airspace_test (nunca airspace).
// El globalSetup migra, vacía y siembra la base antes de correr.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    // Los workers ven la URL de pruebas aunque el entorno traiga otra.
    env: { DATABASE_URL: resolveTestDatabaseUrl() },
    // Algunos archivos modifican datos (despublicar, volver a sembrar): se
    // corren uno tras otro para que no se pisen.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
