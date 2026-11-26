// Configuración central del pipeline de modelos 3D.
// Cada zapato del catálogo con modelo 3D tiene una entrada aquí. El slug define
// el nombre de los archivos: assets/models/raw/<slug>.glb (original) y
// apps/web/public/models/<slug>.glb y <slug>-lite.glb (optimizados).

import path from 'node:path';

export const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

export const PATHS = {
  rawDir: path.join(ROOT_DIR, 'assets/models/raw'),
  outputDir: path.join(ROOT_DIR, 'apps/web/public/models'),
  manifest: path.join(ROOT_DIR, 'assets/models/manifest.json'),
  credits: path.join(ROOT_DIR, 'CREDITS.md'),
};

// Ruta pública con la que el frontend sirve los modelos optimizados.
export const PUBLIC_MODELS_URL = '/models';

// Largo real de un zapato adulto (talla US 9 a 10), en metros. Todos los
// modelos se normalizan a esta escala para que AR muestre el tamaño real y
// todas las escenas 3D compartan las mismas proporciones.
export const SHOE_LENGTH_METERS = 0.3;

// Categorías de producto con modelo 3D y su pose canónica.
// - sneaker: largo real en X (punta hacia +X), con enderezado automático del
//   giro fino (yaw) para que el largo quede paralelo a X.
// - ball: diámetro real de un balón talla 5 (FIFA: 68 a 70 cm de
//   circunferencia, unos 22 cm de diámetro). En una esfera el giro fino no
//   tiene sentido, así que se conserva la orientación de los paneles.
// En ambas, el objeto queda apoyado en y = 0 y centrado en X y Z.
export const CATEGORIES = {
  sneaker: { sizeMeters: SHOE_LENGTH_METERS, autoYaw: true },
  ball: { sizeMeters: 0.22, autoYaw: false },
};

// Variantes que se generan por modelo.
// - hero: páginas de producto y escenas principales.
// - lite: modo liviano (DPR 1), móviles de gama baja y el avatar 360°. Usa
//   texturas de 512 px (4 veces menos memoria de GPU) y antes de simplificar
//   elimina piezas sueltas diminutas como costuras, que a esa resolución miden
//   cerca de un píxel. pruneSmallParts es el tamaño máximo de esas piezas, como
//   fracción del tamaño de la malla (0.005 en un zapato de 30 cm = 1.5 mm).
// targetTriangles es la meta de la simplificación; maxSimplifyError es el
// desvío máximo permitido, como fracción del tamaño de cada malla; budget son
// los límites que el reporte verifica. Los bytes vienen del plan del paso 2
// (docs/plan-paso-2.md, sección 3.8): hero hasta 1,1 MB y lite hasta 450 KB.
// Si un archivo no cabe, primero se baja la calidad de las texturas de color
// (TEXTURE_QUALITY_STEPS) y, si no basta, el modelo ajusta sus texturas o su
// meta de triángulos con variantOverrides.
export const VARIANTS = {
  hero: {
    suffix: '',
    targetTriangles: 90_000,
    maxSimplifyError: 0.01,
    pruneSmallParts: 0,
    dropTransmission: false,
    maxTextureSize: 2048,
    budget: { triangles: 100_000, bytes: 1_100_000 },
  },
  lite: {
    suffix: '-lite',
    targetTriangles: 20_000,
    maxSimplifyError: 0.03,
    pruneSmallParts: 0.005,
    // La transmisión (KHR_materials_transmission) obliga a una pasada de render
    // extra en cada cuadro: en lite se quita y queda solo la transparencia.
    dropTransmission: true,
    maxTextureSize: 512,
    budget: { triangles: 40_000, bytes: 450_000 },
  },
};

// Calidad WebP de las texturas de color: se prueba en orden hasta que el
// archivo cabe en el presupuesto.
export const TEXTURE_QUALITY_STEPS = [88, 80, 72, 64];

