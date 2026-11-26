// Servidor local del prototipo de diseño (design/prototype).
//
// Uso:
//   pnpm design:preview              abre http://localhost:4174
//   pnpm design:preview --port 5000
//
// Sirve también los modelos optimizados (/models) y el decodificador Meshopt
// (/vendor/meshopt_decoder.mjs) para que el prototipo use los mismos archivos
// que usará el sitio real.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { PATHS, ROOT_DIR } from '../models/config.mjs';

const { values } = parseArgs({ options: { port: { type: 'string', default: '4174' } } });
const port = Number(values.port);

const PROTOTYPE_DIR = path.join(ROOT_DIR, 'design/prototype');
const VENDOR_FILES = {
  '/vendor/meshopt_decoder.mjs': path.join(ROOT_DIR, 'node_modules/meshoptimizer/meshopt_decoder.mjs'),
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
};

// Resuelve la ruta pedida dentro de una carpeta permitida, bloqueando "../".
function insideDir(dir, relativePath) {
  const filePath = path.resolve(dir, `.${relativePath}`);
  return filePath === dir || filePath.startsWith(dir + path.sep) ? filePath : null;
}

// Rutas con nombre propio: la página de créditos y el manifiesto de modelos
// (la página lee de ahí autores, licencias y cambios).
const NAMED_ROUTES = {
  '/credits': path.join(PROTOTYPE_DIR, 'credits.html'),
  '/data/manifest.json': PATHS.manifest,
};

function resolveFile(urlPath) {
  if (VENDOR_FILES[urlPath]) return VENDOR_FILES[urlPath];
  if (NAMED_ROUTES[urlPath]) return NAMED_ROUTES[urlPath];
  if (urlPath.startsWith('/models/')) return insideDir(PATHS.outputDir, urlPath.slice('/models'.length));
  // Pósters del sitio (pnpm models:posters), para la lámina de acentos.
  if (urlPath.startsWith('/posters/')) return insideDir(path.join(ROOT_DIR, 'apps/web/public/posters'), urlPath.slice('/posters'.length));
  const filePath = insideDir(PROTOTYPE_DIR, urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath);
  return filePath;
}

async function handleRequest(request, response) {
  const urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const filePath = resolveFile(urlPath);
  try {
    if (!filePath) throw new Error('not found');
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

// Escucha en IPv4 e IPv6 locales: algunos navegadores resuelven "localhost"
// como ::1 y otros como 127.0.0.1. Solo direcciones locales, nunca la red.
const HOSTS = ['127.0.0.1', '::1'];
let listening = 0;
for (const host of HOSTS) {
  const server = createServer(handleRequest);
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`El puerto ${port} ya está en uso en ${host}. ¿Hay otro servidor abierto? Usa --port para elegir otro.`);
      process.exitCode = 1;
    } else if (host !== '::1') {
      throw error;
    }
  });
  server.listen(port, host, () => {
    listening++;
    if (listening === 1) console.log(`Prototipo de diseño en http://localhost:${port} (Ctrl+C para salir)`);
  });
}
