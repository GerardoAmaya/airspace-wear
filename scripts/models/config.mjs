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
// - cleat: botín de fútbol. Misma pose que un sneaker; como apoya en los
//   tapones, y = 0 queda en la punta de los tapones y no en la planta.
// - apparel: ropa y accesorios. El frente de la prenda mira a +Z (la cámara
//   por defecto) y el borde inferior queda en y = 0. La escala sale del alto
//   (sizeAxis 'y') de una prenda talla M: 0.70 m para una camiseta o sudadera.
//   Cada modelo ajusta su medida con size: { axis, meters } (1.0 m de alto un
//   pantalón largo, 0.5 m un short, el ancho real en X de una gorra, unos
//   lentes, una maleta o un reloj). Sin giro fino automático: el frente lo
//   fija transform.rotation.
// En todas, el objeto queda apoyado en y = 0 y centrado en X y Z.
export const CATEGORIES = {
  sneaker: { sizeMeters: SHOE_LENGTH_METERS, autoYaw: true },
  cleat: { sizeMeters: SHOE_LENGTH_METERS, autoYaw: true },
  ball: { sizeMeters: 0.22, autoYaw: false },
  apparel: { sizeMeters: 0.7, sizeAxis: 'y', autoYaw: false, garment: true },
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
// - category: 'sneaker' (por defecto), 'cleat' o 'ball' (ver CATEGORIES). Los
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
// - size (ropa): { axis: 'x' | 'y', meters } medida real que fija la escala,
//   en vez de la de su categoría.
// - parts (ropa): { remove, keep } listas de nombres (texto exacto o
//   expresión regular) de nodo, malla o material. remove quita piezas que no
//   son la prenda (piso, maniquí, percha, rótulos); keep separa un conjunto en
//   productos (cada slug conserva su prenda del mismo archivo).
// - edits (ropa): cambios propios del modelo, en inglés, para los créditos
//   (por ejemplo 'removed the shorts').
// - texturePatches (ropa): retoques de textura antes de optimizar (tapar un
//   "YOUR LOGO" o el parche del autor). Ver scripts/models/textures.mjs.
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
    slug: 'nike-air-max-270',
    displayName: 'Nike Air Max 270',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: 'ea75ce07668f4cf296eff3604fab5363' },
    foot: 'left',
    // El original trae la punta hacia -X. Sus materiales usaban especular/brillo
    // (ver metalRough en optimize.mjs); sin convertirlos se veía blanco.
    transform: { rotation: [0, 180, 0] },
  },
  {
    slug: 'nike-air-max-pre-day',
    displayName: 'Nike Air Max Pre-Day',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: '753c08b324d94f4f86e9d33f5016d6d1' },
    foot: 'right',
    // El original trae la punta hacia +Z.
    transform: { rotation: [0, 90, 0] },
    // Escaneo de fotogrametría de 4,1 millones de triángulos con el atlas
    // partido en miles de islas: sin cruzar costuras de UV el lite no baja de
    // la meta (como el Dunk High Hawaii).
    simplifyAcrossSeams: ['lite'],
    // Por las mismas islas cada triángulo trae vértices propios: con 90k el
    // hero pesaba 1,31 MB. Pide 60k (sin cruzar costuras en hero; se frena
    // cerca de 69k) y las texturas de datos bajan a calidad 85.
    variantOverrides: { hero: { targetTriangles: 60_000, dataTextureQuality: 85 } },
  },
  {
    slug: 'nike-react-presto',
    displayName: 'Nike React Presto',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: 'c9b878b60d524413becd63dae298b027' },
    foot: 'right',
    // El original es un par (izquierdo en -X, derecho en +X, punta hacia -Z).
    extract: { axis: 'x', side: 'positive' },
    transform: { rotation: [0, -90, 0] },
  },
  {
    slug: 'nike-structure-plus',
    displayName: 'Nike Structure Plus',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: '27623926c4104d698241183d4f5b7f4e' },
    foot: 'right',
    // El original trae la punta hacia -X. Materiales especular/brillo
    // convertidos con metalRough (optimize.mjs).
    transform: { rotation: [0, 180, 0] },
    // Con la simplificación normal aparecían líneas de facetas sobre la
    // capellada blanca (UV y normales deformadas): se cuidan también esos atributos.
    simplifyWithAttributes: true,
  },
  {
    slug: 'nike-quest-running',
    displayName: 'Nike Quest Running',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: '5cd1cb05a4ae432a8c4fb650ab3a8d72' },
    foot: 'left',
    // El original ya trae la punta en +X (unos 7° fuera del eje, lo corrige el
    // ajuste fino).
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'nike-defy-all-day',
    displayName: 'Nike Defy All Day',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: 'b404398cf8ab4773b4b15230a2f7c292' },
    foot: 'left',
    // Escaneo con iluminación incluida (unlit). El original trae la punta hacia +Z.
    transform: { rotation: [0, 90, 0] },
  },
  {
    slug: 'vans-old-skool-blue',
    displayName: 'Vans Old Skool Blue',
    brand: 'Vans',
    source: { provider: 'sketchfab', uid: '96baa4684df7415ba8ba87d39bd1c2ee' },
    foot: 'right',
    // Escaneo. El original trae la punta hacia +Z.
    transform: { rotation: [0, 90, 0] },
  },
  {
    slug: 'vans-rock-haters',
    displayName: 'Vans Rock Haters',
    brand: 'Vans',
    source: { provider: 'sketchfab', uid: '5f1b57feaaff4078ae54dc630a65547d' },
    foot: 'right',
    // El original es un par tirado en diagonal: uno de pie, inclinado, y el
    // otro de costado. Un plano diagonal en XZ los separa y se conserva el
    // derecho. La rotación sale de su eje largo y del plano de la suela
    // (ángulos de Euler XYZ), más 5° en Z para bajar el talón: sin ellos
    // apoyaba la punta y el talón flotaba 22 mm.
    extract: { normal: [0.715, 0, 0.699], offset: 0.085, side: 'positive' },
    transform: { rotation: [52.5, 34.8, -53.2] },
  },
  {
    slug: 'adidas-lightstrike',
    displayName: 'Adidas Lightstrike',
    brand: 'Adidas',
    source: { provider: 'sketchfab', uid: '38df3a4bdbee4118af332498884c947d' },
    foot: 'right',
    // Escaneo. El original ya trae la punta en +X.
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'adidas-retro-court',
    displayName: 'Adidas Retro Court',
    brand: 'Adidas',
    source: { provider: 'sketchfab', uid: '179aa5a7845a4625821a8c7afb0d0979' },
    foot: 'left',
    // Escaneo de unas Gazelle bordó y lila (el costado dice GAZELLE).
    // El original trae la punta hacia -Z, unos 24° hacia +X (lo corrige el
    // ajuste fino).
    transform: { rotation: [0, -90, 0] },
  },
  {
    slug: 'adidas-orange-running',
    displayName: 'Adidas Orange Running',
    brand: 'Adidas',
    source: { provider: 'sketchfab', uid: 'e10ac3f9959146d8b0094aff82ce5f65' },
    foot: 'right',
    // El original es un par algo en diagonal: el plano que los separa está
    // girado unos 8° respecto del eje X. Se conserva el derecho (punta a -Z).
    // Los materiales usaban especular/brillo (ver metalRough en optimize.mjs).
    extract: { normal: [0.99, 0, -0.139], offset: 0.0082, side: 'positive' },
    transform: { rotation: [0, -90, 0] },
  },
  {
    slug: 'adidas-football-boot',
    displayName: 'Adidas Football Boot',
    brand: 'Adidas',
    category: 'cleat',
    source: { provider: 'sketchfab', uid: '17f21b0a2515455f96ad194ad5be9142' },
    foot: 'left',
    // Botín con tapones (escaneo). El original trae la punta hacia -X, unos 18°
    // fuera del eje. La punta de los tapones queda en y = 0.
    transform: { rotation: [0, 180, 0] },
  },
  {
    slug: 'on-cloud',
    displayName: 'On Cloud',
    brand: 'On',
    source: { provider: 'sketchfab', uid: '3b6483658c5b4eb2a945a40bff243eda' },
    foot: 'right',
    // El original está en diagonal: la punta mira entre -X y -Z, a unos 122°
    // de +X según su eje largo.
    transform: { rotation: [0, -122, 0] },
  },
  {
    slug: 'hoka-mach-5',
    displayName: 'Hoka Mach 5',
    brand: 'Hoka',
    source: { provider: 'sketchfab', uid: '15af8c871de64a1a8350c38ff0a91a6c' },
    foot: 'left',
    // Escaneo. El original ya trae la punta en +X.
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'converse-chuck-taylor',
    displayName: 'Converse Chuck Taylor All Star',
    brand: 'Converse',
    source: { provider: 'sketchfab', uid: 'bc791439d26f4dd9974819c168e12385' },
    foot: 'right',
    // Escaneo con iluminación incluida (unlit). El original trae la punta hacia -X.
    transform: { rotation: [0, 180, 0] },
  },
  {
    slug: 'salomon-xt-6',
    displayName: 'Salomon XT-6',
    brand: 'Salomon',
    source: { provider: 'sketchfab', uid: '717a18bd58544842afbabc81523cda77' },
    foot: 'left',
    // Escaneo de fotogrametría (unlit). El original trae la punta hacia +Z.
    transform: { rotation: [0, 90, 0] },
  },
  {
    slug: 'dior-b30',
    displayName: 'Dior B30',
    brand: 'Dior',
    source: { provider: 'sketchfab', uid: 'c5ac5910a4694734b64da1473001c1dc' },
    foot: 'right',
    // El original ya trae la punta en +X.
    transform: { rotation: [0, 0, 0] },
    // Modelo de diseño de prendas con 13 materiales y 30 texturas: los mapas de
    // normales de tela y cuero (patrones finos) pesaban 1,2 MB a 1024 px y la
    // geometría (13 mallas con tangentes) otros 0,8 MB. En hero las normales
    // bajan a 256 px, rugosidad/oclusión a 512 y la especular a 256; el color
    // conserva 1024 y el hero baja a 50k triángulos. En lite, normales a 128,
    // datos a 256 y 14k triángulos.
    variantOverrides: {
      hero: {
        targetTriangles: 50_000,
        dataTextureQuality: 85,
        textureSizeBySlot: { normalTexture: 256, metallicRoughnessTexture: 512, occlusionTexture: 512, specularTexture: 256 },
      },
      lite: {
        targetTriangles: 14_000,
        dataTextureQuality: 85,
        textureSizeBySlot: { normalTexture: 128, metallicRoughnessTexture: 256, occlusionTexture: 256, specularTexture: 128 },
      },
    },
  },
  {
    slug: 'dior-star-platform',
    displayName: 'Dior Star Platform',
    brand: 'Dior',
    source: { provider: 'sketchfab', uid: '4aaf6674c9114085903ded3bc88fd752' },
    foot: 'right',
    // El original ya trae la punta en +X.
    transform: { rotation: [0, 0, 0] },
    // Las calcomanías (la estrella negra, "CD", el punto y el texto de la
    // suela) están hechas de muchas piezas sueltas pequeñas, a décimas de
    // milímetro sobre el cuero. En lite, la limpieza de piezas diminutas y la
    // simplificación les quitaban trozos: no se simplifican (1,9k triángulos en
    // total) y en lite no se aplica pruneSmallParts (ver variantOverrides).
    // Nota: la estrella es charol negro y, como en el original, refleja el
    // entorno y se ve clara desde algunos ángulos.
    keepMaterials: ['decal1', 'dot_Decal', 'christianDiorSide_Decal', 'footDecal', 'sideDecal'],
    // 17 materiales y 40 texturas: los mapas de normales de suela, plantilla y
    // cuero pesaban 2,5 MB, y las UV en mosaico (fuera de [0, 1]) no se
    // cuantizan, así que la geometría pesa el doble por vértice. En hero las
    // normales y los datos bajan a 256 px, la plantilla (shoeFloor, casi no se
    // ve) a 256, la plantilla estampada (footDecal) a 512 y el hero a 35k
    // triángulos; el color de la capellada conserva 1024. En lite, normales y
    // datos a 128 y 9k triángulos.
    variantOverrides: {
      hero: {
        targetTriangles: 35_000,
        dataTextureQuality: 85,
        textureSizeBySlot: { normalTexture: 256, metallicRoughnessTexture: 256, occlusionTexture: 256, specularTexture: 256 },
        textureSizeByMaterial: { shoeFloor: 256, footDecal: 512 },
      },
      lite: {
        targetTriangles: 9_000,
        pruneSmallParts: 0,
        dataTextureQuality: 85,
        textureSizeBySlot: { normalTexture: 128, metallicRoughnessTexture: 128, occlusionTexture: 128, specularTexture: 128 },
      },
    },
  },
  {
    slug: 'new-balance-fresh-foam-roav',
    displayName: 'New Balance Fresh Foam Roav',
    brand: 'New Balance',
    source: { provider: 'sketchfab', uid: 'd47f890dfff24d2d9cb3aeadd9c183e5' },
    foot: 'right',
    // Escaneo. El original trae la punta hacia +Z.
    transform: { rotation: [0, 90, 0] },
    // Escaneo con el atlas partido en islas: la geometría pesa más que las
    // texturas. Con 90k triángulos el hero pesaba 1,29 MB; baja a 75k y las
    // texturas de datos a calidad 85.
    variantOverrides: { hero: { targetTriangles: 75_000, dataTextureQuality: 85 } },
  },
  {
    slug: 'adidas-ozelia',
    displayName: 'Adidas Ozelia',
    brand: 'Adidas',
    source: { provider: 'sketchfab', uid: 'bd99ae674f724ca690198f22764081f8' },
    foot: 'right',
    // Exportado de una herramienta de diseño de prendas. El original ya trae
    // la punta en +X.
    transform: { rotation: [0, 0, 0] },
    // 440k triángulos con normales horneadas: la simplificación normal solo mira
    // posiciones y en lite deformaba normales y UV (facetas con reflejos falsos).
    simplifyWithAttributes: true,
    // Casi cada triángulo trae vértices propios (costuras de UV por todos
    // lados): la geometría pesaba 1 MB con 90k triángulos. El hero pide 45k
    // pero se frena cerca de 65k contra las costuras, así que normales y
    // rugosidad/oclusión bajan a 512 px; el color conserva 1024. El lite se
    // frena cerca de 38k (cruzar las costuras rompía la textura): ahí normales
    // y datos bajan a 256 px para caber.
    variantOverrides: {
      hero: {
        targetTriangles: 45_000,
        dataTextureQuality: 85,
        textureSizeBySlot: { normalTexture: 512, metallicRoughnessTexture: 512, occlusionTexture: 512 },
      },
      lite: { dataTextureQuality: 85, textureSizeBySlot: { normalTexture: 256, metallicRoughnessTexture: 256, occlusionTexture: 256 } },
    },
  },
  {
    slug: 'air-jordan-1-low-dior',
    displayName: 'Air Jordan 1 Low Dior',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: 'cc4e34d5480b4eea80da16cfc2b95acf' },
    foot: 'left',
    // El original es un par en diagonal (los dos de pie): un plano diagonal en
    // XZ los separa. Se conserva el izquierdo, que está apoyado en el piso (el
    // derecho está montado sobre él, inclinado unos 38°). Su punta mira a -X
    // y estaba unos 11° fuera del eje; estos ángulos equivalen a girar 180° y
    // 11° en Y y luego bajar el talón 1,5° en Z (flotaba 7 mm).
    // La suela azul hielo es solo textura (sin transmisión ni transparencia).
    extract: { normal: [-0.146, 0, 0.989], offset: -0.0579, side: 'positive' },
    transform: { rotation: [179.7, -11, 178.5] },
  },
  {
    slug: 'jordan-4-black-cat',
    displayName: 'Jordan 4 Retro Black Cat',
    brand: 'Nike',
    source: { provider: 'sketchfab', uid: '74daa127306f4eb5bd6411042c75a287' },
    foot: 'left',
    transform: { rotation: [0, 90, 0] },
    // El original trae la punta hacia +Z. Con 90k triángulos la geometría
    // pesaba 1 MB y el hero 1,33 MB: baja a 60k y las texturas de datos a
    // calidad 85.
    variantOverrides: { hero: { targetTriangles: 60_000, dataTextureQuality: 85 } },
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

  // Ropa y accesorios (paso 4). Pose canónica de prendas: ver CATEGORIES.apparel.
  {
    slug: 'camiseta-futbol-roja',
    displayName: 'Camiseta de fútbol roja',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '72b85d298e804cf68faca548b5c86905' },
    // Exportada de CLO sobre un maniquí invisible; el frente ya mira a +Z.
    // Exportada de un programa de diseño de prendas (CLO): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'camiseta-futbol-naranja',
    displayName: 'Camiseta de fútbol naranja',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'd00dffa54c5b49b2941e0a34995f914e' },
    // Misma malla que la camiseta roja (otra textura). El frente ya mira a +Z.
    // Exportada de un programa de diseño de prendas (CLO): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'kit-futbol-gris-geff',
    displayName: 'Kit de fútbol gris GEFF',
    brand: 'GEFF',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '72c88cf8edad46b7905499745e01b3fe' },
    // El original trae camiseta y short, más el rótulo "A KOREAN" bajo el
    // short (material LETRAS_COLLECTION). Se vende solo la camiseta: se quita el
    // rótulo y el short se separa por pieza conexa: la camiseta cubre la
    // pretina del short (y 49 a 54 cm) y su ruedo baja a 31 cm, así que se
    // conserva cada pieza que sube por encima de 60 cm (las del short no pasan
    // de 54).
    parts: { remove: ['LETRAS_COLLECTION'] },
    extract: { normal: [0, 1, 0], offset: 60, side: 'positive', byComponent: 'max' },
    transform: { rotation: [0, 0, 0] },
    edits: ['removed the caption text and the shorts'],
  },
  {
    slug: 'camiseta-blanca-geff',
    displayName: 'Camiseta blanca GEFF',
    brand: 'GEFF',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '1c04cc0acd734feea29b2b0cd1cf8214' },
    // Exportada de un programa de diseño de prendas (CLO): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'camiseta-run-turquesa',
    displayName: 'Camiseta running turquesa',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '4d055bb8c1e04549a4b2dac7b27ebb2c' },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'polo-rayas',
    displayName: 'Polo a rayas',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '7c8a4dede482474fa5a74f24c6fc5e81' },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'top-deportivo-blanco-geff',
    displayName: 'Top deportivo blanco GEFF',
    brand: 'GEFF',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '6621ae8c44e6462ebb47959e73d6569e' },
    // Top corto: la escala sale de su alto real (CLO, en milímetros), no de la
    // medida de una camiseta.
    size: { axis: 'y', meters: 0.31 },
    // Exportada de un programa de diseño de prendas (CLO): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'conjunto-deportivo-mujer',
    displayName: 'Top deportivo de mujer',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'a9022683c61a4db7bdc24d8afc7671c5' },
    // El modelo "Women Sportswear" trae top y leggings: este producto es el
    // top (materiales Tri-Planar_1). Los leggings salen del mismo archivo
    // (leggings-deportivos-mujer). Alto real del top corto, como en el original.
    parts: { keep: [/Tri-Planar_1/] },
    size: { axis: 'y', meters: 0.38 },
    // El frente mira a -X en el original.
    transform: { rotation: [0, 90, 0] },
    // El top es de la marca de la tienda, pero la textura traía un swoosh de
    // Nike: se tapa copiando la tela de al lado o, junto al borde de la isla
    // de UV (donde al lado no hay tela), con el rosa de la tela.
    texturePatches: [
      { material: 'Plain_Purple_Texture_2768328_-_Tri-Planar_1_5', rects: [[0.18, 0.87, 0.285, 1]], copyFrom: [-0.12, 0] },
      { material: 'Plain_Purple_Texture_2768328_-_Tri-Planar_1_9', rects: [[0.38, 0.86, 0.46, 1]], fill: [140, 85, 114] },
    ],
    edits: ['kept the top of the original set', 'removed the Nike logo from the texture'],
    // Los materiales del top traen transmisión (KHR_materials_transmission),
    // que en tela no aporta y cuesta una pasada de render extra: se quita
    // también en hero.
    variantOverrides: { hero: { dropTransmission: true } },
  },
  {
    slug: 'leggings-deportivos-mujer',
    displayName: 'Leggings deportivos de mujer',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'a9022683c61a4db7bdc24d8afc7671c5' },
    // Los leggings del modelo "Women Sportswear" (materiales Tri-Planar_3).
    parts: { keep: [/Tri-Planar_3/] },
    size: { axis: 'y', meters: 0.91 },
    // El frente mira a -X en el original.
    transform: { rotation: [0, 90, 0] },
    // Swoosh de Nike en la cadera: se tapa copiando la tela de abajo.
    texturePatches: [
      { material: 'Plain_Purple_Texture_2768328_-_Tri-Planar_3_0', rects: [[0.09, 0.4, 0.72, 0.68]], copyFrom: [0, 0.27] },
    ],
    edits: ['kept the leggings of the original set', 'removed the Nike logo from the texture'],
  },
  {
    slug: 'jersey-basquet-llamas',
    displayName: 'Jersey de básquet llamas',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'd353042ccf20414d85dd3fd87bba43d5' },
    // El original trae jersey (front002) y short (Box008): se vende solo el
    // jersey. La plantilla decía "YOUR LOGO" bajo el número del frente: se
    // pinta encima con el rojo que lo rodea, en el color y también en la
    // textura de rugosidad/metal (el texto estaba grabado ahí y se seguía
    // leyendo como un brillo distinto).
    parts: { keep: ['front002', 'front002_1'] },
    texturePatches: [
      { material: 'Ceramic__3', rects: [[0.266, 0.358, 0.422, 0.416]], fill: 'surround' },
      { material: 'Ceramic__3', slot: 'metallicRoughnessTexture', rects: [[0.266, 0.358, 0.422, 0.416]], fill: 'surround' },
    ],
    transform: { rotation: [0, 0, 0] },
    edits: ['removed the shorts', 'painted over the "YOUR LOGO" placeholder text'],
  },
  {
    slug: 'sudadera-nike-club-fleece',
    displayName: 'Sudadera Nike Club Fleece',
    brand: 'Nike',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'bc387203ef184f2dbd25b236945857c5' },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'anorak-gris',
    displayName: 'Anorak gris',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'f72f208b242a415c84d0087a790faa5f' },
    // Piloto del avatar. El original trae el conjunto puesto sobre un cuerpo
    // (MetaHuman, con esqueleto) dos veces: de frente y girado. Se hornea la pose
    // y se conserva la sudadera de la copia de frente (Object_350). Conserva su
    // escala real de MetaHuman (0.59 m del cuello al ruedo) para el ajuste.
    parts: { keep: ['Object_350'] },
    size: { axis: 'y', meters: 0.589 },
    transform: { rotation: [0, 0, 0] },
    edits: ['kept the sweatshirt of the original set'],
  },
  {
    slug: 'sudadera-basica-bicolor',
    displayName: 'Sudadera básica bicolor',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '92800a4c11ce4b8daccb75e60035535f' },
    // Las texturas de datos (normales, rugosidad/metal) pesaban casi todo el
    // hero (1,11 MB con el color en calidad 64): bajan a calidad 85.
    variantOverrides: { hero: { dataTextureQuality: 85 } },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'sudadera-zip-crema',
    displayName: 'Sudadera con zíper crema',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '2dfa849756dc45f2bf6c6b2d8100905a' },
    // El autor estampó su logo (LIVIN COOL con un globo) en el pecho y en la
    // espalda: se tapan en la textura con el crema de la tela que los rodea.
    size: { axis: 'y', meters: 0.72 },
    texturePatches: [
      { material: 'WORLD_ZIP_HOODIE', rects: [[0.05, 0.74, 0.226, 0.905], [0.742, 0.912, 0.792, 0.962]], fill: 'surround' },
      // El estampado también estaba en relieve en el mapa de normales.
      {
        material: 'WORLD_ZIP_HOODIE',
        slot: 'normalTexture',
        rects: [[0.05, 0.74, 0.226, 0.905], [0.742, 0.912, 0.792, 0.962]],
        fill: 'surround',
      },
    ],
    // Exportada de un programa de diseño de prendas (CLO): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    transform: { rotation: [0, 0, 0] },
    edits: ["removed the author's logo prints from the texture"],
  },
  {
    slug: 'hoodie-corto-rosa',
    displayName: 'Hoodie corto rosa',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'fd03f442026f4252b2507dda53bba564' },
    // Hoodie corto (Style3D, en milímetros): las mangas cuelgan por debajo del
    // ruedo, así que la escala sale de su alto real completo (capucha a puños).
    size: { axis: 'y', meters: 0.715 },
    // Exportada de un programa de diseño de prendas (Style3D): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'hoodie-nike-turquesa-mujer',
    displayName: 'Hoodie Nike turquesa de mujer',
    brand: 'Nike',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '132697d70644446aab83c6fb41040076' },
    // El original trae dos copias (de frente y de espalda): se conserva la de
    // frente (z > -0.3), por pieza conexa.
    extract: { normal: [0, 0, 1], offset: -0.3, side: 'positive', byComponent: true },
    size: { axis: 'y', meters: 0.72 },
    // Exportada de un programa de diseño de prendas (CLO): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'chaqueta-adidas-negra',
    displayName: 'Chaqueta Adidas negra',
    brand: 'Adidas',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '2f69634f33ee4173beba410a673da22c' },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'chaqueta-acolchada-roja',
    displayName: 'Chaqueta acolchada roja',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '7d95660645834760a0a638775e5fe4a7' },
    // Exportada de un programa de diseño de prendas (Marvelous Designer): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'chaqueta-varsity',
    displayName: 'Chaqueta varsity',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '40ee5970950b48b4a38d657dc671f007' },
    // Exportada de CLO con materiales especular/brillo (sin convertir se ve
    // blanca). La textura traía el logo "3DEE" del autor en el frente: se tapa
    // con el azul marino del panel.
    texturePatches: [{ material: 'FABRIC_1_FRONT_3990', rects: [[0.335, 0.815, 0.45, 0.878]], fill: 'surround' }],
    // Exportada de un programa de diseño de prendas (CLO): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    transform: { rotation: [0, 0, 0] },
    edits: ["removed the author's logo from the texture"],
  },
  {
    slug: 'pants-mujer-franjas-lima',
    displayName: 'Pants de mujer con franjas lima',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '2c2bd2f956df4db29ecfe93d250ad31e' },
    // El original trae dos copias (de frente y de espalda): se conserva una.
    parts: { keep: ['defaultPolygonShader'] },
    size: { axis: 'y', meters: 1.0 },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'pants-anorak-gris',
    displayName: 'Pants anorak gris',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'f72f208b242a415c84d0087a790faa5f' },
    // Los pantalones del mismo archivo que anorak-gris (Object_348, la copia
    // de frente), con su escala real de MetaHuman.
    parts: { keep: ['Object_348'] },
    size: { axis: 'y', meters: 0.948 },
    transform: { rotation: [0, 0, 0] },
    edits: ['kept the pants of the original set'],
  },
  {
    slug: 'jogger-gris',
    displayName: 'Jogger gris',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '8939b47916ab4b2486a3fa2613eac54c' },
    size: { axis: 'y', meters: 1.0 },
    // Exportada de un programa de diseño de prendas (CLO): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'pants-buzo-marino-geff',
    displayName: 'Pants de buzo marino GEFF',
    brand: 'GEFF',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'd5462d7e184d418890d3ddfdd8e93edc' },
    size: { axis: 'y', meters: 1.0 },
    // Exportada de un programa de diseño de prendas (CLO): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'short-geff-blanco',
    displayName: 'Short GEFF blanco',
    brand: 'GEFF',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '2f568dba2f1343e89f278860618cd3ed' },
    // Short GEFF (CLO, tamaño real): 0.45 m de la pretina al ruedo.
    size: { axis: 'y', meters: 0.45 },
    // Exportada de un programa de diseño de prendas (CLO): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    // El frente (con el logo GEFF en la pierna) mira a -Z en el original.
    transform: { rotation: [0, 180, 0] },
  },
  {
    slug: 'short-geff-negro-naranja',
    displayName: 'Short GEFF negro y naranja',
    brand: 'GEFF',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'c2695299194c4771b984c75d4175fb9d' },
    // Misma malla que el short GEFF blanco.
    size: { axis: 'y', meters: 0.45 },
    // Exportada de un programa de diseño de prendas (CLO): paneles en capas
    // a cerca de 1 mm. Con el error del lite (3%) la simplificación deformaba
    // ruedos y costuras; con 0,5% las capas no se cruzan.
    maxSimplifyError: 0.005,
    // El frente (con el logo GEFF en la pierna) mira a -Z en el original.
    transform: { rotation: [0, 180, 0] },
  },
  {
    slug: 'short-deportivo-coral',
    displayName: 'Short deportivo coral',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '9f872504291644d8b05c0b85702d019e' },
    size: { axis: 'y', meters: 0.5 },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'gorra-ny-marino',
    displayName: 'Gorra NY marino',
    brand: 'New York Yankees',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '455523a744a84087b584f6a0cd8ec357' },
    // Piloto del avatar. La visera del original apunta a +X: se gira para que
    // mire a +Z. Escala por el ancho real de la copa (0.20 m de lado a lado).
    size: { axis: 'x', meters: 0.2 },
    transform: { rotation: [0, -90, 0] },
  },
  {
    slug: 'gorra-gris-flexfit',
    displayName: 'Gorra gris Flexfit',
    brand: 'Flexfit',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '3a131a461d01447d866c7ab119d1707b' },
    size: { axis: 'x', meters: 0.2 },
    transform: { rotation: [0, 0, 0] },
    // 336k triángulos en 56 piezas: en lite, la limpieza de piezas diminutas y
    // la simplificación abrían huecos en la correa de atrás y facetaban la
    // copa. El lite no quita piezas, se simplifica cuidando normales y UV y
    // admite 35k triángulos (dentro del techo de 40k).
    simplifyWithAttributes: true,
    variantOverrides: { lite: { targetTriangles: 35_000, pruneSmallParts: 0 } },
  },
  {
    slug: 'gorro-gris-canale',
    displayName: 'Gorro gris de canalé',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'ff6dc83c818c4e2aa722cb89e6ada577' },
    size: { axis: 'x', meters: 0.2 },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'lentes-sol-negros',
    displayName: 'Lentes de sol negros',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'd0d86024a30f49b7937b932f6f993f92' },
    // Piloto del avatar. El original trae dos pares: uno carey (x < -3.9) y el
    // negro (x > -1.9). Se conserva el negro, cuyo frente mira a +X: se gira
    // para que mire a +Z. Ancho real del frente: 0.14 m.
    extract: { normal: [1, 0, 0], offset: -2.9, side: 'positive' },
    size: { axis: 'x', meters: 0.14 },
    transform: { rotation: [0, -90, 0] },
    edits: ['kept the black pair of the original two'],
  },
  {
    slug: 'lentes-deportivos-espejo',
    displayName: 'Lentes deportivos espejo',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '1a29942363754f798ac2dd9e61d857fc' },
    // Lentes envolventes: ancho real del frente, 0.15 m.
    size: { axis: 'x', meters: 0.15 },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'maleta-deportiva-blanca',
    displayName: 'Maleta deportiva blanca',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '4f3da061584a4c51be8cb4a54b7586a2' },
    size: { axis: 'x', meters: 0.6 },
    transform: { rotation: [0, 0, 0] },
  },
  {
    slug: 'mochila-negra',
    displayName: 'Mochila negra',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: '524d7fc724094ead9f203ed06bae76e1' },
    size: { axis: 'y', meters: 0.45 },
    // Los bolsillos del frente miran a -Z en el original.
    transform: { rotation: [0, 180, 0] },
  },
  {
    slug: 'reloj-inteligente-negro',
    displayName: 'Reloj inteligente negro',
    brand: 'AIRSPACE',
    category: 'apparel',
    source: { provider: 'sketchfab', uid: 'c896964ab7274bff810ac5ae9165cf8c' },
    // La escala sale del ancho de la caja (4.5 cm); la correa queda cerrada
    // como en la muñeca. El original trae una animación que no se usa.
    size: { axis: 'x', meters: 0.045 },
    transform: { rotation: [0, 0, 0] },
  },
];
