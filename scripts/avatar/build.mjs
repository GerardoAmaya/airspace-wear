// Construye el avatar del Hangar 360° a partir de las descargas de Mixamo.
//
// Uso:
//   pnpm avatar:build                  convierte los FBX con Blender y optimiza
//   pnpm avatar:build --skip-convert   reutiliza los GLB intermedios (por
//                                      ejemplo, exportados a mano o con otra
//                                      herramienta) y solo optimiza
//   --work-dir <dir> / --out-dir <dir> cambian las carpetas intermedia y de
//                                      salida (con --out-dir, el manifiesto se
//                                      escribe dentro de esa carpeta)
//
// Blender se busca en BLENDER_PATH (variable de entorno o .env), en el PATH y
// en /Applications/Blender.app.
//
// Pipeline:
//   1. Blender convierte cada FBX a GLB por separado (fbx_to_glb.py).
//   2. Las animaciones se copian al personaje por nombre de hueso y se
//      renombran (idle, walk, turn, pose).
//   3. Pose y escala: mirando a +Z, pies en y = 0, cadera centrada en X y Z,
//      1,75 m de alto. Se envuelve todo en un nodo raíz; la malla no se toca.
//   4. Si un clip trae avance (no se bajó "In Place"), se fija la cadera.
//   5. Recorte del pie: triángulos que dependen de los huesos del pie.
//   6. Por variante: simplificación si supera la meta, limpieza de
//      fotogramas, texturas a WebP, Meshopt, validación y presupuesto.
//   7. Manifiesto con alturas, huesos, clips y archivos.
//   8. Vestuario (outfit.py en Blender): prendas generadas a partir del
//      cuerpo, con el mismo esqueleto. Se les aplica la misma pose y escala
//      que al avatar y salen en outfit.glb y outfit-lite.glb, aparte del
//      avatar. Las reglas para ocultar el cuerpo bajo la ropa se escriben en
//      apps/web/lib/avatar/outfit-rules.json.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { MathUtils } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import {
  cloneDocument,
  compactPrimitive,
  compressTexture,
  dedup,
  meshopt,
  prune,
  resample,
  simplify,
  weld,
} from '@gltf-transform/functions';
import validator from 'gltf-validator';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { countTriangles, createIO, formatMegabytes, formatThousands } from '../models/shared.mjs';
import {
  AVATAR_HEIGHT_METERS,
  AVATAR_PATHS,
  AVATAR_VARIANTS,
  BONES,
  BONE_PREFIX,
  CHARACTER_FILE,
  CLIPS,
  FOOT_TRIM,
  MAX_ROOT_TRAVEL_METERS,
  OUTFIT,
  OUTFIT_VARIANTS,
} from './config.mjs';

/** @typedef {import('@gltf-transform/core').Document} Document */
/** @typedef {import('@gltf-transform/core').Node} GltfNode */

const execFileAsync = promisify(execFile);

const { values: cli } = parseArgs({
  options: {
    'skip-convert': { type: 'boolean', default: false },
    'work-dir': { type: 'string' },
    'out-dir': { type: 'string' },
  },
  allowPositionals: false,
});

const workDir = path.resolve(cli['work-dir'] ?? AVATAR_PATHS.workDir);
const outDir = path.resolve(cli['out-dir'] ?? AVATAR_PATHS.outDir);
const manifestPath = cli['out-dir'] ? path.join(outDir, 'manifest.json') : AVATAR_PATHS.manifest;
const characterGlb = path.join(workDir, 'character.glb');
const clipGlb = (name) => path.join(workDir, `${name}.glb`);
const outfitGlb = path.join(workDir, 'outfit.glb');
const outfitConfig = path.join(workDir, 'outfit-config.json');

// ---------- Utilidades ----------

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const exists = (file) =>
  access(file).then(
    () => true,
    () => false,
  );

const relative = (file) => path.relative(process.cwd(), file) || file;

// Nombre del hueso sin prefijo: "mixamorig:LeftFoot", "mixamorig1:LeftFoot"
// y "mixamorig_LeftFoot" dan "LeftFoot". Otros nombres quedan igual.
function boneBaseName(name) {
  const match = /^mixamorig\d*[:_]?(.+)$/.exec(name);
  return match ? match[1] : name;
}

// Nombre que three.js le da al nodo al cargar el GLB: GLTFLoader pasa los
// nombres por PropertyBinding.sanitizeNodeName, que cambia espacios por "_" y
// quita los caracteres reservados [ ] . : /. "mixamorig:LeftFoot" queda como
// "mixamorigLeftFoot".
const threeNodeName = (name) => name.replace(/\s/g, '_').replace(/[[\].:/]/g, '');

