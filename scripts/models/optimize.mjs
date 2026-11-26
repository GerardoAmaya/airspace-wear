// Optimiza los modelos originales para la web. Por cada modelo genera dos
// variantes (hero y lite, ver VARIANTS en config.mjs) en apps/web/public/models.
//
// Uso:
//   pnpm models:optimize                       todos los modelos
//   pnpm models:optimize --only adidas-samba   solo uno (repetible)
//
// Pipeline:
//   1. Limpieza: dedup, prune, flatten + join (une primitivas que comparten
//      material para reducir llamadas de dibujo) y weld.
//   2. Pose canónica: punta a +X, suela en y = 0, largo real (geometry.mjs).
//   3. Solo en lite: elimina piezas sueltas diminutas (costuras).
//      Luego simplifica con meshoptimizer si supera la meta de triángulos,
//      sin pasar el error máximo de la variante o del modelo.
//   4. Texturas a WebP con tamaño máximo; las de datos con más calidad.
//   5. Compresión Meshopt (EXT_meshopt_compression con cuantización).
//   6. Validación con glTF Validator y control de presupuesto.

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import {
  cloneDocument,
  compressTexture,
  dedup,
  flatten,
  join,
  listTextureSlots,
  meshopt,
  metalRough,
  prune,
  simplify,
  simplifyPrimitive,
  weld,
} from '@gltf-transform/functions';
import validator from 'gltf-validator';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import {
  DATA_TEXTURE_QUALITY,
  DATA_TEXTURE_SLOTS,
  PATHS,
  PUBLIC_MODELS_URL,
  CATEGORIES,
  TEXTURE_QUALITY_STEPS,
  VARIANTS,
} from './config.mjs';
import { patchTextures } from './textures.mjs';
import {
  bakeSkins,
  filterParts,
  keepTrianglesOnSide,
  normalizePose,
  removeSmallParts,
  simplifyPrimitivePermissive,
  simplifyPrimitiveWithAttributes,
} from './geometry.mjs';
import {
  countTriangles,
  createIO,
  describeDocument,
  formatMegabytes,
  formatThousands,
  markdownTable,
  rawModelPath,
  readCliOptions,
  readManifest,
  selectModels,
  writeManifest,
} from './shared.mjs';

// Intentos máximos de simplificación: algunas mallas pequeñas no se reducen en
// la proporción pedida y hace falta pedir un poco menos para llegar a la meta.
const MAX_SIMPLIFY_ATTEMPTS = 4;

const options = readCliOptions();
const models = selectModels(options.only);
const io = await createIO();
await MeshoptSimplifier.ready;

// Lee el original y deja la geometría limpia y en pose canónica.
async function prepareGeometry(model) {
  const document = await io.read(rawModelPath(model.slug));
  // Prendas con esqueleto (exportadas sobre un cuerpo): se fijan en su pose.
  bakeSkins(document);
  if (model.parts) filterParts(document, model.parts);
  if (model.extract) keepTrianglesOnSide(document, model.extract);
  if (model.texturePatches) await patchTextures(document, model.texturePatches);
  // metalRough convierte los materiales especular/brillo
  // (KHR_materials_pbrSpecularGlossiness) a metal/rugosidad: three.js y
  // model-viewer ya no leen esa extensión y el zapato se vería blanco, sin
  // texturas. En los modelos que no la usan no hace nada.
  await document.transform(metalRough());
  await document.transform(dedup(), prune(), flatten(), join(), weld(), prune());
  const category = CATEGORIES[model.category ?? 'sneaker'];
  const pose = normalizePose(document, {
    rotation: model.transform?.rotation,
    lengthMeters: model.size?.meters ?? category.sizeMeters,
    sizeAxis: model.size?.axis ?? category.sizeAxis ?? 'x',
    autoYaw: category.autoYaw,
    garment: category.garment ?? false,
  });
  return { document, pose };
}

// Triángulos de las primitivas cuyo material está en la lista.
function trianglesWithMaterials(document, materialNames) {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (!materialNames.includes(primitive.getMaterial()?.getName())) continue;
      triangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return triangles;
}

// Simplifica todo menos las primitivas con materiales protegidos. La
// simplificación solo mira posiciones: en algunos modelos deforma las UV y
// el mapa de relieve muestra reflejos falsos, así que esos materiales se
// dejan intactos (son pocos triángulos) y la reducción se reparte en el resto.
async function simplifyDocument(document, { ratio, error, keepMaterials, withAttributes, permissive }) {
  if (!keepMaterials.length && !withAttributes && !permissive) {
    await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error }), prune());
    return;
  }
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (keepMaterials.includes(primitive.getMaterial()?.getName())) continue;
      if (permissive) simplifyPrimitivePermissive(document, primitive, { ratio, error });
      else if (withAttributes) simplifyPrimitiveWithAttributes(document, primitive, { ratio, error });
      else simplifyPrimitive(primitive, { simplifier: MeshoptSimplifier, ratio, error });
    }
  }
  await document.transform(prune());
}

