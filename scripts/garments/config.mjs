// Prendas propias del proyecto, modeladas en Blender a partir del cuerpo del
// Y Bot (como el vestuario base de scripts/avatar/outfit.py) y texturizadas
// con dibujos vectoriales propios. Hoy: el hoodie, en dos colores, y la
// camiseta de manga corta.
//
// Uso: pnpm garments (scripts/garments/build.mjs). Después: pnpm models:optimize
// --only <slug>, pnpm models:posters --only <slug> y pnpm avatar:fit --only <slug>.
//
// Medidas en metros del avatar (1,75 m de alto, pies en y = 0, frente a +Z).

import path from 'node:path';

export const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

export const GARMENT_PATHS = {
  // Geometría, texturas y GLB intermedios (se regeneran con pnpm garments).
  outDir: path.join(ROOT_DIR, 'assets/garments/out'),
  // El GLB "original" de cada producto para el pipeline de modelos.
  rawModelsDir: path.join(ROOT_DIR, 'assets/models/raw'),
};

// Hoodie de felpa de corte regular, cerca del cuerpo (la silueta del anorak
// gris del catálogo): hombro apenas caído, mangas que se afinan hacia el puño
// de canalé, ruedo en la cadera con una banda de canalé que la abraza, capucha
// baja y delgada apoyada detrás del cuello, bolsillo canguro y cordones con
// ojales de metal. El dueño pidió que no se vea holgado ni inflado: sin
// simulación de tela, el volumen extra se ve rígido al caminar.
export const HOODIE = {
  heightMeters: 1.75,
  shell: {
    // Piezas del cuerpo que forman la base de la prenda (torso y brazos).
    bones: ['Hips', 'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'],
    // Inflado inicial sobre el cuerpo y remallado de vóxeles.
    offset: 0.012,
    voxelMeters: 0.007,
    smoothIterations: 30,
    // Suavizado final, después de dar forma (borra el ruido del remallado).
    finalSmooth: 8,
    triangles: 30_000,
    // Ruedo: alto sobre el piso y banda de canalé.
    hemHeight: 0.895,
    // Corte en A: desde esta altura (la sisa) la tela baja en línea recta.
    aLineFrom: 1.24,
    hemRib: 0.06,
    // La banda de canalé del ruedo abraza la cadera (factor del radio), como
    // un elástico: sin simulación de tela, un ruedo largo y suelto se ve rígido
    // al caminar, así que el ruedo queda en la cadera alta y sigue al torso.
    hemGather: 0.012,
    // Holgura del torso: casi igual del pecho al ruedo (corte regular, sin
    // vuelo abajo: sin simulación de tela, un ruedo con vuelo se ve rígido al caminar).
    torsoEase: { chest: 0.003, hem: 0.004 },
    // Mangas: punto del corte sobre el eje del brazo (0 hombro, 1 mano),
    // holgura y puño de canalé (largo y holgura sobre la muñeca).
    sleeveEnd: 0.985,
    sleeveEase: 0,
    // Arrastre del radio de arriba hacia la muñeca (por tramo de 1/40 de la
    // manga): 0,96 afina la manga hacia el antebrazo como la del anorak.
    sleeveTaper: 0.96,
    cuffLength: 0.065,
    cuffEase: 0.002,
    // Volumen que cae sobre el puño (tela que se junta antes del canalé).
    cuffBunch: 0.003,
    // Costura del hombro caído: a cuántos metros del hueso del brazo.
    shoulderSeam: 0.045,
    neckHole: { radius: 0.078, forward: 0.012, minT: -0.6 },
    // Holgura mínima con el cuerpo en reposo.
    clearance: 0.01,
    // Canto del ruedo y los puños (solidify solo borde, hacia adentro).
    hem: 0.005,
    // Pliegues suaves (amplitud en metros): codos, espalda baja, sobre los
    // puños y ondas verticales del ruedo.
    folds: { elbow: 0.003, lowerBack: 0.002, cuff: 0.002, hem: 0.004 },
  },
  // Capucha baja: un rollo cerrado alrededor del cuello que cae sobre la espalda.
  hood: {
    segments: 72,
    profile: 13,
    // Alto del cuello de la capucha sobre el escote (adelante, atrás).
    stand: [0.016, 0.034],
    // Caída sobre el cuerpo desde el escote (adelante, costados, atrás).
    drop: [0.015, 0.07, 0.13],
    // Grosor del rollo (adelante, atrás).
    thickness: [0.01, 0.028],
    // La tela se abre hacia los costados al caer sobre la espalda.
    spread: 0.9,
    gap: 0.004,
  },
  pocket: {
    // Bolsillo canguro: trapecio sobre la banda del ruedo.
    bottom: 0.96,
    top: 1.095,
    halfWidthBottom: 0.15,
    halfWidthTop: 0.11,
    thickness: 0.003,
    gap: 0.004,
    bulge: 0.005,
    // Las aberturas laterales se separan un poco de la tela.
    opening: 0.006,
  },
  cords: {
    // Ángulo de cada ojal desde el frente (grados) y largo del cordón.
    angle: 34,
    length: 0.12,
    radius: 0.0034,
    aglet: 0.024,
    eyelet: { radius: 0.0058, tube: 0.0017 },
  },
  // Pose de exhibición del modelo del catálogo (brazos abajo, en grados).
  displayPose: { arms: { down: 62, forward: 8 }, forearms: { down: 4, forward: 10 } },
  // Atlas de textura (fracciones de la imagen: x0, y0, x1, y1, origen arriba a
  // la izquierda). Una sola textura para toda la tela. El frente y la espalda
  // (donde van los estampados con letras chicas) se llevan casi tres cuartos
  // de la imagen: cada uno ocupa media columna a lo ancho, que es su lado
  // limitante (unos 2400 px por metro en 2048 px). Las mangas (solo bandas y
  // una etiqueta) quedan a la misma densidad de antes; la capucha y los
  // cordones son tela lisa y el bolsillo es relieve de la malla con su
  // contorno dibujado en el frente, así que su isla casi no se usa.
  atlas: {
    front: [0, 0, 0.5, 0.74],
    back: [0.5, 0, 1, 0.74],
    sleeveL: [0, 0.74, 0.38, 1],
    sleeveR: [0.38, 0.74, 0.76, 1],
    hood: [0.76, 0.74, 1, 0.94],
    pocket: [0.76, 0.94, 0.88, 1],
    cords: [0.88, 0.94, 1, 1],
  },
  textureSize: 2048,
};

