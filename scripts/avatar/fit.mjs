// Ajusta prendas del catálogo al maniquí del Hangar 360° (paso 4, fase 3).
//
// Uso:
//   pnpm avatar:fit                          todas las prendas de fit.json
//   pnpm avatar:fit --only anorak-gris       solo esa prenda (repetible)
//   pnpm avatar:fit --preview <carpeta>      además, vistas previas en Blender
//
// Requisitos: pnpm avatar:build ya corrido (usa el FBX del Y Bot en
// assets/avatar/raw y la pose del avatar en assets/avatar/out/avatar.glb) y
// los modelos del catálogo optimizados (apps/web/public/models/<slug>.glb).
//
// Pipeline:
//   1. Blender (fit.py) coloca cada prenda sobre el cuerpo con el ajuste de
//      scripts/avatar/fit.json, la lleva a la T-pose, la acerca al cuerpo sin
//      atravesarlo, ordena las capas y le copia los pesos del esqueleto. La
//      gorra y los lentes cuelgan del hueso de la cabeza.
//   2. Aquí: misma pose y escala que el avatar (nodo AvatarRoot), nombres de
//      huesos normalizados, simplificación, texturas WebP, Meshopt,
//      validación y presupuesto, en apps/web/public/avatar-fit/.
//   3. apps/web/lib/avatar/catalog-fit.json: archivos, lugar en el avatar,
//      piezas del vestuario base que reemplaza y reglas para ocultar el
//      cuerpo bajo cada prenda.
//
// Los GLB ajustados solo contienen la malla de la prenda (modelo CC BY del
// catálogo, con su crédito) y los huesos del esqueleto con sus nombres y
// matrices de enlace: ninguna malla de Mixamo. Por eso se versionan.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { cloneDocument, compressTexture, dedup, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import validator from 'gltf-validator';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { countTriangles, createIO, formatThousands } from '../models/shared.mjs';
import { AVATAR_HEIGHT_METERS, AVATAR_PATHS, BONE_PREFIX, CHARACTER_FILE, OUTFIT, ROOT_DIR } from './config.mjs';

const execFileAsync = promisify(execFile);

const { values: cli } = parseArgs({
  options: {
    only: { type: 'string', multiple: true },
    preview: { type: 'string' },
  },
  allowPositionals: false,
});

const FIT_CONFIG = path.join(ROOT_DIR, 'scripts/avatar/fit.json');
const FIT_SCRIPT = path.join(ROOT_DIR, 'scripts/avatar/fit.py');
const MODELS_DIR = path.join(ROOT_DIR, 'apps/web/public/models');
const OUT_DIR = path.join(ROOT_DIR, 'apps/web/public/avatar-fit');
const PUBLIC_URL = '/avatar-fit';
const RULES_FILE = path.join(ROOT_DIR, 'apps/web/lib/avatar/catalog-fit.json');
const WORK_DIR = path.join(AVATAR_PATHS.outDir, 'fit');

// Variantes. Hero: texturas de 1024 px y hasta 12k triángulos; lite (modo
// liviano y móviles de gama baja): 512 px y menos de la mitad. Los
// presupuestos son por prenda (plan del paso 4: unos 300 KB el hero).
const VARIANTS = {
  hero: { suffix: '', maxTriangles: 12_000, maxTextureSize: 1024, quality: 80, budget: { bytes: 320_000, triangles: 15_000 } },
  lite: { suffix: '-lite', maxTriangles: 5_000, maxTextureSize: 512, quality: 72, budget: { bytes: 160_000, triangles: 7_000 } },
};

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const exists = (file) =>
  access(file).then(
    () => true,
    () => false,
  );

// "mixamorig1:LeftArm" -> "LeftArm" (igual que build.mjs).
function boneBaseName(name) {
  const match = /^mixamorig\d*[:_]?(.+)$/.exec(name);
  return match ? match[1] : name;
}

async function findBlender() {
  const candidates = [process.env.BLENDER_PATH, 'blender', '/Applications/Blender.app/Contents/MacOS/Blender'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(candidate, ['--version'], { timeout: 60_000 });
      return { path: candidate, version: stdout.split('\n')[0].trim() };
    } catch {
      // Se prueba el siguiente.
    }
  }
  return null;
}

// ---------- Configuración ----------

const fitConfig = JSON.parse(await readFile(FIT_CONFIG, 'utf8'));
const slugs = Object.keys(fitConfig.items);
const unknown = (cli.only ?? []).filter((slug) => !slugs.includes(slug));
if (unknown.length) fail(`Prenda desconocida: ${unknown.join(', ')}. Revisa scripts/avatar/fit.json.`);
const selected = cli.only?.length ? slugs.filter((slug) => cli.only.includes(slug)) : slugs;