// Reduce triángulos hasta la meta sin pasar el error máximo permitido.
// Cada intento parte de la geometría de entrada: simplificar un resultado ya
// simplificado acumularía error por encima del límite.
async function simplifyToTarget(
  source,
  { targetTriangles, maxSimplifyError, keepMaterials = [], withAttributes = false, permissive = false },
) {
  const initialTriangles = countTriangles(source);
  if (initialTriangles <= targetTriangles) return { document: source, applied: false, reachedTarget: true };
  // La meta se reparte solo entre los triángulos que sí se pueden simplificar.
  const keptTriangles = trianglesWithMaterials(source, keepMaterials);
  const simplifiable = initialTriangles - keptTriangles;
  let ratio = Math.max(0.01, (targetTriangles - keptTriangles) / simplifiable);
  let best;
  for (let attempt = 0; attempt < MAX_SIMPLIFY_ATTEMPTS; attempt++) {
    const candidate = cloneDocument(source);
    await simplifyDocument(candidate, { ratio, error: maxSimplifyError, keepMaterials, withAttributes, permissive });
    const triangles = countTriangles(candidate);
    best = { document: candidate, triangles };
    if (triangles <= targetTriangles) break;
    // Si quedó muy lejos de lo pedido, el límite es el error y no la
    // proporción: pedir menos triángulos no cambiaría el resultado.
    if (triangles / initialTriangles > ratio * 1.5) break;
    ratio *= targetTriangles / triangles;
  }
  return { document: best.document, applied: true, reachedTarget: best.triangles <= targetTriangles };
}

// Nombres de los materiales que usan una textura. Las texturas de una
// extensión (por ejemplo la especular) cuelgan de la propiedad de la
// extensión, y esta a su vez del material.
function textureMaterialNames(texture) {
  const names = new Set();
  for (const parent of texture.listParents()) {
    const owners = parent.propertyType === 'Material' ? [parent] : parent.listParents();
    for (const owner of owners) if (owner.propertyType === 'Material') names.add(owner.getName());
  }
  return [...names];
}

// Lado máximo de una textura: el de la variante, reducido por los ajustes del
// modelo según el slot (por ejemplo specularTexture) o el material que la usa.
function textureSizeFor(texture, slots, settings) {
  const limits = [settings.maxTextureSize];
  for (const slot of slots) limits.push(settings.textureSizeBySlot?.[slot] ?? Infinity);
  for (const name of textureMaterialNames(texture)) limits.push(settings.textureSizeByMaterial?.[name] ?? Infinity);
  return Math.min(...limits);
}

// Convierte cada textura a WebP una sola vez, con su tamaño y su calidad: las
// de datos usan dataTextureQuality y las de color la calidad del intento.
async function compressTextures(document, settings, quality) {
  const textures = document.getRoot().listTextures();
  await Promise.all(
    textures.map((texture) => {
      const slots = listTextureSlots(texture);
      const isData = slots.some((slot) => DATA_TEXTURE_SLOTS.test(slot));
      const size = textureSizeFor(texture, slots, settings);
      return compressTexture(texture, {
        encoder: sharp,
        targetFormat: 'webp',
        resize: [size, size],
        effort: 100,
        quality: isData ? settings.dataTextureQuality : quality,
      });
    }),
  );
  if (textures.some((texture) => texture.getMimeType() === 'image/webp')) {
    document.createExtension(EXTTextureWebP).setRequired(true);
  }
}

async function validate(glb) {
  const report = await validator.validateBytes(new Uint8Array(glb), { maxIssues: 50, writeTimestamp: false });
  const errors = report.issues.messages.filter((message) => message.severity === 0);
  return {
    errors: report.issues.numErrors,
    warnings: report.issues.numWarnings,
    errorMessages: errors.map((message) => `${message.code}: ${message.message}`),
  };
}

