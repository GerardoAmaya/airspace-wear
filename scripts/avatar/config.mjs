// Configuración del pipeline del avatar del Hangar 360° (paso 3, fase 1).
//
// Entradas (descargas de Mixamo, carpeta ignorada por git porque la licencia
// no permite redistribuir los archivos tal cual):
//   assets/avatar/raw/ybot.fbx   personaje "With Skin", en T-pose
//   assets/avatar/raw/<clip>.fbx animaciones "Without Skin", "In Place", 30 fps
//
// Salidas (también ignoradas por git: el avatar se publica en Vercel Blob):
//   assets/avatar/out/intermediate/*.glb  conversión directa de cada FBX
//   assets/avatar/out/avatar.glb          hero
//   assets/avatar/out/avatar-lite.glb     modo liviano
//
// El manifiesto (assets/avatar/manifest.json) sí se versiona: no contiene
// nada de Mixamo, solo medidas, nombres de huesos, clips y las URLs públicas.

import path from 'node:path';

export const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

export const AVATAR_PATHS = {
  rawDir: path.join(ROOT_DIR, 'assets/avatar/raw'),
  outDir: path.join(ROOT_DIR, 'assets/avatar/out'),
  workDir: path.join(ROOT_DIR, 'assets/avatar/out/intermediate'),
  manifest: path.join(ROOT_DIR, 'assets/avatar/manifest.json'),
  blenderScript: path.join(ROOT_DIR, 'scripts/avatar/fbx_to_glb.py'),
};

// Archivo del personaje (con malla y esqueleto) dentro de rawDir.
export const CHARACTER_FILE = 'ybot.fbx';

// Clips: nombre final en el GLB -> archivo de Mixamo dentro de rawDir.
// El orden es el del manifiesto y el de los chips de la página.
export const CLIPS = [
  { name: 'idle', file: 'idle.fbx' },
  { name: 'walk', file: 'walk.fbx' },
  { name: 'turn', file: 'turn.fbx' },
  { name: 'pose', file: 'pose.fbx' },
];

// Altura real del avatar en metros (de la suela del pie a la coronilla, en
// T-pose). Con 1,75 m el pie del Y Bot mide unos 26 cm: cabe en un zapato de
// 0,30 m (pose canónica de los sneakers) con el margen de la puntera.
export const AVATAR_HEIGHT_METERS = 1.75;

// Huesos de Mixamo que usa el pipeline. Los nombres van sin prefijo: en el
// archivo aparecen como "mixamorig:LeftFoot" (a veces "mixamorig1:" o
// "mixamorig9:" según la cuenta), y el pipeline los normaliza a "mixamorig:".
export const BONE_PREFIX = 'mixamorig:';
export const BONES = {
  hips: 'Hips',
  leftFoot: 'LeftFoot',
  rightFoot: 'RightFoot',
  leftToe: 'LeftToeBase',
  rightToe: 'RightToeBase',
};

// Recorte del pie: se eliminan los triángulos cuyos tres vértices dependen de
// estos huesos con un peso sumado igual o mayor a minWeight. Así desaparece
// todo lo que queda por debajo del tobillo y no atraviesa el zapato. Con 0,5
// el corte cae cerca de la articulación del tobillo; si en un zapato bajo
// (Samba) se ve un hueco sobre el cuello, subir el umbral (0,7 a 0,9) deja
// más malla del tobillo.
export const FOOT_TRIM = {
  bones: [BONES.leftFoot, BONES.leftToe, BONES.rightFoot, BONES.rightToe],
  minWeight: 0.5,
};

// Desplazamiento horizontal máximo de la cadera dentro de un clip (en metros,
// ya escalado). Mixamo exporta "In Place" sin avance; si un clip se bajó sin
// esa opción, el pipeline fija la cadera en X y Z y avisa.
export const MAX_ROOT_TRAVEL_METERS = 0.05;

// Variantes. targetTriangles es la meta de la simplificación (solo se aplica
// si la malla la supera); budget son los límites del plan del paso 3
// (docs/plan-paso-3.md, sección 3): 1,5 MB y 25k triángulos con animaciones,
// y 700 KB en modo liviano. resampleTolerance es el error permitido al quitar
// fotogramas redundantes de las animaciones (más alto = archivo más chico).
export const AVATAR_VARIANTS = {
  hero: {
    suffix: '',
    targetTriangles: 25_000,
    maxSimplifyError: 0.005,
    maxTextureSize: 1024,
    textureQuality: 85,
    resampleTolerance: 1e-4,
    budget: { triangles: 25_000, bytes: 1_500_000 },
  },
  lite: {
    suffix: '-lite',
    targetTriangles: 12_000,
    maxSimplifyError: 0.01,
    maxTextureSize: 512,
    textureQuality: 80,
    resampleTolerance: 1e-3,
    budget: { triangles: 25_000, bytes: 700_000 },
  },
};

// Vercel Blob: carpeta dentro del store y caché del navegador y del CDN. Los
// archivos llevan el hash del contenido en el nombre, así que pueden quedar
// en caché un año: un avatar nuevo es otra URL.
export const BLOB_PREFIX = 'avatar';
export const BLOB_CACHE_SECONDS = 31_536_000;
