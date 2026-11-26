// Descarga los modelos originales desde la Download API de Sketchfab
// (GET /v3/models/{uid}/download) y guarda sus créditos en el manifest.
//
// Uso:
//   pnpm models:download                      todos los modelos
//   pnpm models:download --only adidas-samba  solo uno (repetible)
//   pnpm models:download --force              vuelve a descargar aunque exista
//
// El token se lee de SKETCHFAB_TOKEN en .env (node --env-file=.env).

import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { LICENSES, PATHS } from './config.mjs';
import {
  formatMegabytes,
  rawModelPath,
  readCliOptions,
  readManifest,
  selectModels,
  writeManifest,
} from './shared.mjs';

const API_BASE = 'https://api.sketchfab.com/v3';
const MAX_ATTEMPTS = 6;
// Pausa entre modelos: Sketchfab limita la tasa de pedidos (HTTP 429) cuando
// se descargan muchos seguidos.
const PAUSE_BETWEEN_MODELS_MS = 2000;

const token = process.env.SKETCHFAB_TOKEN;
if (!token) {
  console.error('Falta SKETCHFAB_TOKEN. Copia .env.example como .env y agrega tu token de Sketchfab.');
  process.exit(1);
}

const options = readCliOptions();
const models = selectModels(options.only).filter((model) => model.source.provider === 'sketchfab');

// GET con reintentos para errores temporales (429 y 5xx).
async function fetchWithRetry(url, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, init);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) return response;
    const waitMs = Number(response.headers.get('retry-after')) * 1000 || 1500 * 2 ** attempt;
    console.warn(`  HTTP ${response.status}, reintentando en ${Math.round(waitMs / 1000)} s...`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

async function fetchJson(url, { auth = false } = {}) {
  const headers = auth ? { Authorization: `Token ${token}` } : {};
  const response = await fetchWithRetry(url, { headers });
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Sketchfab rechazó el token (HTTP ${response.status}). Revisa SKETCHFAB_TOKEN.`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${new URL(url).pathname}`);
  return response.json();
}

// Traduce la licencia de la API a los datos que usan los créditos.
function normalizeLicense(apiLicense) {
  const known = LICENSES[apiLicense?.slug];
  if (known) return { slug: apiLicense.slug, ...known };
  return {
    slug: apiLicense?.slug ?? 'unknown',
    name: apiLicense?.label ?? 'Unknown license',
    url: apiLicense?.url ?? '',
    commercialUse: false,
    shareAlike: false,
  };
}

// Descarga a un archivo temporal y lo renombra solo si el tamaño coincide,
// así nunca queda un .glb a medias en assets/models/raw.
async function downloadFile(url, destination, expectedBytes) {
  const temporary = `${destination}.part`;
  const response = await fetchWithRetry(url);
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} al descargar el archivo`);
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    const { size } = await stat(temporary);
    if (expectedBytes && size !== expectedBytes) {
      throw new Error(`Descarga incompleta: ${size} de ${expectedBytes} bytes`);
    }
    await rename(temporary, destination);
    return size;
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function fileSize(filePath) {
  try {
    return (await stat(filePath)).size;
  } catch {
    return null;
  }
}

await mkdir(PATHS.rawDir, { recursive: true });
const manifest = await readManifest();
let failures = 0;

for (const model of models) {
  const { uid } = model.source;
  console.log(`\n${model.displayName} (${model.slug})`);
  try {
    // Los metadatos son públicos: autor, licencia y URL para los créditos.
    const info = await fetchJson(`${API_BASE}/models/${uid}`);
    if (!info.isDownloadable) throw new Error('El autor no permite descargar este modelo.');

    const destination = rawModelPath(model.slug);
    const existingBytes = await fileSize(destination);
    const previous = manifest.models[model.slug];
    let rawBytes = existingBytes;
    let downloadedAt = previous?.source?.downloadedAt ?? null;

    if (existingBytes && !options.force) {
      console.log(`  Ya existe (${formatMegabytes(existingBytes)}), se omite. Usa --force para reemplazarlo.`);
    } else {
      await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_MODELS_MS));
      // Los enlaces firmados caducan en minutos: se descargan de inmediato.
      const download = await fetchJson(`${API_BASE}/models/${uid}/download`, { auth: true });
      if (!download.glb?.url) throw new Error('La API no ofrece formato GLB para este modelo.');
      console.log(`  Descargando GLB (${formatMegabytes(download.glb.size)})...`);
      rawBytes = await downloadFile(download.glb.url, destination, download.glb.size);
      downloadedAt = new Date().toISOString().slice(0, 10);
      console.log(`  Guardado en assets/models/raw/${model.slug}.glb`);
    }

    manifest.models[model.slug] = {
      ...previous,
      slug: model.slug,
      displayName: model.displayName,
      brand: model.brand,
      source: {
        provider: 'sketchfab',
        uid,
        title: info.name,
        url: info.viewerUrl,
        author: info.user?.displayName ?? info.user?.username,
        authorUrl: info.user?.profileUrl,
        license: normalizeLicense(info.license),
        downloadedAt,
      },
      raw: { ...previous?.raw, bytes: rawBytes, sketchfabFaceCount: info.faceCount },
    };
  } catch (error) {
    failures++;
    console.error(`  Error: ${error.message}`);
  }
}

await writeManifest(manifest);
console.log(failures ? `\n${failures} modelo(s) con error.` : '\nDescarga completa.');
process.exit(failures ? 1 : 0);