const roundTo = (value, digits = 4) => Number(value.toFixed(digits));

// Matrices 4x4 en orden de columnas (como glTF).
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiplyMatrices(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** @param {ArrayLike<number>} m @param {ArrayLike<number>} v */
function transformPoint(m, v) {
  const [x, y, z] = [v[0], v[1], v[2]];
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

// Inversa de una matriz 4x4 (cofactores).
function invertMatrix(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) throw new Error('Matriz sin inversa');
  const inv = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * inv,
    (a02 * b10 - a01 * b11 - a03 * b09) * inv,
    (a31 * b05 - a32 * b04 + a33 * b03) * inv,
    (a22 * b04 - a21 * b05 - a23 * b03) * inv,
    (a12 * b08 - a10 * b11 - a13 * b07) * inv,
    (a00 * b11 - a02 * b08 + a03 * b07) * inv,
    (a32 * b02 - a30 * b05 - a33 * b01) * inv,
    (a20 * b05 - a22 * b02 + a23 * b01) * inv,
    (a10 * b10 - a11 * b08 + a13 * b06) * inv,
    (a01 * b08 - a00 * b10 - a03 * b06) * inv,
    (a30 * b04 - a31 * b02 + a33 * b00) * inv,
    (a21 * b02 - a20 * b04 - a23 * b00) * inv,
    (a11 * b07 - a10 * b09 - a12 * b06) * inv,
    (a00 * b09 - a01 * b07 + a02 * b06) * inv,
    (a31 * b01 - a30 * b03 - a32 * b00) * inv,
    (a20 * b03 - a21 * b01 + a22 * b00) * inv,
  ];
}

const defaultScene = (document) => {
  const root = document.getRoot();
  return root.getDefaultScene() ?? root.listScenes()[0];
};

// Busca un nodo por el nombre base del hueso.
function findBone(document, baseName) {
  return document
    .getRoot()
    .listNodes()
    .find((node) => boneBaseName(node.getName()) === baseName);
}

// ---------- 1. Entradas y conversión ----------

async function checkInputs() {
  const expected = cli['skip-convert']
    ? [characterGlb, ...CLIPS.map((clip) => clipGlb(clip.name))]
    : [CHARACTER_FILE, ...CLIPS.map((clip) => clip.file)].map((file) => path.join(AVATAR_PATHS.rawDir, file));
  const missing = [];
  for (const file of expected) if (!(await exists(file))) missing.push(relative(file));
  if (!missing.length) return;

  if (cli['skip-convert']) {
    fail(
      `Faltan los GLB intermedios:\n  ${missing.join('\n  ')}\n\n` +
        'Ejecuta pnpm avatar:build sin --skip-convert para generarlos con Blender.',
    );
  }
  fail(
    `Faltan archivos de Mixamo en assets/avatar/raw/:\n  ${missing.join('\n  ')}\n\n` +
      'Descárgalos de https://www.mixamo.com (cuenta de Adobe, gratis):\n' +
      `  - ${CHARACTER_FILE}: personaje Y Bot, FBX Binary, "With Skin", en T-pose (sin animación).\n` +
      `  - ${CLIPS.map((clip) => clip.file).join(', ')}: con el Y Bot seleccionado, FBX Binary,\n` +
      '    "Without Skin", 30 fps, con "In Place" marcado cuando exista.\n' +
      'Renómbralos exactamente así y vuelve a ejecutar pnpm avatar:build.',
  );
}

