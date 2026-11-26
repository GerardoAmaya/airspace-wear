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
  outfitScript: path.join(ROOT_DIR, 'scripts/avatar/outfit.py'),
  // Reglas para ocultar el cuerpo bajo la ropa: las lee la web (no contienen
  // nada de Mixamo, solo nombres de huesos y medidas), por eso viven en apps/web.
  outfitRules: path.join(ROOT_DIR, 'apps/web/lib/avatar/outfit-rules.json'),
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

// ---------- Vestuario del maniquí (ropa generada por nosotros) ----------
//
// outfit.py (Blender) genera cada prenda a partir del cuerpo del Y Bot: toma
// las piezas del cuerpo cuyo hueso dominante está en `bones`, las infla
// `offset` metros por la normal, las une con un remallado de vóxeles, suaviza,
// reduce a `triangles`, corta los dobladillos con planos limpios (`cuts`) y
// abre el cuello (`holes`). Después agrega el canto del dobladillo (solidify
// solo borde, `hem`) y copia los pesos del cuerpo (vecino más cercano con
// interpolación, luego suavizados), así la prenda se deforma con cada clip.
//
// Todas las medidas van en metros del espacio del avatar (1,75 m de alto).
// Un corte es un plano perpendicular al eje que va de la cabeza del hueso
// `from` a la del hueso `to`; `t` es la posición en ese eje (0 en `from`,
// 1 en `to`) y `keep` dice qué lado queda. Los cortes de huesos Left/Right
// solo afectan a su lado del cuerpo.
//
// Las mismas reglas ocultan el cuerpo bajo la prenda en la web: un vértice
// del cuerpo se oculta si su hueso dominante está en `bones` y queda dentro
// de todos los cortes con un margen de `hideInset` (así, dentro de cada
// abertura se sigue viendo un poco de cuerpo y nunca se ve el hueco).
export const OUTFIT = {
  voxelMeters: 0.008,
  smoothIterations: 40,
  // Holgura mínima entre la tela y el cuerpo en reposo (m).
  clearance: 0.007,
  // Separación entre capas donde una prenda va sobre otra (`over`).
  layerGap: 0.006,
  weightSmoothIterations: 6,
  hideInset: 0.03,
  // Grosor del canto de los dobladillos (solidify solo borde, hacia adentro).
  hem: 0.004,
  garments: {
    // Medias (crew): de media pantorrilla al tobillo, ceñidas. Abajo quedan
    // cerradas dentro del zapato. Dos franjas en el puño (material propio,
    // `outfit-stripe`), sin logos de marcas.
    socks: {
      node: 'Outfit_Socks',
      bones: ['LeftLeg', 'RightLeg'],
      offset: 0.004,
      smoothIterations: 8,
      triangles: 600,
      cuts: [
        { from: 'LeftLeg', to: 'LeftFoot', t: 0.58, keep: 'above' },
        { from: 'RightLeg', to: 'RightFoot', t: 0.58, keep: 'above' },
      ],
      holes: [],
      stripes: [
        { from: 'LeftLeg', to: 'LeftFoot', bands: [[0.615, 0.643], [0.665, 0.693]] },
        { from: 'RightLeg', to: 'RightFoot', bands: [[0.615, 0.643], [0.665, 0.693]] },
      ],
    },
    shorts: {
      node: 'Outfit_Shorts',
      bones: ['Hips', 'LeftUpLeg', 'RightUpLeg'],
      offset: 0.012,
      triangles: 1500,
      cuts: [
        { from: 'Hips', to: 'Spine', t: 0.5, keep: 'below' },
        { from: 'LeftUpLeg', to: 'LeftLeg', t: 0.68, keep: 'below' },
        { from: 'RightUpLeg', to: 'RightLeg', t: 0.68, keep: 'below' },
      ],
      holes: [],
      // Pierna recta (cae desde la parte más ancha del muslo) y apenas
      // abierta hacia el dobladillo.
      drape: [
        { from: 'LeftUpLeg', to: 'LeftLeg', start: 0.02, end: 0.7, inner: 0.35 },
        { from: 'RightUpLeg', to: 'RightLeg', start: 0.02, end: 0.7, inner: 0.35 },
      ],
      taper: [
        { from: 'LeftUpLeg', to: 'LeftLeg', start: 0.35, end: 0.68, factor: 1.06 },
        { from: 'RightUpLeg', to: 'RightLeg', start: 0.35, end: 0.68, factor: 1.06 },
      ],
    },
    pants: {
      node: 'Outfit_Pants',
      bones: ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'],
      offset: 0.009,
      triangles: 2100,
      over: ['socks'],
      cuts: [
        { from: 'Hips', to: 'Spine', t: 0.5, keep: 'below' },
        { from: 'LeftLeg', to: 'LeftFoot', t: 0.74, keep: 'below' },
        { from: 'RightLeg', to: 'RightFoot', t: 0.74, keep: 'below' },
      ],
      holes: [],
      // Jogger entallado: recto desde medio muslo hasta la rodilla.
      drape: [
        { from: 'LeftUpLeg', to: 'LeftLeg', start: 0.45, end: 1.0, inner: 0.3 },
        { from: 'RightUpLeg', to: 'RightLeg', start: 0.45, end: 1.0, inner: 0.3 },
      ],
      // Jogger: la pierna se angosta hacia el puño (el radio se multiplica
      // por un factor que va de 1 en `start` a `factor` en `end`).
      taper: [
        { from: 'LeftLeg', to: 'LeftFoot', start: 0.15, end: 0.74, factor: 0.8 },
        { from: 'RightLeg', to: 'RightFoot', start: 0.15, end: 0.74, factor: 0.8 },
      ],
    },
    shirt: {
      node: 'Outfit_Shirt',
      bones: ['Hips', 'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm'],
      offset: 0.012,
      triangles: 2000,
      cuts: [
        { from: 'Hips', to: 'Spine', t: -0.42, keep: 'above' },
        { from: 'LeftArm', to: 'LeftForeArm', t: 0.46, keep: 'below' },
        { from: 'RightArm', to: 'RightForeArm', t: 0.46, keep: 'below' },
      ],
      holes: [{ from: 'Neck', to: 'Head', radius: 0.062, forward: 0.01, minT: -0.6 }],
      over: ['shorts', 'pants'],
      drape: [
        { from: 'Spine2', to: 'Hips', start: 0, end: 1.4 },
        { from: 'LeftArm', to: 'LeftForeArm', start: 0.12, end: 0.5 },
        { from: 'RightArm', to: 'RightForeArm', start: 0.12, end: 0.5 },
      ],
    },
    tank: {
      node: 'Outfit_Tank',
      bones: ['Hips', 'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder'],
      offset: 0.011,
      triangles: 1600,
      cuts: [
        { from: 'Hips', to: 'Spine', t: -0.42, keep: 'above' },
        { from: 'LeftShoulder', to: 'LeftArm', t: 0.78, keep: 'below' },
        { from: 'RightShoulder', to: 'RightArm', t: 0.78, keep: 'below' },
      ],
      holes: [{ from: 'Neck', to: 'Head', radius: 0.07, forward: 0.025, minT: -0.6 }],
      over: ['shorts', 'pants'],
      drape: [{ from: 'Spine2', to: 'Hips', start: 0, end: 1.4 }],
    },
  },
  // Accesorios rígidos, hijos del hueso de la cabeza (sin pesos). Se ajustan
  // a la cabeza del Y Bot medida en Blender; estos valores son la calibración.
  cap: {
    node: 'Outfit_Cap',
    offset: 0.008,
    // Altura del borde sobre los ojos (m) adelante y atrás.
    frontRise: 0.018,
    backDrop: -0.035,
    brimDegrees: 52,
    brimLength: 0.074,
    brimDroop: 0.02,
    thickness: 0.004,
  },
  glasses: {
    node: 'Outfit_Glasses',
    // Altura de los ojos como fracción de la cabeza (de la base a la coronilla).
    eyeHeight: 0.5,
    lensWidth: 0.048,
    lensHeight: 0.036,
    lensCorner: 0.014,
    bridge: 0.016,
    frameRadius: 0.0021,
    standoff: 0.012,
    wrapDegrees: 9,
  },
};

// Archivos y presupuestos del vestuario. Va en GLB propios (no dentro del
// avatar): el avatar ya ocupa su presupuesto de triángulos, la ropa se carga
// después del maniquí y, si falta, el Hangar sigue funcionando sin ella.
// En la web el cuerpo bajo la ropa no se dibuja, así que los triángulos que
// se ven en pantalla quedan cerca del presupuesto del avatar. Sin UV ni
// texturas: el tejido es un relieve procedural en el shader (solo en el hero).
export const OUTFIT_VARIANTS = {
  hero: {
    suffix: '',
    ratio: 1,
    budget: { triangles: 14_000, bytes: 150_000 },
  },
  lite: {
    suffix: '-lite',
    ratio: 0.42,
    budget: { triangles: 7_000, bytes: 80_000 },
  },
};

