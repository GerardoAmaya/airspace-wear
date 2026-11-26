// Sube el avatar optimizado (assets/avatar/out/avatar.glb y avatar-lite.glb)
// y el vestuario (outfit.glb y outfit-lite.glb) a Vercel Blob, y guarda las
// URLs públicas en assets/avatar/manifest.json. Al final imprime las variables
// NEXT_PUBLIC_* que hay que poner en Vercel (ver .env.example).
//
// Uso:
//   pnpm avatar:upload            (después de pnpm avatar:build)
//
// Requisitos:
//   - Un Blob store con acceso público en Vercel (Storage > Blob).
//   - BLOB_READ_WRITE_TOKEN en .env (se lee con node --env-file=.env).
//
// Cada archivo se sube como avatar/<nombre>-<hash>.glb: el hash del
// contenido hace que un avatar nuevo sea otra URL, así que la caché puede
// durar un año sin servir versiones viejas. Si el archivo ya tiene URL en el
// manifiesto con el mismo hash, no se vuelve a subir.

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { put } from '@vercel/blob';
import { AVATAR_PATHS, BLOB_CACHE_SECONDS, BLOB_PREFIX } from './config.mjs';

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// El token nunca se imprime: solo se comprueba que exista.
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  fail(
    'Falta BLOB_READ_WRITE_TOKEN en .env.\n' +
      'Créalo en Vercel: Storage > Blob > (tu store) > .env.local, y copia solo esa línea a .env.',
  );
}

let manifest;
try {
  manifest = JSON.parse(await readFile(AVATAR_PATHS.manifest, 'utf8'));
} catch {
  fail('No existe assets/avatar/manifest.json. Ejecuta primero pnpm avatar:build.');
}

// Avatar y vestuario, cada variante con la variable de la web que la usa.
const ENV_NAMES = {
  avatar: { hero: 'NEXT_PUBLIC_AVATAR_URL', lite: 'NEXT_PUBLIC_AVATAR_LITE_URL' },
  outfit: { hero: 'NEXT_PUBLIC_OUTFIT_URL', lite: 'NEXT_PUBLIC_OUTFIT_LITE_URL' },
};
const variants = [
  ...Object.entries(manifest.variants ?? {}).map(([name, variant]) => ['avatar', name, variant]),
  ...Object.entries(manifest.outfit?.variants ?? {}).map(([name, variant]) => ['outfit', name, variant]),
];
if (!variants.length) fail('El manifiesto no tiene variantes. Ejecuta primero pnpm avatar:build.');
if (!manifest.outfit) console.warn('  El manifiesto no tiene vestuario: se sube solo el avatar.');

let failures = 0;
for (const [group, name, variant] of variants) {
  const variantName = `${group} ${name}`;
  const filePath = path.join(AVATAR_PATHS.outDir, variant.file);
  let body;
  try {
    body = await readFile(filePath);
  } catch {
    console.error(`  ${variantName}: falta ${variant.file}. Ejecuta pnpm avatar:build.`);
    failures++;
    continue;
  }
  // El archivo debe ser el mismo que describe el manifiesto.
  const sha256 = createHash('sha256').update(body).digest('hex');
  if (sha256 !== variant.sha256) {
    console.error(`  ${variantName}: ${variant.file} no coincide con el manifiesto. Ejecuta pnpm avatar:build.`);
    failures++;
    continue;
  }
  if (variant.url) {
    console.log(`  ${variantName}: sin cambios, ya está en ${variant.url}`);
    continue;
  }

  const pathname = `${BLOB_PREFIX}/${path.basename(variant.file, '.glb')}-${sha256.slice(0, 12)}.glb`;
  try {
    const blob = await put(pathname, body, {
      access: 'public',
      token,
      contentType: 'model/gltf-binary',
      addRandomSuffix: false,
      // Mismo nombre implica mismo contenido (hash), así que sobrescribir es seguro.
      allowOverwrite: true,
      cacheControlMaxAge: BLOB_CACHE_SECONDS,
    });
    variant.url = blob.url;
    console.log(`  ${variantName}: subido (${(body.byteLength / 1_000_000).toFixed(2)} MB) a ${blob.url}`);
  } catch (error) {
    // El mensaje de @vercel/blob no incluye el token.
    console.error(`  ${variantName}: no se pudo subir. ${error instanceof Error ? error.message : error}`);
    failures++;
  }
}

await writeFile(AVATAR_PATHS.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
const envLines = variants
  .filter(([, , variant]) => variant.url)
  .map(([group, name, variant]) => `${ENV_NAMES[group]?.[name] ?? `${group}.${name}`}=${variant.url}`);
if (envLines.length) console.log(`\nVariables para Vercel (Settings > Environment Variables):\n  ${envLines.join('\n  ')}`);
console.log(failures ? `\n${failures} archivo(s) con error.` : '\nAvatar publicado. Las URLs están en assets/avatar/manifest.json.');
process.exit(failures ? 1 : 0);