// Devuelve la ruta de un Blender que responde a --version, o null.
async function findBlender() {
  const candidates = [
    process.env.BLENDER_PATH,
    'blender',
    '/Applications/Blender.app/Contents/MacOS/Blender',
    path.join(os.homedir(), 'Applications/Blender.app/Contents/MacOS/Blender'),
  ].filter(Boolean);
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

async function convertWithBlender() {
  const blender = await findBlender();
  if (!blender) {
    fail(
      'No se encontró Blender (hace falta la versión 4.2 o posterior).\n\n' +
        'Instálalo con uno de estos caminos:\n' +
        '  - brew install --cask blender\n' +
        '  - o descárgalo de https://www.blender.org/download/ y arrástralo a Aplicaciones.\n' +
        'Si está en otra carpeta, define BLENDER_PATH en .env con la ruta del ejecutable\n' +
        '(por ejemplo /Applications/Blender.app/Contents/MacOS/Blender).',
    );
  }
  console.log(`Blender: ${blender.version}`);
  await mkdir(workDir, { recursive: true });
  const jobs = [
    '--skin',
    path.join(AVATAR_PATHS.rawDir, CHARACTER_FILE),
    characterGlb,
    ...CLIPS.flatMap((clip) => ['--anim', path.join(AVATAR_PATHS.rawDir, clip.file), clipGlb(clip.name)]),
  ];
  const args = [
    '--background',
    '--factory-startup',
    '--python-exit-code',
    '1',
    '--python',
    AVATAR_PATHS.blenderScript,
    '--',
    ...jobs,
  ];
  try {
    const { stdout } = await execFileAsync(blender.path, args, { maxBuffer: 64 * 1024 * 1024, timeout: 600_000 });
    for (const line of stdout.split('\n')) if (line.startsWith('[fbx_to_glb]')) console.log(`  ${line.slice(13)}`);
  } catch (error) {
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n');
    fail(`Blender no pudo convertir los FBX.\n\n${output}`);
  }

  // Vestuario: Blender genera las prendas a partir del cuerpo (outfit.py).
  await writeFile(outfitConfig, `${JSON.stringify({ outfit: OUTFIT, heightMeters: AVATAR_HEIGHT_METERS }, null, 2)}\n`);
  const outfitArgs = [
    '--background',
    '--factory-startup',
    '--python-exit-code',
    '1',
    '--python',
    AVATAR_PATHS.outfitScript,
    '--',
    '--character',
    path.join(AVATAR_PATHS.rawDir, CHARACTER_FILE),
    '--config',
    outfitConfig,
    '--out',
    outfitGlb,
  ];
  try {
    const { stdout } = await execFileAsync(blender.path, outfitArgs, { maxBuffer: 64 * 1024 * 1024, timeout: 600_000 });
    for (const line of stdout.split('\n')) if (line.startsWith('[outfit]')) console.log(`  ${line.slice(9)}`);
  } catch (error) {
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n');
    fail(`Blender no pudo generar el vestuario.\n\n${output}`);
  }
}

// ---------- 2. Animaciones ----------

// Copia la animación de un GLB de clip al personaje, canal por canal, buscando
// cada hueso por su nombre base. Devuelve la duración y los canales copiados.
function copyClip(character, clipDocument, clipName) {
  const animations = clipDocument.getRoot().listAnimations();
  if (!animations.length) throw new Error(`${clipName}: el archivo no trae animación.`);
  // Si Blender exportó más de una acción, se usa la que anima más canales.
  const source = animations.reduce((best, animation) =>
    animation.listChannels().length > best.listChannels().length ? animation : best,
  );

  const bones = new Map(character.getRoot().listNodes().map((node) => [boneBaseName(node.getName()), node]));
  const buffer = character.getRoot().listBuffers()[0] ?? character.createBuffer();
  const target = character.createAnimation(clipName);
  const copiedAccessors = new Map();
  const copyAccessor = (accessor) => {
    if (!copiedAccessors.has(accessor)) {
      copiedAccessors.set(
        accessor,
        character
          .createAccessor()
          .setType(accessor.getType())
          .setArray(accessor.getArray().slice())
          .setNormalized(accessor.getNormalized())
          .setBuffer(buffer),
      );
    }
    return copiedAccessors.get(accessor);
  };

  const unmatched = new Set();
  let duration = 0;
  for (const channel of source.listChannels()) {
    const sourceNode = channel.getTargetNode();
    const sampler = channel.getSampler();
    if (!sourceNode || !sampler) continue;
    const node = bones.get(boneBaseName(sourceNode.getName()));
    if (!node) {
      unmatched.add(sourceNode.getName());
      continue;
    }
    const input = sampler.getInput();
    duration = Math.max(duration, input.getMax([0])[0]);
    const newSampler = character
      .createAnimationSampler()
      .setInput(copyAccessor(input))
      .setOutput(copyAccessor(sampler.getOutput()))
      .setInterpolation(sampler.getInterpolation());
    target.addSampler(newSampler);
    target.addChannel(
      character.createAnimationChannel().setTargetNode(node).setTargetPath(channel.getTargetPath()).setSampler(newSampler),
    );
  }
  if (!target.listChannels().length) {
    throw new Error(`${clipName}: ningún hueso coincide con el personaje. ¿Se descargó con el Y Bot seleccionado?`);
  }
  if (unmatched.size) console.warn(`  ${clipName}: ${unmatched.size} canal(es) sin hueso en el personaje, omitidos.`);
  return { animation: target, duration, channels: target.listChannels().length };
}

// Normaliza los nombres de los huesos a "mixamorig:<Hueso>" para que el sitio
// no dependa del prefijo que Mixamo asignó a la cuenta.
function normalizeBoneNames(document) {
  for (const node of document.getRoot().listNodes()) {
    const base = boneBaseName(node.getName());
    if (base !== node.getName()) node.setName(`${BONE_PREFIX}${base}`);
  }
}

// ---------- 3. Pose y escala ----------

// Posiciones de todos los vértices en mundo, con el skinning de la pose de
// reposo (T-pose): suma de peso * (matriz del hueso * matriz inversa de
// enlace) * posición. Las mallas sin esqueleto usan la matriz de su nodo.
function forEachRestVertex(document, callback) {
  defaultScene(document).traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const skin = node.getSkin();
    const jointMatrices = skin
      ? skin.listJoints().map((joint, index) => {
          const inverseBind = skin.getInverseBindMatrices()?.getElement(index, new Array(16)) ?? IDENTITY;
          return multiplyMatrices(joint.getWorldMatrix(), /** @type {number[]} */ (inverseBind));
        })
      : null;
    const nodeMatrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      const joints = primitive.getAttribute('JOINTS_0');
      const weights = primitive.getAttribute('WEIGHTS_0');
      const vertex = [0, 0, 0];
      const jointIndex = [0, 0, 0, 0];
      const weight = [0, 0, 0, 0];
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, vertex);
        if (!jointMatrices || !joints || !weights) {
          callback(transformPoint(nodeMatrix, vertex));
          continue;
        }
        joints.getElement(i, jointIndex);
        weights.getElement(i, weight);
        const world = [0, 0, 0];
        for (let k = 0; k < 4; k++) {
          if (!weight[k]) continue;
          const point = transformPoint(jointMatrices[jointIndex[k]], vertex);
          for (let axis = 0; axis < 3; axis++) world[axis] += weight[k] * point[axis];
        }
        callback(world);
      }
    }
  });
}