// Texturas de datos (normales, rugosidad/metal, oclusión): no son color, y la
// compresión con pérdida en ellas se nota en la iluminación. Usan más calidad.
export const DATA_TEXTURE_SLOTS = /^(normalTexture|metallicRoughnessTexture|occlusionTexture)$/;
export const DATA_TEXTURE_QUALITY = 92;

// Licencias de Sketchfab conocidas (slug de la API -> datos para créditos).
export const LICENSES = {
  by: {
    name: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    commercialUse: true,
    shareAlike: false,
  },
  'by-sa': {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    commercialUse: true,
    shareAlike: true,
  },
  'by-nc': {
    name: 'CC BY-NC 4.0',
    url: 'https://creativecommons.org/licenses/by-nc/4.0/',
    commercialUse: false,
    shareAlike: false,
  },
  'by-nc-sa': {
    name: 'CC BY-NC-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    commercialUse: false,
    shareAlike: true,
  },
  cc0: {
    name: 'CC0 1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    commercialUse: true,
    shareAlike: false,
  },
};

// Catálogo de modelos.
//
// Pose canónica de todos los modelos optimizados: suela apoyada en y = 0,
// centrado en X y Z, punta hacia +X y largo real de SHOE_LENGTH_METERS.
// Con esa pose, la cámara por defecto (desde +Z) ve el lado exterior de un
// zapato derecho y el lado interior de uno izquierdo.
//
// - category: 'sneaker' (por defecto) o 'ball' (ver CATEGORIES). Los
//   balones no llevan foot.
// - foot: pie del modelo ('left' o 'right'). Se verificó con la suela: el
//   arco (lado interior) es el lado más angosto a media planta.
// - transform.rotation: giro en grados [x, y, z] que lleva la punta a +X.
//   Después el pipeline endereza solo el giro fino (yaw) y escala.
// - extract: el modelo trae un par; se conserva solo un zapato, elegido por el
//   lado del eje en el que está dentro del archivo original.
// - maxSimplifyError: límite propio del modelo, si es menor que el de la
//   variante. Necesario cuando la geometría tiene capas superpuestas.
// - keepMaterials: materiales que no se simplifican (por nombre). Útil cuando
//   la simplificación deforma las UV de una pieza con mapa de relieve.
// - simplifyWithAttributes: simplifica cuidando también normales y UV
//   (más lento, mejor resultado en piezas con mapa de relieve).
// - simplifyAcrossSeams: variantes (por ejemplo ['lite']) en las que la
//   simplificación puede cruzar las costuras de UV. Para escaneos con el atlas
//   partido en miles de islas, que de otro modo no bajan de la meta.
// - budgetOverrides: ajusta el presupuesto de una variante para este modelo,
//   con la razón documentada junto al valor.
// - variantOverrides: ajustes de una variante solo para este modelo, para que
//   quepa en el presupuesto de bytes. Acepta targetTriangles, maxTextureSize,
//   dataTextureQuality (calidad WebP de normales, rugosidad/metal y oclusión,
//   por defecto DATA_TEXTURE_QUALITY), textureSizeBySlot (lado máximo por slot,
//   por ejemplo { specularTexture: 512 }) y textureSizeByMaterial (lado máximo
//   de las texturas de un material, por nombre). Documentar la razón al lado.
export const MODELS = [
  {
    slug: 'air-jordan-1',
    displayName: 'Air Jordan 1',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: 'a4b434181fbb48008ad460722fd53725' },
    foot: 'right',
    // El original es un par (izquierdo en +X, derecho en -X, punta hacia +Z).
    extract: { axis: 'x', side: 'negative' },
    transform: { rotation: [0, 90, 0] },
  },
  {
    slug: 'new-balance-997',
    displayName: 'New Balance 997',
    brand: 'New Balance',
    source: { provider: 'sketchfab', uid: '05e79a2dffbc4356bba7e0751fada08f' },
    foot: 'right',
    transform: { rotation: [0, 90, 0] },
    // Cuatro materiales con su propio juego de texturas (color, rugosidad y
    // normales): 11 texturas que pesaban 1,5 MB en hero. La capellada (Outer)
    // conserva 1024 px; la suela baja a 768 y los cordones y el forro interior,
    // que se ven pequeños, a 512. En lite, los cordones van a 256 px y el forro
    // a 384 (con 256 el logo de la lengüeta se veía borroso).
    variantOverrides: {
      hero: { dataTextureQuality: 85, textureSizeByMaterial: { Sole: 768, Laces: 512, Inner: 512 } },
      lite: { dataTextureQuality: 85, textureSizeByMaterial: { Laces: 256, Inner: 384 } },
    },
  },
  {
    slug: 'nike-air-uptempo',
    displayName: 'Nike Air Uptempo',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: 'b147852f4b3f481aac7a4686b08cf43c' },
    foot: 'left',
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'adidas-samba',
    displayName: 'Adidas Samba',
    brand: 'Adidas',
    source: { provider: 'sketchfab', uid: '886ff5e75d174dc884c63e829fa4bb59' },
    foot: 'left',
    transform: { rotation: [0, -90, 0] },
  },
  {
    slug: 'adidas-sambae',
    displayName: 'Adidas Sambae',
    brand: 'Adidas',
    source: { provider: 'sketchfab', uid: '57413d6cea774d289d4a9a59cbbd884a' },
    foot: 'right',
    // El original ya trae la punta en +X; solo hace falta escalar y centrar.
    transform: { rotation: [0, 0, 0] },
    // La textura especular (KHR_materials_specular) guarda su valor en el
    // canal alfa, que WebP comprime sin pérdida: no baja con la calidad, solo
    // con el tamaño. La suela de goma translúcida (SOLE) es lisa y aguanta
    // 768 px. La capellada (UPPER) conserva 1024 px en color y normales.
    variantOverrides: {
      hero: {
        targetTriangles: 65_000,
        dataTextureQuality: 85,
        textureSizeBySlot: { specularTexture: 512 },
        textureSizeByMaterial: { SOLE: 768 },
      },
      lite: { dataTextureQuality: 85, textureSizeBySlot: { specularTexture: 256 } },
    },
  },
  {
    slug: 'adidas-prophere',
    displayName: 'Adidas Prophere',
    brand: 'Adidas',
    source: { provider: 'sketchfab', uid: 'e582295a143041268a737b4ea54556cc' },
    foot: 'right',
    // El original ya trae la punta en +X.
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'adidas-gazelle',
    displayName: 'Adidas Gazelle',
    brand: 'Adidas',
    source: { provider: 'sketchfab', uid: '280ae99c7f4647c9aa450e140aa7a9de' },
    foot: 'left',
    // Escaneo con iluminación incluida (unlit). El original está en diagonal:
    // la punta apunta entre +X y +Z, unos 50° fuera del eje X.
    transform: { rotation: [0, 50, 0] },
  },
  {
    slug: 'adidas-basketball',
    displayName: 'Adidas Basketball',
    brand: 'Adidas',
    source: { provider: 'sketchfab', uid: '66eb9956736f491889f444c0aa64c055' },
    foot: 'left',
    // Escaneo de un zapato de básquet; el original ya trae la punta en +X.
    transform: { rotation: [0, 0, 0] },
    // Con el error del lite (3%) el escaneo abría líneas oscuras en el talón:
    // eran costuras de UV, así que se simplifica cuidando normales y UV.
    maxSimplifyError: 0.008,
    simplifyWithAttributes: true,
  },
  {
    slug: 'air-jordan-1-mid-particle-beige',
    displayName: 'Air Jordan 1 Mid Particle Beige',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: '3d9886592e9847c59ebf6c8341b005a7' },
    foot: 'right',
    // El original trae la punta hacia +Z.
    transform: { rotation: [0, 90, 0] },
  },
  {
    slug: 'jordan-4-university-blue',
    displayName: 'Jordan 4 Retro University Blue',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: '68f32cad08544592aafd56a1ac7c60bc' },
    foot: 'right',
    // El original ya trae la punta en +X.
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'nike-pegasus-36',
    displayName: 'Nike Air Zoom Pegasus 36',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: '00fd99e778c244c3bd3b65f99dad7cb2' },
    foot: 'right',
    // El original trae la punta hacia -Z.
    transform: { rotation: [0, -90, 0] },
    // Las normales y la rugosidad/oclusión (1024 px) eran casi 500 KB con
    // calidad 92; con 85 el hero cabe en 1,1 MB sin bajar de resolución.
    variantOverrides: { hero: { dataTextureQuality: 85 } },
  },
  {
    slug: 'jordan-4-travis-scott',
    displayName: 'Jordan 4 Retro Travis Scott Purple',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: 'e055428e1f294a73b5e6518a4f902c04' },
    foot: 'left',
    // El original trae la punta hacia +Z y además está inclinado unos 13°:
    // apoya la punta y el talón flota. Estos ángulos de Euler (orden XYZ)
    // equivalen a girar 90° en Y (punta a +X) y luego bajar el talón 13° en Z
    // (deja la punta levantada como en los otros Jordan 4).
    transform: { rotation: [-90, 77, 90] },
  },
  {
    slug: 'nike-dunk-high-hawaii',
    displayName: 'Nike Dunk High Hawaii',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: 'b91992960af540c7a1edef97bf4d7ef1' },
    foot: 'left',
    // Escaneo de fotogrametría con iluminación incluida (unlit), como el
    // Gazelle. Sin base ni piso. El original ya trae la punta en +X, unos 12°
    // fuera del eje (lo corrige el ajuste fino).
    transform: { rotation: [0, 0, 0] },
    // 3.3 millones de triángulos con el atlas de textura partido en miles de
    // islas: sin cruzar costuras de UV el lite no bajaba de 77k triángulos.
    simplifyAcrossSeams: ['lite'],
    // Por las mismas islas, cada triángulo trae vértices propios y la
    // geometría pesaba 870 KB con 90k triángulos. La textura es una sola
    // (276 KB), así que el hero baja de triángulos y no de textura. Las
    // costuras de UV frenan la simplificación cerca de 78k (1,10 MB), que
    // cabe en el presupuesto sin cruzarlas en hero.
    variantOverrides: { hero: { targetTriangles: 70_000 } },
  },
  {
    slug: 'adidas-teamgeist-2006',
    displayName: 'Adidas Teamgeist 2006',
    brand: 'Adidas',
    category: 'ball',
    source: { provider: 'sketchfab', uid: '570b82c4391c49ddb1e471e6e55de9f4' },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'adidas-jabulani-2010',
    displayName: 'Adidas Jabulani 2010',
    brand: 'Adidas',
    category: 'ball',
    source: { provider: 'sketchfab', uid: '1ac8623bb591463a930056f3130ddadc' },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'adidas-telstar-1970',
    displayName: 'Adidas Telstar 1970',
    brand: 'Adidas',
    category: 'ball',
    source: { provider: 'sketchfab', uid: 'fedfaa96f48d45068414db905d28c769' },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'adidas-al-rihla-2022',
    displayName: 'Adidas Al Rihla 2022',
    brand: 'Adidas',
    category: 'ball',
    source: { provider: 'sketchfab', uid: '354acbcd704e48e0be352ebd7b28f934' },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'adidas-trionda-2026',
    displayName: 'Adidas Trionda 2026',
    brand: 'Adidas',
    category: 'ball',
    source: { provider: 'sketchfab', uid: 'e22ee40495df4cd59465411f8f3d935c' },
    transform: { rotation: [0, 0, 0] },
  },
];