// Nombre del nodo de cada prenda en su GLB (la web lo busca por nombre).
const nodeName = (slug) => `Fit_${slug.replace(/-/g, '_')}`;

// Las de arriba van por fuera de los pantalones ajustados: si se ajusta una
// de arriba, los de abajo entran a Blender como capa (sin exportarse).
const needsBottoms = selected.some((slug) => fitConfig.items[slug].slot === 'top');
const layerOnly = needsBottoms ? slugs.filter((slug) => fitConfig.items[slug].slot === 'bottom' && !selected.includes(slug)) : [];

const items = [];
for (const slug of [...selected, ...layerOnly]) {
  const item = fitConfig.items[slug];
  const slot = fitConfig.slots[item.slot];
  if (!slot) fail(`${slug}: lugar desconocido ${item.slot}.`);
  // Las prendas propias (pnpm garments) se ajustan desde su malla en reposo
  // (T-pose del maniquí, sin pose que deshacer); las demás, desde el modelo
  // optimizado del catálogo.
  const source = item.source ? path.join(ROOT_DIR, item.source) : path.join(MODELS_DIR, `${slug}.glb`);
  if (!(await exists(source))) {
    fail(`${slug}: falta ${path.relative(ROOT_DIR, source)}. Ejecuta ${item.source ? 'pnpm garments' : 'pnpm models:optimize'}.`);
  }
  items.push({
    slug,
    slot: item.slot,
    kind: item.kind,
    node: nodeName(slug),
    source,
    fit: item.fit,
    bones: slot.bones ?? [],
    rules: slot.rules ? { bones: slot.bones, ...slot.rules } : null,
    layerOnly: layerOnly.includes(slug),
  });
}

const character = path.join(AVATAR_PATHS.rawDir, CHARACTER_FILE);
const avatarGlb = path.join(AVATAR_PATHS.outDir, 'avatar.glb');
for (const file of [character, avatarGlb]) {
  if (!(await exists(file))) fail(`Falta ${path.relative(ROOT_DIR, file)}. Ejecuta primero pnpm avatar:build.`);
}

// ---------- 1. Blender ----------

const blender = await findBlender();
if (!blender) fail('No se encontró Blender (BLENDER_PATH, PATH o /Applications/Blender.app).');
console.log(`Blender: ${blender.version}`);
await mkdir(WORK_DIR, { recursive: true });
const blenderConfig = path.join(WORK_DIR, 'fit-config.json');
await writeFile(blenderConfig, `${JSON.stringify({ heightMeters: AVATAR_HEIGHT_METERS, outfit: OUTFIT, items }, null, 2)}\n`);
const args = ['--background', '--factory-startup', '--python-exit-code', '1', '--python', FIT_SCRIPT, '--'];
args.push('--character', character, '--config', blenderConfig, '--out-dir', WORK_DIR);
if (cli.preview) args.push('--preview', path.resolve(cli.preview));
try {
  const { stdout } = await execFileAsync(blender.path, args, { maxBuffer: 256 * 1024 * 1024, timeout: 1_800_000 });
  for (const line of stdout.split('\n')) if (line.startsWith('[fit]') || line.startsWith('[outfit]')) console.log(`  ${line.replace(/^\[\w+\] /, '')}`);
} catch (error) {
  const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim().split('\n').slice(-30).join('\n');
  fail(`Blender no pudo ajustar las prendas.\n\n${output}`);
}
const report = JSON.parse(await readFile(path.join(WORK_DIR, 'fit-report.json'), 'utf8'));

// ---------- 2. Variantes ----------

const io = await createIO();
await MeshoptSimplifier.ready;

// Pose y escala del avatar: el mismo nodo AvatarRoot que avatar.glb.
const avatarDocument = await io.read(avatarGlb);
const avatarRoot = avatarDocument
  .getRoot()
  .listNodes()
  .find((node) => node.getName() === 'AvatarRoot');
if (!avatarRoot) fail('avatar.glb no tiene el nodo AvatarRoot. Ejecuta pnpm avatar:build.');
const pivot = { translation: avatarRoot.getTranslation(), rotation: avatarRoot.getRotation(), scale: avatarRoot.getScale() };

function prepare(document) {
  for (const node of document.getRoot().listNodes()) {
    const base = boneBaseName(node.getName());
    if (base !== node.getName()) node.setName(`${BONE_PREFIX}${base}`);
  }
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  const root = document.createNode('AvatarRoot');
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    root.addChild(child);
  }
  scene.addChild(root);
  root.setTranslation(pivot.translation).setRotation(pivot.rotation).setScale(pivot.scale);
  // La tela se ve por dentro en mangas y ruedos.
  for (const material of document.getRoot().listMaterials()) material.setDoubleSided(true);
}