function measureRestBounds(document) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  forEachRestVertex(document, (point) => {
    for (let axis = 0; axis < 3; axis++) {
      if (point[axis] < min[axis]) min[axis] = point[axis];
      if (point[axis] > max[axis]) max[axis] = point[axis];
    }
  });
  return { min, max };
}

const worldPosition = (node) => {
  const matrix = node.getWorldMatrix();
  return [matrix[12], matrix[13], matrix[14]];
};

function requireBone(document, baseName) {
  const node = findBone(document, baseName);
  if (!node) throw new Error(`El personaje no tiene el hueso ${BONE_PREFIX}${baseName}. ¿Es un personaje de Mixamo?`);
  return node;
}

// Envuelve la escena en AvatarRoot y lo transforma: mirando a +Z (giro en Y
// en múltiplos de 90°, medido con la dirección pie -> dedos), 1,75 m de alto,
// pies en y = 0 y cadera en X = Z = 0.
function normalizeAvatarPose(document) {
  const scene = defaultScene(document);
  const pivot = document.createNode('AvatarRoot');
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    pivot.addChild(child);
  }
  scene.addChild(pivot);

  // Dirección hacia adelante: promedio de pie -> dedos de ambos pies (así se
  // anula la apertura natural de los pies hacia afuera).
  const forward = [0, 0];
  for (const [foot, toe] of [
    [BONES.leftFoot, BONES.leftToe],
    [BONES.rightFoot, BONES.rightToe],
  ]) {
    const a = worldPosition(requireBone(document, foot));
    const b = worldPosition(requireBone(document, toe));
    forward[0] += b[0] - a[0];
    forward[1] += b[2] - a[2];
  }
  const yaw = Math.atan2(forward[0], forward[1]);
  const turn = Math.round(-yaw / (Math.PI / 2)) * (Math.PI / 2);
  pivot.setRotation([0, Math.sin(turn / 2), 0, Math.cos(turn / 2)]);

  let { min, max } = measureRestBounds(document);
  const scale = AVATAR_HEIGHT_METERS / (max[1] - min[1]);
  pivot.setScale([scale, scale, scale]);

  ({ min, max } = measureRestBounds(document));
  const hips = worldPosition(requireBone(document, BONES.hips));
  pivot.setTranslation([-hips[0], -min[1], -hips[2]]);

  ({ min, max } = measureRestBounds(document));
  return {
    pivot: { translation: pivot.getTranslation(), rotation: pivot.getRotation(), scale: pivot.getScale() },
    turnDegrees: Math.round((turn * 180) / Math.PI),
    scale: Number(scale.toPrecision(6)),
    dimensionsCm: {
      height: roundTo((max[1] - min[1]) * 100, 1),
      width: roundTo((max[0] - min[0]) * 100, 1),
      depth: roundTo((max[2] - min[2]) * 100, 1),
    },
  };
}

// ---------- 4. Avance de la cadera ----------

