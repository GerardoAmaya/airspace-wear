import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { seed } from '../../prisma/seed/index.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { resolveTestDatabaseUrl } from './test-database.js';

const API_DIR = path.resolve(import.meta.dirname, '../..');

// Prepara airspace_test una vez antes de todas las pruebas e2e:
// 1. aplica las migraciones pendientes (prisma migrate deploy);
// 2. vacía todas las tablas del catálogo (TRUNCATE ... RESTART IDENTITY);
// 3. carga el seed.
// Así cada corrida parte del mismo estado, aunque una corrida anterior se
// haya cortado a mitad de una prueba que modifica datos.
export default async function setup(): Promise<void> {
  const databaseUrl = resolveTestDatabaseUrl();
  // Los workers reciben la misma URL por test.env (vitest.config.e2e.ts);
  // aquí se fija también para este proceso.
  process.env.DATABASE_URL = databaseUrl;

  // El entorno del hijo se pasa explícito, con la URL de pruebas forzada.
  // prisma.config.ts carga el .env de la raíz, pero process.loadEnvFile no
  // pisa variables que ya existen, así que esta URL gana.
  try {
    execFileSync(
      path.join(API_DIR, 'node_modules/.bin/prisma'),
      ['migrate', 'deploy'],
      {
        cwd: API_DIR,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'pipe',
      },
    );
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(
      `prisma migrate deploy falló en la base de pruebas.\n${stderr}`,
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length > 0) {
      const list = tables
        .map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`)
        .join(', ');
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
      );
    }
    await seed(prisma, () => {});
  } finally {
    await prisma.$disconnect();
  }
}
