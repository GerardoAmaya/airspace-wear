import { defineConfig, devices } from '@playwright/test';

// Pruebas de punta a punta (Playwright) del sitio. Corren contra el Chrome
// del sistema (channel 'chrome'), así no hace falta descargar navegadores.
// Si ya hay servidores de desarrollo levantados (web en :3000 y API en
// :4000) se reutilizan; si no, se arranca `pnpm dev` desde la raíz.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  // El servidor de desarrollo compila cada ruta la primera vez: margen amplio.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // Pocos trabajadores: un solo `next dev` atiende todas las pruebas, y la API
  // limita a 120 pedidos por minuto por IP (Next le pide todo desde una sola).
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: './e2e/.report' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    baseURL: BASE_URL,
    // Tamaño de la ventana de referencia del usuario (CLAUDE.md, "Motion").
    viewport: { width: 1720, height: 816 },
    locale: 'es-ES',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    cwd: '../..',
    url: `${BASE_URL}/es`,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