// Si la cadera se desplaza en X o Z más de MAX_ROOT_TRAVEL_METERS (en mundo),
// fija esas dos coordenadas al primer fotograma. La altura (Y) se conserva.
function removeRootMotion(document, animation) {
  const hips = requireBone(document, BONES.hips);
  const channel = animation.listChannels().find((c) => c.getTargetNode() === hips && c.getTargetPath() === 'translation');
  const output = channel?.getSampler()?.getOutput();
  if (!output) return false;
  const parent = hips.getParentNode();
  const parentMatrix = parent ? parent.getWorldMatrix() : IDENTITY;
  const inverseParent = invertMatrix(/** @type {number[]} */ (parentMatrix));
  const local = [0, 0, 0];
  const worldPoints = [];
  for (let i = 0; i < output.getCount(); i++) worldPoints.push(transformPoint(parentMatrix, output.getElement(i, local)));
  const [first] = worldPoints;
  const travel = Math.max(...worldPoints.map(([x, , z]) => Math.hypot(x - first[0], z - first[2])));
  if (travel <= MAX_ROOT_TRAVEL_METERS) return false;
  console.warn(
    `  ${animation.getName()}: la cadera avanza ${roundTo(travel, 2)} m; se fija en X y Z. ` +
      'Conviene descargarla de nuevo con "In Place".',
  );
  worldPoints.forEach(([, y], i) => output.setElement(i, transformPoint(inverseParent, [first[0], y, first[2]])));
  return true;
}

// ---------- 5. Recorte del pie ----------

// Elimina los triángulos cuyos tres vértices dependen de los huesos del pie
// con un peso sumado >= FOOT_TRIM.minWeight. Devuelve los triángulos quitados.
function trimFeet(document) {
  const footBones = new Set(FOOT_TRIM.bones);
  let removed = 0;
  defaultScene(document).traverse((node) => {
    const skin = node.getSkin();
    const mesh = node.getMesh();
    if (!skin || !mesh) return;
    const footJoints = new Set(
      skin
        .listJoints()
        .map((joint, index) => (footBones.has(boneBaseName(joint.getName())) ? index : -1))
        .filter((index) => index >= 0),
    );
    if (!footJoints.size) return;
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const joints = primitive.getAttribute('JOINTS_0');
      const weights = primitive.getAttribute('WEIGHTS_0');
      if (!indices || !joints || !weights) continue;
      const jointIndex = [0, 0, 0, 0];
      const weight = [0, 0, 0, 0];
      const footWeight = new Float32Array(joints.getCount());
      for (let i = 0; i < joints.getCount(); i++) {
        joints.getElement(i, jointIndex);
        weights.getElement(i, weight);
        for (let k = 0; k < 4; k++) if (footJoints.has(jointIndex[k])) footWeight[i] += weight[k];
      }
      const kept = [];
      for (let i = 0; i < indices.getCount(); i += 3) {
        const triangle = [indices.getScalar(i), indices.getScalar(i + 1), indices.getScalar(i + 2)];
        if (triangle.every((vertex) => footWeight[vertex] >= FOOT_TRIM.minWeight)) removed++;
        else kept.push(...triangle);
      }
      if (kept.length === indices.getCount()) continue;
      if (!kept.length) {
        primitive.dispose();
        continue;
      }
      primitive.setIndices(
        document.createAccessor().setType('SCALAR').setArray(new Uint32Array(kept)).setBuffer(indices.getBuffer()),
      );
      compactPrimitive(primitive);
    }
  });
  return removed;
}

// ---------- 6. Variantes ----------

// Quita los canales que nunca se apartan del valor de reposo del nodo (en
// Mixamo, casi todas las traslaciones y escalas). three.js mezcla el valor
// original cuando un clip no anima una propiedad, así que el resultado es el
// mismo con menos bytes.
function dropStaticChannels(document) {
  let dropped = 0;
  for (const animation of document.getRoot().listAnimations()) {
    for (const channel of animation.listChannels()) {
      const node = channel.getTargetNode();
      const output = channel.getSampler()?.getOutput();
      const targetPath = channel.getTargetPath();
      if (!node || !output || targetPath === 'weights') continue;
      const rest =
        targetPath === 'translation' ? node.getTranslation() : targetPath === 'rotation' ? node.getRotation() : node.getScale();
      const value = new Array(rest.length);
      let isStatic = true;
      for (let i = 0; i < output.getCount() && isStatic; i++) {
        output.getElement(i, value);
        // Un cuaternión q y -q son el mismo giro.
        const sign = targetPath === 'rotation' && value[3] * rest[3] < 0 ? -1 : 1;
        isStatic = value.every((component, axis) => Math.abs(sign * component - rest[axis]) < 1e-5);
      }
      if (!isStatic) continue;
      // Cada canal tiene su propio muestreador (copyClip crea uno por canal).
      const sampler = channel.getSampler();
      channel.dispose();
      sampler?.dispose();
      dropped++;
    }
  }
  return dropped;
}

