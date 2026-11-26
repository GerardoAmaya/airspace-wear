// Utilidades compartidas por los scripts de modelos 3D.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import { MODELS, PATHS } from './config.mjs';

// Lee los argumentos comunes: --only <slug> (repetible) y --force.
export function readCliOptions(extraOptions = {}) {
  const { values } = parseArgs({
    options: {
      only: { type: 'string', multiple: true },
      force: { type: 'boolean', default: false },
      ...extraOptions,
    },
    allowPositionals: false,
  });
  return values;
}

// Devuelve los modelos a procesar según --only, validando los slugs.
export function selectModels(only) {
  if (!only?.length) return MODELS;
  const unknown = only.filter((slug) => !MODELS.some((model) => model.slug === slug));
  if (unknown.length) {
    throw new Error(`Slug desconocido: ${unknown.join(', ')}. Revisa scripts/models/config.mjs.`);
  }
  return MODELS.filter((model) => only.includes(model.slug));
}

export const rawModelPath = (slug) => path.join(PATHS.rawDir, `${slug}.glb`);

// Crea un NodeIO capaz de leer y escribir todas las extensiones que usamos,
// incluidas Meshopt y Draco (por si un modelo de origen viene comprimido).
export async function createIO() {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  return new NodeIO()
    // Solo errores: los avisos de cuantización (UV fuera de [0, 1]) son normales
    // en texturas que se repiten y el validador ya cubre la corrección del archivo.
    .setLogger(new Logger(Logger.Verbosity.ERROR))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
}

// Modos de primitiva de glTF.
const MODE_TRIANGLES = 4;
const MODE_TRIANGLE_STRIP = 5;
const MODE_TRIANGLE_FAN = 6;

// Cuenta los triángulos que realmente se dibujan: recorre la escena y suma
// cada malla tantas veces como nodos la usan.
export function countTriangles(document) {
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  let triangles = 0;
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const count = indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount();
      const mode = primitive.getMode();
      if (mode === MODE_TRIANGLES) triangles += count / 3;
      else if (mode === MODE_TRIANGLE_STRIP || mode === MODE_TRIANGLE_FAN) triangles += Math.max(0, count - 2);
    }
  });
  return Math.round(triangles);
}

// Llamadas de dibujo: una por primitiva por cada nodo que usa su malla.
export function countDrawCalls(document) {
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  let drawCalls = 0;
  scene.traverse((node) => {
    drawCalls += node.getMesh()?.listPrimitives().length ?? 0;
  });
  return drawCalls;
}

// Resume lo que importa de un documento para el reporte.
export function describeDocument(document) {
  const root = document.getRoot();
  const textures = root.listTextures().map((texture) => {
    const size = texture.getSize();
    return {
      name: texture.getName() || texture.getURI() || 'texture',
      mimeType: texture.getMimeType(),
      width: size?.[0] ?? 0,
      height: size?.[1] ?? 0,
    };
  });
  return {
    triangles: countTriangles(document),
    drawCalls: countDrawCalls(document),
    meshes: root.listMeshes().length,
    materials: root.listMaterials().length,
    textures: textures.length,
    maxTextureSize: Math.max(0, ...textures.map((t) => Math.max(t.width, t.height))),
    textureFormats: [...new Set(textures.map((t) => t.mimeType.replace('image/', '')))].sort(),
  };
}

// Manifest: fuente única de verdad de los metadatos de cada modelo
// (créditos, licencia y estadísticas). Lo leen el script de créditos y,
// más adelante, el frontend para la página /credits.
export async function readManifest() {
  try {
    return JSON.parse(await readFile(PATHS.manifest, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { models: {} };
    throw error;
  }
}

export async function writeManifest(manifest) {
  // Se ordena según config.mjs para que el diff en git sea estable.
  const ordered = {};
  for (const { slug } of MODELS) {
    if (manifest.models[slug]) ordered[slug] = manifest.models[slug];
  }
  await mkdir(path.dirname(PATHS.manifest), { recursive: true });
  await writeFile(PATHS.manifest, `${JSON.stringify({ models: ordered }, null, 2)}\n`);
}

export const formatMegabytes = (bytes) => `${(bytes / 1_000_000).toFixed(2)} MB`;
export const formatThousands = (value) => value.toLocaleString('en-US');

// Construye una tabla en Markdown a partir de encabezados y filas.
export function markdownTable(headers, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}