// Genera una variante probando calidades de textura hasta caber en el presupuesto.
async function buildVariant(model, geometry, variantName) {
  // Ajustes de la variante con los propios del modelo (variantOverrides).
  const variant = {
    dataTextureQuality: DATA_TEXTURE_QUALITY,
    ...VARIANTS[variantName],
    ...model.variantOverrides?.[variantName],
  };
  // Presupuesto de la variante, con el ajuste propio del modelo si lo tiene.
  const budget = { ...variant.budget, ...model.budgetOverrides?.[variantName] };
  const cleaned = cloneDocument(geometry);
  if (variant.dropTransmission) {
    const transmission = cleaned
      .getRoot()
      .listExtensionsUsed()
      .find((extension) => extension.extensionName === 'KHR_materials_transmission');
    transmission?.dispose();
  }
  if (variant.pruneSmallParts) {
    removeSmallParts(cleaned, variant.pruneSmallParts);
    await cleaned.transform(prune());
  }
  const simplification = await simplifyToTarget(cleaned, {
    targetTriangles: variant.targetTriangles,
    maxSimplifyError: Math.min(variant.maxSimplifyError, model.maxSimplifyError ?? Infinity),
    keepMaterials: model.keepMaterials ?? [],
    withAttributes: model.simplifyWithAttributes ?? false,
    permissive: model.simplifyAcrossSeams?.includes(variantName) ?? false,
  });

  let result;
  for (const quality of TEXTURE_QUALITY_STEPS) {
    const candidate = cloneDocument(simplification.document);
    await compressTextures(candidate, variant, quality);
    await candidate.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
    const glb = await io.writeBinary(candidate);
    result = { document: candidate, glb, quality };
    if (glb.byteLength <= budget.bytes) break;
  }

  const fileName = `${model.slug}${variant.suffix}.glb`;
  await writeFile(path.join(PATHS.outputDir, fileName), result.glb);
  const description = describeDocument(result.document);
  const validation = await validate(result.glb);
  const withinBudget =
    description.triangles <= budget.triangles && result.glb.byteLength <= budget.bytes;

  return {
    file: `${PUBLIC_MODELS_URL}/${fileName}`,
    bytes: result.glb.byteLength,
    ...description,
    textureQuality: result.quality,
    simplified: simplification.applied,
    withinBudget,
    validation,
  };
}

await mkdir(PATHS.outputDir, { recursive: true });
const manifest = await readManifest();
const reportRows = [];
let problems = 0;

for (const model of models) {
  const started = performance.now();
  console.log(`\n${model.displayName} (${model.slug})`);
  const rawPath = rawModelPath(model.slug);
  const rawBytes = (await stat(rawPath).catch(() => null))?.size;
  if (!rawBytes) {
    console.error('  Falta el original. Ejecuta primero pnpm models:download.');
    problems++;
    continue;
  }

  const rawDescription = describeDocument(await io.read(rawPath));
  const { document: geometry, pose } = await prepareGeometry(model);
  const size = pose.dimensionsCm;
  console.log(
    `  Pose: giro ${pose.rotation.join('/')}°, ajuste fino ${pose.yawCorrection}°, ` +
      (size.length === undefined
        ? `${size.width} x ${size.height} x ${size.depth} cm (ancho x alto x fondo)`
        : `${size.length} x ${size.width} x ${size.height} cm`),
  );

  const variants = {};
  for (const variantName of Object.keys(VARIANTS)) {
    const output = await buildVariant(model, geometry, variantName);
    variants[variantName] = output;
    const status = output.withinBudget && output.validation.errors === 0 ? 'OK' : 'REVISAR';
    if (status !== 'OK') problems++;
    console.log(
      `  ${variantName.padEnd(4)} ${formatThousands(output.triangles).padStart(7)} tris, ` +
        `${formatMegabytes(output.bytes)}, ${output.drawCalls} draw calls, ` +
        `texturas ${output.maxTextureSize}px q${output.textureQuality}, ` +
        `validador ${output.validation.errors} errores / ${output.validation.warnings} avisos  [${status}]`,
    );
    for (const message of output.validation.errorMessages) console.log(`       ${message}`);
    reportRows.push([
      model.displayName,
      variantName,
      `${formatThousands(rawDescription.triangles)} → ${formatThousands(output.triangles)}`,
      `${formatMegabytes(rawBytes)} → ${formatMegabytes(output.bytes)}`,
      `${rawDescription.drawCalls} → ${output.drawCalls}`,
      `${output.maxTextureSize}px WebP`,
      status,
    ]);
  }

  const previous = manifest.models[model.slug] ?? {};
  manifest.models[model.slug] = {
    ...previous,
    slug: model.slug,
    displayName: model.displayName,
    brand: model.brand,
    // Los modelos de Sketchfab guardan sus créditos al descargarse; los locales
    // los declaran en config.mjs (source.provider = 'local').
    ...(model.source.provider === 'local' && { source: model.source }),
    raw: { ...previous.raw, bytes: rawBytes, ...rawDescription },
    pose: {
      category: model.category ?? 'sneaker',
      foot: model.foot,
      // Con la punta a +X, el lado exterior de un zapato derecho mira a +Z.
      lateralSideFacing: model.foot ? (model.foot === 'right' ? '+z' : '-z') : undefined,
      extractedFromPair: Boolean(model.extract),
      // Las prendas miran de frente a +Z (la cámara por defecto).
      frontFacing: model.category === 'apparel' ? '+z' : undefined,
      ...pose,
    },
    variants,
  };
  console.log(`  Listo en ${((performance.now() - started) / 1000).toFixed(1)} s`);
}

await writeManifest(manifest);

console.log('\nResumen\n');
console.log(
  markdownTable(['Model', 'Variant', 'Triangles', 'Size', 'Draw calls', 'Textures', 'Status'], reportRows),
);
console.log(problems ? `\n${problems} variante(s) para revisar.` : '\nTodas las variantes dentro del presupuesto.');
process.exit(problems ? 1 : 0);