async function compressTextures(document, variant) {
  const textures = document.getRoot().listTextures();
  if (!textures.length) return;
  await Promise.all(
    textures.map((texture) =>
      compressTexture(texture, {
        encoder: sharp,
        targetFormat: 'webp',
        resize: [variant.maxTextureSize, variant.maxTextureSize],
        effort: 100,
        quality: variant.textureQuality,
      }),
    ),
  );
  if (textures.some((texture) => texture.getMimeType() === 'image/webp')) {
    document.createExtension(EXTTextureWebP).setRequired(true);
  }
}

async function validate(glb) {
  const report = await validator.validateBytes(new Uint8Array(glb), { maxIssues: 50, writeTimestamp: false });
  return {
    errors: report.issues.numErrors,
    warnings: report.issues.numWarnings,
    errorMessages: report.issues.messages
      .filter((message) => message.severity === 0)
      .map((message) => `${message.code}: ${message.message}`),
  };
}

async function buildVariant(io, source, variantName) {
  const variant = AVATAR_VARIANTS[variantName];
  const document = cloneDocument(source);
  const initialTriangles = countTriangles(document);
  if (initialTriangles > variant.targetTriangles) {
    await document.transform(
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: variant.targetTriangles / initialTriangles,
        error: variant.maxSimplifyError,
      }),
    );
  }
  await document.transform(resample({ tolerance: variant.resampleTolerance }));
  const droppedChannels = dropStaticChannels(document);
  await compressTextures(document, variant);
  await document.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));

  const glb = await io.writeBinary(document);
  const fileName = `avatar${variant.suffix}.glb`;
  await writeFile(path.join(outDir, fileName), glb);
  const triangles = countTriangles(document);
  const validation = await validate(glb);
  return {
    file: fileName,
    bytes: glb.byteLength,
    sha256: createHash('sha256').update(glb).digest('hex'),
    triangles,
    simplifiedFrom: initialTriangles > variant.targetTriangles ? initialTriangles : undefined,
    animationChannels: document
      .getRoot()
      .listAnimations()
      .reduce((sum, animation) => sum + animation.listChannels().length, 0),
    droppedStaticChannels: droppedChannels,
    budget: variant.budget,
    withinBudget: triangles <= variant.budget.triangles && glb.byteLength <= variant.budget.bytes,
    validation,
  };
}

// ---------- 7. Manifiesto ----------

// Matriz de reposo de un hueso en el espacio del avatar, descompuesta. Sirve
// de punto de partida para calcular el desfase del zapato (docs/avatar-fitting.md).
function restTransform(node) {
  /** @type {[number, number, number]} */
  const translation = [0, 0, 0];
  /** @type {[number, number, number, number]} */
  const rotation = [0, 0, 0, 1];
  /** @type {[number, number, number]} */
  const scale = [1, 1, 1];
  MathUtils.decompose(node.getWorldMatrix(), translation, rotation, scale);
  return {
    translation: translation.map((value) => roundTo(value, 5)),
    rotation: rotation.map((value) => roundTo(value, 6)),
    scale: scale.map((value) => roundTo(value, 6)),
  };
}

function describeBones(document) {
  const bones = {};
  for (const [key, baseName] of Object.entries(BONES)) {
    const node = requireBone(document, baseName);
    bones[key] = { gltfName: node.getName(), threeName: threeNodeName(node.getName()), rest: restTransform(node) };
  }
  // Largo del tobillo a la base de los dedos y altura del tobillo: referencias
  // para la primera calibración del zapato.
  const ankle = worldPosition(requireBone(document, BONES.leftFoot));
  const toe = worldPosition(requireBone(document, BONES.leftToe));
  return {
    bones,
    foot: {
      ankleHeightMeters: roundTo(ankle[1]),
      ankleToToeBaseMeters: roundTo(Math.hypot(toe[0] - ankle[0], toe[1] - ankle[1], toe[2] - ankle[2])),
    },
  };
}

async function readPreviousManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return {};
  }
}

// ---------- 8. Vestuario ----------

// Envuelve la escena del vestuario en el mismo AvatarRoot que el avatar
// (giro, escala y traslación): así los huesos quedan idénticos y la web puede
// enlazar cada prenda al esqueleto del avatar por nombre.
function applyPivot(document, pivotTransform) {
  const scene = defaultScene(document);
  const pivot = document.createNode('AvatarRoot');
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    pivot.addChild(child);
  }
  scene.addChild(pivot);
  pivot.setTranslation(pivotTransform.translation).setRotation(pivotTransform.rotation).setScale(pivotTransform.scale);
}

