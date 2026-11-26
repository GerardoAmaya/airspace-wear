// Visor local de modelos 3D: compara original, hero y lite lado a lado.
//
// Uso:
//   pnpm models:preview              abre http://localhost:4173
//   pnpm models:preview --port 5000
//
// Modo de una sola vista (lo usan las capturas automáticas de control):
//   /?slug=adidas-samba&variant=hero&orbit=0deg%2075deg%20auto

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { PATHS, ROOT_DIR } from './config.mjs';

const { values } = parseArgs({ options: { port: { type: 'string', default: '4173' } } });
const port = Number(values.port);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.cjs': 'text/javascript; charset=utf-8',
};

// Decodificador Meshopt en formato UMD: cargado como script clásico define
// window.MeshoptDecoder, que es lo que model-viewer espera.
const MESHOPT_DECODER = path.join(ROOT_DIR, 'node_modules/meshoptimizer/meshopt_decoder.cjs');

// Rutas públicas del visor -> carpetas reales del repositorio.
const ROUTES = [
  { prefix: '/models/', dir: PATHS.outputDir },
  { prefix: '/raw/', dir: PATHS.rawDir },
];

// Resuelve una ruta pedida dentro de su carpeta, bloqueando "../".
function resolveFile(urlPath) {
  if (urlPath === '/' || urlPath === '/index.html') return path.join(import.meta.dirname, 'preview.html');
  if (urlPath === '/manifest.json') return PATHS.manifest;
  if (urlPath === '/vendor/meshopt_decoder.cjs') return MESHOPT_DECODER;
  for (const { prefix, dir } of ROUTES) {
    if (!urlPath.startsWith(prefix)) continue;
    const filePath = path.resolve(dir, `.${urlPath.slice(prefix.length - 1)}`);
    return filePath.startsWith(dir + path.sep) && filePath.endsWith('.glb') ? filePath : null;
  }
  return null;
}

async function handleRequest(request, response) {
  const urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const filePath = resolveFile(urlPath);
  try {
    if (!filePath) throw Object.assign(new Error('not found'), { code: 'ENOENT' });
    const { size } = await stat(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'Content-Length': size,
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
    if (listening === 1) console.log(`Visor de modelos en http://localhost:${port} (Ctrl+C para salir)`);
  });
}