async function compressTextures(document, variant) {
  const textures = document.getRoot().listTextures();
  if (!textures.length) return;
  // Mapas de datos (normales, oclusión, rugosidad y metal) a la mitad: en el
  // cuerpo entero del Hangar casi no se notan y pesan como el color.
  const data = new Set();
  for (const material of document.getRoot().listMaterials()) {
    for (const texture of [material.getNormalTexture(), material.getOcclusionTexture(), material.getMetallicRoughnessTexture()]) {
      if (texture) data.add(texture);
    }
  }
  await Promise.all(
    textures.map((texture) => {
      const size = data.has(texture) ? variant.maxTextureSize / 2 : variant.maxTextureSize;
      return compressTexture(texture, {
        encoder: sharp,
        targetFormat: 'webp',
        resize: [size, size],
        quality: variant.quality,
        effort: 100,
      });
    }),
  );
  document.createExtension(EXTTextureWebP).setRequired(true);
}

async function validate(glb) {
  const result = await validator.validateBytes(new Uint8Array(glb), { maxIssues: 50, writeTimestamp: false });
  return {
    errors: result.issues.numErrors,
    warnings: result.issues.numWarnings,
    errorMessages: result.issues.messages.filter((message) => message.severity === 0).map((message) => `${message.code}: ${message.message}`),
  };
}

async function buildVariant(source, slug, kind, variantName) {
  const variant = VARIANTS[variantName];
  const document = cloneDocument(source);
  await document.transform(weld());
  const initial = countTriangles(document);
  if (initial > variant.maxTriangles) {
    // lockBorder: ruedos y puños quedan limpios.
    await document.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: variant.maxTriangles / initial, error: 0.02, lockBorder: kind === 'skinned' }),
    );
  }
  await compressTextures(document, variant);
  await document.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const glb = await io.writeBinary(document);
  const file = `${slug}${variant.suffix}.glb`;
  await writeFile(path.join(OUT_DIR, file), glb);
  const triangles = countTriangles(document);
  const validation = await validate(glb);
  return {
    url: `${PUBLIC_URL}/${file}`,
    bytes: glb.byteLength,
    sha256: createHash('sha256').update(glb).digest('hex').slice(0, 16),
    triangles,
    withinBudget: glb.byteLength <= variant.budget.bytes && triangles <= variant.budget.triangles,
    validation,
  };
}

await mkdir(OUT_DIR, { recursive: true });
let previous = { items: {} };
try {
  previous = JSON.parse(await readFile(RULES_FILE, 'utf8'));
} catch {
  // Primera vez.
}

let problems = 0;
const entries = { ...previous.items };
console.log('\nVariantes');
for (const item of items.filter((entry) => !entry.layerOnly)) {
  const source = await io.read(path.join(WORK_DIR, `${item.slug}.glb`));
  prepare(source);
  const files = {};
  for (const variantName of Object.keys(VARIANTS)) {
    const output = await buildVariant(source, item.slug, item.kind, variantName);
    const ok = output.withinBudget && output.validation.errors === 0;
    if (!ok) problems++;
    console.log(
      `  ${item.slug.padEnd(28)} ${variantName.padEnd(4)} ${formatThousands(output.triangles).padStart(6)} tris, ` +
        `${(output.bytes / 1000).toFixed(0).padStart(4)} KB (máx. ${VARIANTS[variantName].budget.bytes / 1000} KB), ` +
        `validador ${output.validation.errors} errores / ${output.validation.warnings} avisos  [${ok ? 'OK' : 'REVISAR'}]`,
    );
    for (const message of output.validation.errorMessages) console.log(`       ${message}`);
    files[variantName] = { url: output.url, bytes: output.bytes, triangles: output.triangles, sha256: output.sha256 };
  }
  entries[item.slug] = {
    slot: item.slot,
    kind: item.kind,
    node: report[item.slug].node,
    hides: fitConfig.slots[item.slot].hides,
    rules: report[item.slug].rules,
    files,
  };
}

// ---------- 3. Reglas para la web ----------

const ordered = Object.fromEntries(Object.keys(fitConfig.items).filter((slug) => entries[slug]).map((slug) => [slug, entries[slug]]));
const rules = {
  // Generado por pnpm avatar:fit desde scripts/avatar/fit.json.
  version: 1,
  items: ordered,
};
await writeFile(RULES_FILE, `${JSON.stringify(rules, null, 2)}\n`);
console.log(`\nReglas: ${path.relative(ROOT_DIR, RULES_FILE)}`);
console.log(problems ? `${problems} variante(s) para revisar.` : 'Todo dentro del presupuesto.');
process.exit(problems ? 1 : 0);