// Materiales mate de un color (la web les pone el color de cada prenda y un
// relieve de tejido procedural). Sin UV: no hay texturas.
function finishFabric(document) {
  for (const material of document.getRoot().listMaterials()) {
    if (material.getName().startsWith('outfit-')) material.setMetallicFactor(0).setRoughnessFactor(0.85);
  }
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        if (semantic.startsWith('TEXCOORD_')) primitive.setAttribute(semantic, null);
      }
    }
  }
}

async function buildOutfitVariant(io, source, variantName) {
  const variant = OUTFIT_VARIANTS[variantName];
  const document = cloneDocument(source);
  const initialTriangles = countTriangles(document);
  if (variant.ratio < 1) {
    // lockBorder: los dobladillos quedan limpios.
    await document.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: variant.ratio, error: 0.01, lockBorder: true }),
    );
  }
  finishFabric(document);
  // keepUniqueNames: la web elige el material de cada pieza por su nombre
  // (tela, franja, marco, cristal), aunque sean iguales en el archivo.
  await document.transform(dedup({ keepUniqueNames: true }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const glb = await io.writeBinary(document);
  const fileName = `outfit${variant.suffix}.glb`;
  await writeFile(path.join(outDir, fileName), glb);
  const triangles = countTriangles(document);
  const validation = await validate(glb);
  const garments = Object.fromEntries(
    document
      .getRoot()
      .listNodes()
      .filter((node) => node.getMesh() && node.getName().startsWith('Outfit_'))
      .map((node) => [
        node.getName(),
        node
          .getMesh()
          .listPrimitives()
          .reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? 0) / 3, 0),
      ]),
  );
  return {
    file: fileName,
    bytes: glb.byteLength,
    sha256: createHash('sha256').update(glb).digest('hex'),
    triangles,
    simplifiedFrom: variant.ratio < 1 ? initialTriangles : undefined,
    garments,
    budget: variant.budget,
    withinBudget: triangles <= variant.budget.triangles && glb.byteLength <= variant.budget.bytes,
    validation,
  };
}

// Reglas para ocultar el cuerpo bajo la ropa en la web (sin nada de Mixamo):
// huesos, cortes y aberturas de cada prenda con esqueleto, y el nombre del
// nodo de cada prenda en el GLB.
async function writeOutfitRules() {
  const garments = Object.fromEntries(
    Object.entries(OUTFIT.garments).map(([key, garment]) => [
      key,
      { node: garment.node, bones: garment.bones, cuts: garment.cuts, holes: garment.holes ?? [] },
    ]),
  );
  const rules = {
    // Generado por pnpm avatar:build desde scripts/avatar/config.mjs (OUTFIT).
    version: 1,
    hideInset: OUTFIT.hideInset,
    forward: [0, 0, 1],
    garments,
    accessories: { cap: { node: OUTFIT.cap.node }, glasses: { node: OUTFIT.glasses.node } },
  };
  await mkdir(path.dirname(AVATAR_PATHS.outfitRules), { recursive: true });
  await writeFile(AVATAR_PATHS.outfitRules, `${JSON.stringify(rules, null, 2)}\n`);
}

// ---------- Ejecución ----------

await checkInputs();
if (!cli['skip-convert']) await convertWithBlender();
await mkdir(outDir, { recursive: true });

const io = await createIO();
await MeshoptSimplifier.ready;

console.log('\nPersonaje');
const character = await io.read(characterGlb);
for (const animation of character.getRoot().listAnimations()) animation.dispose();
normalizeBoneNames(character);
if (!character.getRoot().listSkins().length) fail('El personaje no tiene esqueleto con malla. Descárgalo con "With Skin".');
console.log(`  ${formatThousands(countTriangles(character))} triángulos, ${character.getRoot().listNodes().length} nodos`);

const clips = [];
for (const clip of CLIPS) {
  const clipDocument = await io.read(clipGlb(clip.name));
  try {
    const { animation, duration, channels } = copyClip(character, clipDocument, clip.name);
    clips.push({ name: clip.name, animation, duration, channels, rootMotionRemoved: false });
  } catch (error) {
    fail(error.message);
  }
}

const pose = normalizeAvatarPose(character);
console.log(
  `  Pose: giro ${pose.turnDegrees}°, escala ${pose.scale}, ` +
    `${pose.dimensionsCm.height} x ${pose.dimensionsCm.width} x ${pose.dimensionsCm.depth} cm (alto x ancho x fondo)`,
);

console.log('\nClips');
for (const clip of clips) {
  clip.rootMotionRemoved = removeRootMotion(character, clip.animation);
  console.log(`  ${clip.name.padEnd(5)} ${clip.duration.toFixed(2)} s, ${clip.channels} canales`);
}

