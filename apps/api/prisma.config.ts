import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// El CLI de Prisma 7 no carga .env solo: se carga el de la raíz del monorepo
// (sin imprimirlo). Sin DATABASE_URL se usa la base local de docker-compose.
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const LOCAL_DATABASE_URL = 'postgresql://airspace:airspace@127.0.0.1:5434/airspace';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed/index.ts' },
  datasource: { url: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL },
});