// Camiseta de manga corta, cerca del cuerpo como el anorak gris: misma base
// que el hoodie (piezas del maniquí infladas y remalladas, corte en A desde la
// sisa), sin capucha, bolsillo ni cordones. Mangas que terminan a media parte
// alta del brazo, abiertas (sin puño), ruedo en la cadera alta que la abraza y
// cuello redondo de canalé (el rollo de la capucha, bajo y delgado). Va por
// fuera del pantalón (hidesBottoms en scripts/avatar/fit.json).
export const TEE = {
  heightMeters: 1.75,
  shell: {
    ...HOODIE.shell,
    // Ruedo en la cadera alta, con una banda lisa de 2 cm (dobladillo, sin
    // canalé) que se junta apenas.
    hemHeight: 0.94,
    hemRib: 0.02,
    hemGather: 0.004,
    // Corte regular, sin vuelo: la tela no crece hacia el ruedo.
    torsoEase: { chest: 0.002, hem: 0 },
    // Manga corta: el corte cae a media parte alta del brazo (0 hombro, 1
    // mano), abierta y algo más holgada que la del hoodie, sin puño.
    sleeveEnd: 0.32,
    sleeveEase: 0.004,
    sleeveTaper: 0.985,
    cuff: false,
    // Dobladillo de la manga (solo el pespunte de la textura).
    cuffLength: 0.02,
    cuffEase: 0,
    cuffBunch: 0,
    // Cuello redondo, un poco más abierto que el escote del hoodie.
    neckHole: { radius: 0.08, forward: 0.014, minT: -0.6 },
    hem: 0.003,
    folds: { elbow: 0, lowerBack: 0.0015, cuff: 0, hem: 0.002 },
  },
  // Cuello de canalé: un rollo cerrado de 1,3 cm de alto y 4 mm de grosor.
  collar: {
    segments: 72,
    profile: 6,
    stand: [0.011, 0.013],
    drop: [0.006, 0.006, 0.006],
    thickness: [0.0035, 0.0035],
    spread: 0,
    gap: 0.002,
  },
  // Canalé solo en el cuello; ruedo y mangas con dobladillo liso.
  ribs: { hem: false, cuffs: false, collar: true },
  displayPose: HOODIE.displayPose,
  // Atlas: el frente (NIKE y el swoosh) y la espalda (figura, salpicado fino
  // y la palabra en cursiva) llevan estampados con bordes finos, así que cada
  // uno se queda con media columna y 80 % del alto (su lado limitante es el
  // ancho: unos 2450 px por metro en 2048 px). Las mangas cortas y el cuello
  // son tela lisa.
  atlas: {
    front: [0, 0, 0.5, 0.8],
    back: [0.5, 0, 1, 0.8],
    sleeveL: [0, 0.8, 0.5, 0.97],
    sleeveR: [0.5, 0.8, 1, 0.97],
    collar: [0, 0.97, 1, 1],
  },
  textureSize: 2048,
};

// Prendas que genera pnpm garments: la geometría de cada una se modela una
// vez (Blender) y sirve a todos sus colores.
export const GARMENTS = { hoodie: HOODIE, tee: TEE };

// Colores de cada producto (sRGB) y la prenda que usan. Los estampados se
// dibujan en scripts/garments/prints.mjs.
export const COLORWAYS = [
  {
    slug: 'camiseta-nike-flight-negra',
    garment: 'tee',
    fabric: [22, 22, 24],
    rib: [18, 18, 20],
    stitch: [36, 36, 39],
    cord: [22, 22, 24],
    metal: [0.72, 0.72, 0.74],
    print: 'nike-flight-black',
  },
  {
    slug: 'hoodie-nike-blanco',
    garment: 'hoodie',
    // Crema (cerca del 70 % de blanco, apenas cálido): con las luces de la
    // escena (y la luz de borde) se lee como felpa, más oscuro que el blanco
    // de un sneaker y cerca del gris más claro del anorak.
    fabric: [182, 178, 170],
    rib: [176, 172, 164],
    stitch: [162, 158, 150],
    cord: [188, 185, 177],
    metal: [0.78, 0.78, 0.8],
    print: 'nike-white',
  },
  {
    slug: 'hoodie-nike-air-negro',
    garment: 'hoodie',
    fabric: [24, 24, 26],
    rib: [20, 20, 22],
    stitch: [36, 36, 39],
    cord: [22, 22, 24],
    metal: [0.72, 0.72, 0.74],
    print: 'nike-air-black',
  },
];