const removedTriangles = trimFeet(character);
await character.transform(dedup(), prune(), weld(), prune());
console.log(`\nRecorte del pie: ${formatThousands(removedTriangles)} triángulos quitados (peso >= ${FOOT_TRIM.minWeight})`);
if (!removedTriangles) console.warn('  No se quitó nada: revisa FOOT_TRIM en scripts/avatar/config.mjs.');

const boneData = describeBones(character);

console.log('\nVariantes');
const previous = await readPreviousManifest();
const variants = {};
let problems = 0;
for (const variantName of Object.keys(AVATAR_VARIANTS)) {
  const output = await buildVariant(io, character, variantName);
  // La URL de Blob solo sigue valiendo si el archivo no cambió.
  const previousVariant = previous.variants?.[variantName];
  variants[variantName] = {
    ...output,
    url: previousVariant?.sha256 === output.sha256 ? previousVariant.url : undefined,
  };
  const ok = output.withinBudget && output.validation.errors === 0;
  if (!ok) problems++;
  console.log(
    `  ${variantName.padEnd(4)} ${formatThousands(output.triangles).padStart(7)} tris, ${formatMegabytes(output.bytes)} ` +
      `(máx. ${formatMegabytes(output.budget.bytes)}), ${output.animationChannels} canales, ` +
      `validador ${output.validation.errors} errores / ${output.validation.warnings} avisos  [${ok ? 'OK' : 'REVISAR'}]`,
  );
  for (const message of output.validation.errorMessages) console.log(`       ${message}`);
}

console.log('\nVestuario');
let outfit;
if (await exists(outfitGlb)) {
  const outfitSource = await io.read(outfitGlb);
  normalizeBoneNames(outfitSource);
  applyPivot(outfitSource, pose.pivot);
  const outfitVariants = {};
  for (const variantName of Object.keys(OUTFIT_VARIANTS)) {
    const output = await buildOutfitVariant(io, outfitSource, variantName);
    const previousVariant = previous.outfit?.variants?.[variantName];
    outfitVariants[variantName] = {
      ...output,
      url: previousVariant?.sha256 === output.sha256 ? previousVariant.url : undefined,
    };
    const ok = output.withinBudget && output.validation.errors === 0;
    if (!ok) problems++;
    console.log(
      `  ${variantName.padEnd(4)} ${formatThousands(output.triangles).padStart(7)} tris, ${formatMegabytes(output.bytes)} ` +
        `(máx. ${formatMegabytes(output.budget.bytes)}), validador ${output.validation.errors} errores / ` +
        `${output.validation.warnings} avisos  [${ok ? 'OK' : 'REVISAR'}]`,
    );
    for (const message of output.validation.errorMessages) console.log(`       ${message}`);
  }
  await writeOutfitRules();
  console.log(`  Reglas del cuerpo: ${relative(AVATAR_PATHS.outfitRules)}`);
  outfit = {
    // Prendas generadas por el proyecto (no son de Mixamo) sobre el cuerpo del Y Bot.
    source: 'generated by scripts/avatar/outfit.py from the avatar body',
    variants: outfitVariants,
  };
} else {
  console.warn('  Falta outfit.glb en la carpeta intermedia: ejecuta pnpm avatar:build sin --skip-convert.');
}

// El pivote solo sirve para el vestuario; el manifiesto guarda las medidas.
const poseData = { ...pose };
delete poseData.pivot;
const manifest = {
  source: {
    provider: 'mixamo',
    character: 'Y Bot',
    url: 'https://www.mixamo.com',
    // Mixamo permite usar personajes y animaciones en proyectos (también
    // comerciales), pero no redistribuir los archivos tal cual: por eso el
    // GLB vive en Vercel Blob y no en el repositorio.
    license: 'Adobe Mixamo terms: use in projects allowed, no redistribution of the raw files',
  },
  builtAt: new Date().toISOString().slice(0, 10),
  // Espacio del avatar: metros, Y arriba, mirando a +Z, pies en y = 0.
  heightMeters: AVATAR_HEIGHT_METERS,
  facing: '+z',
  pose: poseData,
  ...boneData,
  footTrim: { ...FOOT_TRIM, removedTriangles },
  clips: clips.map((clip) => ({
    name: clip.name,
    durationSeconds: roundTo(clip.duration, 3),
    rootMotionRemoved: clip.rootMotionRemoved,
  })),
  variants,
  outfit,
};
await mkdir(path.dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nManifiesto: ${relative(manifestPath)}`);
console.log(problems ? `${problems} variante(s) para revisar.` : 'Todo dentro del presupuesto.');
process.exit(problems ? 1 : 0);
