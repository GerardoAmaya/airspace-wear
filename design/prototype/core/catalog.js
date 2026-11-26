// Catálogo de muestra del prototipo. En el sitio real estos datos vienen de
// la base de datos, con nombre y descripción por idioma. Precios y datos
// técnicos son ilustrativos.
//
// Nombres de campo heredados del concepto de aeropuerto (se conservan para no
// romper las secciones), pero los textos visibles son de tienda:
// - flight: referencia del modelo (se muestra como "Ref. AS-001").
// - gate: ya no se muestra; en su lugar van las tallas (sizes).
// - status: disponibilidad (ver FLIGHT_STATUS / AVAILABILITY).

export const CATALOG = [
  {
    slug: 'air-jordan-1',
    name: 'Air Jordan 1',
    brand: 'Nike',
    colorway: 'Negro y vela',
    price: 180,
    sizes: 'EU 38-47',
    flight: 'AS-001',
    gate: 'A1',
    status: 'boarding',
    foot: 'right',
    tagline: 'El clásico de bota alta que cambió las canchas y las calles.',
    specs: { weightGrams: 450, stackMm: 32, upper: 'Cuero', sole: 'Goma' },
    tags: ['clásico', 'bota alta', 'icónico'],
  },
  {
    slug: 'new-balance-997',
    name: 'New Balance 997',
    brand: 'New Balance',
    colorway: 'Gris y naranja',
    price: 200,
    sizes: 'EU 39-46',
    flight: 'AS-997',
    gate: 'B4',
    status: 'on-time',
    foot: 'right',
    tagline: 'Comodidad de corredor con ADN de los 90 para todo el día.',
    specs: { weightGrams: 380, stackMm: 30, upper: 'Gamuza y malla', sole: 'ENCAP' },
    tags: ['comodidad', 'retro', 'diario'],
  },
  {
    slug: 'nike-air-uptempo',
    name: 'Nike Air Uptempo',
    brand: 'Nike',
    colorway: 'Negro y blanco',
    price: 190,
    sizes: 'EU 40-47',
    flight: 'AS-096',
    gate: 'D7',
    status: 'on-time',
    foot: 'left',
    tagline: 'Letras AIR gigantes y amortiguación visible para destacar.',
    specs: { weightGrams: 520, stackMm: 38, upper: 'Cuero', sole: 'Air de longitud completa' },
    tags: ['llamativo', 'básquet', 'amortiguación'],
  },
  {
    slug: 'adidas-samba',
    name: 'Adidas Samba',
    brand: 'Adidas',
    colorway: 'Negro y blanco',
    price: 100,
    sizes: 'EU 36-46',
    flight: 'AS-050',
    gate: 'E5',
    status: 'boarding',
    foot: 'left',
    tagline: 'Perfil bajo, tres franjas y suela de goma: elegancia de terraza.',
    specs: { weightGrams: 340, stackMm: 22, upper: 'Cuero y gamuza', sole: 'Goma natural' },
    tags: ['perfil bajo', 'minimalista', 'tendencia'],
  },
  {
    slug: 'adidas-sambae',
    name: 'Adidas Sambae',
    brand: 'Adidas',
    colorway: 'Blanco, verde y goma',
    price: 110,
    sizes: 'EU 36-42',
    flight: 'AS-055',
    gate: 'E7',
    status: 'final-call',
    foot: 'right',
    tagline: 'La Samba sube a plataforma: cuero blanco, franjas verdes y goma translúcida.',
    specs: { weightGrams: 410, stackMm: 36, upper: 'Cuero', sole: 'Goma translúcida' },
    tags: ['plataforma', 'tendencia', 'clásico renovado'],
  },
  {
    slug: 'adidas-prophere',
    name: 'Adidas Prophere',
    brand: 'Adidas',
    colorway: 'Negro, naranja y camuflaje',
    price: 120,
    sizes: 'EU 38-46',
    flight: 'AS-212',
    gate: 'F6',
    status: 'on-time',
    foot: 'right',
    tagline: 'Suela robusta y parte superior de punto: volumen que no pasa desapercibido.',
    specs: { weightGrams: 430, stackMm: 40, upper: 'Malla de punto', sole: 'EVA texturizada' },
    tags: ['suela gruesa', 'urbano', 'llamativo'],
  },
  {
    slug: 'adidas-gazelle',
    name: 'Adidas Gazelle',
    brand: 'Adidas',
    colorway: 'Verde y blanco',
    price: 100,
    sizes: 'EU 36-46',
    flight: 'AS-066',
    gate: 'E2',
    status: 'on-time',
    foot: 'left',
    tagline: 'Gamuza verde y tres franjas blancas: el clásico de 1966 que nunca se fue.',
    specs: { weightGrams: 350, stackMm: 22, upper: 'Gamuza', sole: 'Goma' },
    tags: ['clásico', 'gamuza', 'perfil bajo'],
  },
  {
    slug: 'adidas-basketball',
    name: 'Adidas Basketball',
    brand: 'Adidas',
    colorway: 'Rosa, morado y blanco',
    price: 130,
    sizes: 'EU 39-48',
    flight: 'AS-330',
    gate: 'H1',
    status: 'boarding',
    foot: 'left',
    tagline: 'Bota de básquet con soporte alto y colores que se ven desde la tribuna.',
    specs: { weightGrams: 480, stackMm: 34, upper: 'Sintético y malla', sole: 'Goma de alta tracción' },
    tags: ['básquet', 'bota alta', 'color'],
  },
  {
    slug: 'air-jordan-1-mid-particle-beige',
    name: 'Air Jordan 1 Mid',
    brand: 'Nike',
    colorway: 'Beige, mostaza y negro',
    price: 155,
    sizes: 'EU 36-46',
    flight: 'AS-011',
    gate: 'A2',
    status: 'boarding',
    foot: 'right',
    tagline: 'La silueta del Jordan 1 en caña media, con gamuza y tonos tierra.',
    specs: { weightGrams: 420, stackMm: 30, upper: 'Gamuza y cuero', sole: 'Goma' },
    tags: ['caña media', 'tonos tierra', 'gamuza'],
  },
  {
    slug: 'jordan-4-university-blue',
    name: 'Jordan 4 Retro University Blue',
    brand: 'Nike',
    colorway: 'Azul, gris y negro',
    price: 210,
    sizes: 'EU 38-47',
    flight: 'AS-404',
    gate: 'A4',
    status: 'final-call',
    foot: 'right',
    tagline: 'Gamuza azul, malla a la vista y detalles en gris moteado.',
    specs: { weightGrams: 530, stackMm: 34, upper: 'Gamuza y malla', sole: 'Goma con Air visible' },
    tags: ['básquet', 'gamuza', 'retro'],
  },
  {
    slug: 'nike-pegasus-36',
    name: 'Nike Air Zoom Pegasus 36',
    brand: 'Nike',
    colorway: 'Gris jaspeado y blanco',
    price: 130,
    sizes: 'EU 38-47',
    flight: 'AS-036',
    gate: 'D3',
    status: 'on-time',
    foot: 'right',
    tagline: 'Para correr todos los días: ligero, amortiguado y con estampado jaspeado.',
    specs: { weightGrams: 280, stackMm: 28, upper: 'Malla técnica', sole: 'Espuma con Zoom Air' },
    tags: ['running', 'ligero', 'amortiguación'],
  },
  {
    slug: 'jordan-4-travis-scott',
    name: 'Jordan 4 Retro Travis Scott',
    brand: 'Nike',
    colorway: 'Lila, morado y negro',
    price: 450,
    sizes: 'EU 40-46',
    flight: 'AS-415',
    gate: 'A5',
    status: 'final-call',
    foot: 'left',
    tagline: 'Gamuza lila con salpicado negro: el Jordan 4 en su versión más llamativa.',
    specs: { weightGrams: 540, stackMm: 34, upper: 'Gamuza y malla', sole: 'Goma' },
    tags: ['edición especial', 'gamuza', 'llamativo'],
  },
  {
    slug: 'nike-dunk-high-hawaii',
    name: 'Nike Dunk High Hawaii',
    brand: 'Nike',
    colorway: 'Azul con estampado floral',
    price: 165,
    sizes: 'EU 38-46',
    flight: 'AS-085',
    gate: 'D5',
    status: 'on-time',
    foot: 'left',
    tagline: 'Caña alta con estampado de flores hawaianas de punta a talón.',
    specs: { weightGrams: 480, stackMm: 30, upper: 'Lona estampada', sole: 'Goma' },
    tags: ['caña alta', 'estampado', 'verano'],
  },
];

