// Genera un póster WebP por modelo y por tema para las tarjetas del catálogo,
// el modo liviano y Open Graph: apps/web/public/posters/<slug>-<tema>.webp,
// más una miniatura de 600 px de ancho (<slug>-<tema>-600.webp).
//
// Dibuja cada modelo con el mismo escenario del prototipo (luces por tema,
// sombra de contacto, fondo transparente) en Chrome sin ventana.
//
// Uso:
//   pnpm models:posters                       todos los modelos del manifest
//   pnpm models:posters --only air-jordan-1   solo uno (repetible)

import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { PATHS, ROOT_DIR } from './config.mjs';

const { values: options } = parseArgs({ options: { only: { type: 'string' }, port: { type: 'string', default: '4181' } } });

const THEMES = ['dark', 'light'];
const OUTPUT_DIR = path.join(ROOT_DIR, 'apps/web/public/posters');
// Chrome del sistema (no se descarga uno aparte). CHROME_PATH lo cambia.
const CHROME_PATH = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WIDTH = 1200;
const HEIGHT = 800;
const QUALITY = 82;

const manifest = JSON.parse(await readFile(PATHS.manifest, 'utf8'));
const slugs = Object.keys(manifest.models).filter((slug) => !options.only || slug === options.only);
if (slugs.length === 0) throw new Error(`No hay modelos que coincidan con --only ${options.only}`);

// Levanta el servidor del prototipo en un puerto propio y espera a que responda.
const server = spawn(process.execPath, [path.join(ROOT_DIR, 'scripts/design/serve.mjs'), '--port', options.port], { stdio: 'ignore' });
const base = `http://127.0.0.1:${options.port}`;
for (let attempt = 0; ; attempt++) {
  try {
    if ((await fetch(`${base}/data/manifest.json`)).ok) break;
  } catch {
    if (attempt > 50) throw new Error('El servidor del prototipo no arrancó');
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}

await mkdir(OUTPUT_DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME_PATH, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', (error) => console.error(`  error en la página: ${error.message}`));
  for (const slug of slugs) {
    for (const theme of THEMES) {
      await page.goto(`${base}/dev/poster.html?slug=${slug}&theme=${theme}`);
      await page.waitForFunction(() => window.__posterReady === true, null, { timeout: 60_000 });
      const png = await page.locator('canvas').screenshot({ omitBackground: true });
      // Recorta el aire transparente y deja un margen parejo antes de exportar.
      const trimmed = await sharp(png).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
      const margin = Math.round(Math.max(trimmed.info.width, trimmed.info.height) * 0.04);
      const file = path.join(OUTPUT_DIR, `${slug}-${theme}.webp`);
      // sharp redimensiona antes de extender: se hace en dos pasos.
      const padded = await sharp(trimmed.data)
        .extend({ top: margin, bottom: margin, left: margin, right: margin, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      // Lienzo fijo de 1200 x 800 (3:2) con el modelo centrado: todos los
      // pósters miden lo mismo y la web puede reservar su espacio exacto.
      const info = await sharp(padded)
        .resize({ width: WIDTH, height: HEIGHT, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: QUALITY, alphaQuality: 90, effort: 6 })
        .toFile(file);
      // Variante de 600 x 400 para las miniaturas (tarjetas del catálogo,
      // banda de balones): la web la elige con srcset y sizes. Pesa un
      // cuarto y acelera el LCP del catálogo en móvil.
      const small = await sharp(padded)
        .resize({ width: WIDTH / 2, height: HEIGHT / 2, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: QUALITY, alphaQuality: 90, effort: 6 })
        .toFile(path.join(OUTPUT_DIR, `${slug}-${theme}-${WIDTH / 2}.webp`));
      console.log(`${slug} (${theme}): ${info.width}x${info.height}, ${(info.size / 1024).toFixed(0)} KB (miniatura ${(small.size / 1024).toFixed(0)} KB)`);
    }
  }
} finally {
  await browser.close();
  server.kill();
}
