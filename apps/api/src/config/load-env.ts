import { existsSync } from 'node:fs';
import path from 'node:path';

// Carga el .env de la raíz del monorepo al arrancar (nunca se imprime). Sube
// desde este archivo hasta encontrar pnpm-workspace.yaml, así funciona igual
// desde src/ (tests) que desde dist/ (build). En producción las variables
// llegan del entorno y no hace falta archivo.
export function loadWorkspaceEnv(startDir: string = import.meta.dirname): void {
  let dir = startDir;
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      const envFile = path.join(dir, '.env');
      if (existsSync(envFile)) process.loadEnvFile(envFile);
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