// Vitrina: los favoritos del dueño van primero, en este orden; el resto
// conserva su orden. El sitio real usa la misma lista (apps/api/prisma/seed/catalog.ts).
export const FEATURED = ['jordan-4-travis-scott', 'nike-dunk-high-hawaii', 'adidas-prophere', 'adidas-gazelle', 'nike-air-uptempo', 'jordan-4-university-blue'];
const featuredRank = (slug) => (FEATURED.includes(slug) ? FEATURED.indexOf(slug) : FEATURED.length);
CATALOG.sort((a, b) => featuredRank(a.slug) - featuredRank(b.slug));

// Balones (categoría "ball"). Cada uno lleva el código de la ciudad donde se
// jugó la final de su Mundial, como una etiqueta de equipaje.
export const BALLS = [
  {
    slug: 'adidas-trionda-2026',
    name: 'Adidas Trionda',
    brand: 'Adidas',
    edition: 'Mundial Norteamérica 2026',
    tag: { code: 'USA', city: 'Nueva Jersey', year: 2026 },
    price: 170,
    tagline: 'El balón del Mundial de Estados Unidos, México y Canadá, en su edición dorada para la final.',
    specs: { panels: 4, size: 'Talla 5', finish: 'Termosellado' },
  },
  {
    slug: 'adidas-al-rihla-2022',
    name: 'Adidas Al Rihla',
    brand: 'Adidas',
    edition: 'Mundial Catar 2022',
    tag: { code: 'QAT', city: 'Lusail', year: 2022 },
    price: 160,
    tagline: 'Colores vivos inspirados en Catar y un nombre que significa "el viaje" en árabe.',
    specs: { panels: 20, size: 'Talla 5', finish: 'Termosellado' },
  },
  {
    slug: 'adidas-jabulani-2010',
    name: 'Adidas Jabulani',
    brand: 'Adidas',
    edition: 'Mundial Sudáfrica 2010',
    tag: { code: 'JNB', city: 'Johannesburgo', year: 2010 },
    price: 140,
    tagline: 'Paneles termosellados y colores de Sudáfrica: el balón más comentado de su época.',
    specs: { panels: 8, size: 'Talla 5', finish: 'Termosellado' },
  },
  {
    slug: 'adidas-teamgeist-2006',
    name: 'Adidas Teamgeist',
    brand: 'Adidas',
    edition: 'Mundial Alemania 2006',
    tag: { code: 'BER', city: 'Berlín', year: 2006 },
    price: 150,
    tagline: 'El balón de la final de 2006, con detalles dorados y su forma de hélice inconfundible.',
    specs: { panels: 14, size: 'Talla 5', finish: 'Barniz brillante' },
  },
  {
    slug: 'adidas-telstar-1970',
    name: 'Adidas Telstar',
    brand: 'Adidas',
    edition: 'Mundial México 1970',
    tag: { code: 'MEX', city: 'Ciudad de México', year: 1970 },
    price: 120,
    tagline: 'El primer balón de Adidas para un Mundial: 32 paneles en blanco y negro pensados para la televisión.',
    specs: { panels: 32, size: 'Talla 5', finish: 'Cuero cosido' },
  },
];

// Disponibilidad de cada par en el catálogo. La clave conserva su nombre
// histórico (status) para no romper las secciones; los textos son de tienda.
export const FLIGHT_STATUS = {
  boarding: { label: 'Nuevo', tone: 'primary' },
  'on-time': { label: 'Disponible', tone: 'muted' },
  'final-call': { label: 'Últimos pares', tone: 'alert' },
};

// Alias con nombre de tienda; usa este en código nuevo.
export const AVAILABILITY = FLIGHT_STATUS;

// Precio en dólares al estilo latinoamericano: "US$180" y "US$1,250".
// Intl con es-419 escribe "USD 180"; se arma desde sus partes para usar el
// símbolo US$ sin espacio, sin concatenar el número a mano.
const priceFormat = new Intl.NumberFormat('es-419', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const formatPrice = (value) =>
  priceFormat
    .formatToParts(value)
    .filter((part, index, parts) => !(part.type === 'literal' && parts[index - 1]?.type === 'currency'))
    .map((part) => (part.type === 'currency' ? 'US$' : part.value))
    .join('');

export const findProduct = (slug) => CATALOG.find((product) => product.slug === slug);

export const findBall = (slug) => BALLS.find((ball) => ball.slug === slug);
