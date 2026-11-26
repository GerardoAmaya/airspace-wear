// Textos y detalles del zapato de la sección "flight".
// En el sitio real estos textos viven en messages/es.json y messages/en.json;
// aquí se agrupan en un solo lugar para que el prototipo sea fácil de revisar.

export const COPY = {
  heroLead: 'Sneakers de las marcas que amas, revisados pieza por pieza antes de llegar a ti.',
  ctaCatalog: 'Explorar catálogo',
  ctaInspect: 'Ver detalles',
  // Pista para bajar: con puntero fino (mouse) o táctil.
  scrollCuePointer: 'Baja para ver los detalles',
  scrollCueTouch: 'Desliza para ver los detalles',
  reference: (code) => `Ref. ${code}`,
  reticleTarget: 'Modelo',
  reticleLock: 'En foco',
  readoutTurn: 'Giro',
  readoutWeight: 'Peso',
  readoutPrice: 'Precio',
  readoutSizes: 'Tallas',
  readoutAvailability: 'Disponibilidad',
  inspectTitle: ['Pieza por pieza'],
  railTitle: 'Detalles',
  railHint: 'Selecciona cada detalle para verlo de cerca',
  progressLabel: 'Progreso',
  specWeight: 'Peso',
  specStack: 'Altura de suela',
  specUpper: 'Parte superior',
  specSole: 'Suela',
  progress: (seen, total) => `${String(seen).padStart(2, '0')} de ${String(total).padStart(2, '0')} detalles vistos`,
  complete: 'Recorrido completo',
  completeTitle: ['Ahora elige', 'el tuyo'],
  ctaFinish: 'Ver catálogo',
  jumpTo: 'Ver detalle',
  gripLabel: 'Gira el zapato: arrastra o usa las flechas',
  gripValue: (turn) => `Giro ${turn}°`,
};

// Puntos de inspección. point: metros en la pose canónica del modelo (suela
// en y = 0, punta hacia +X), verificados con marcadores sobre el render.
// pose: giro relativo (yaw > 0 acerca la punta a la cámara, sin importar el
// pie; bank > 0 inclina el empeine hacia la cámara y bank < 0 muestra la
// suela). camera: zoom respecto del plano de perfil, elev (fracción de la
// distancia), focus (cuánto se acerca el encuadre al punto, de 0 a 1) y
// shift (corre el zapato en pantalla, fracción del ancho, para dejar aire a
// la etiqueta). slot: dónde va la etiqueta en escritorio.
const AIR_JORDAN_1_HOTSPOTS = [
  {
    id: 'swoosh',
    point: [-0.04, 0.055, 0.058],
    title: 'Swoosh de cuero',
    text: 'Cuero superpuesto y cosido a lo largo del lateral.',
    pose: { yaw: 0.12, pitch: 0, bank: 0.06 },
    camera: { zoom: 1.1, elev: 0.04, focus: 0.15, shift: -0.06 },
    slot: { side: 'right', y: 0.47 },
    mobile: { zoom: 1, yaw: 0.1 },
  },
  {
    id: 'toe',
    point: [0.105, 0.05, 0.0],
    title: 'Puntera perforada',
    text: 'Perforaciones que dejan respirar al pie en cada paso.',
    pose: { yaw: 0.9, pitch: -0.03, bank: 0.36, rim: 0.6 },
    camera: { zoom: 1.12, elev: 0.1, focus: 0.3, shift: -0.06 },
    slot: { side: 'right', y: 0.42 },
    mobile: { zoom: 1.05, yaw: 0.8 },
  },
  {
    id: 'collar',
    point: [-0.105, 0.16, 0.025],
    title: 'Cuello acolchado',
    text: 'Espuma alrededor del tobillo que sujeta sin apretar.',
    pose: { yaw: -0.62, pitch: 0, bank: 0.2 },
    camera: { zoom: 1.2, elev: 0.12, focus: 0.3, shift: 0.07 },
    slot: { side: 'left', y: 0.27 },
    mobile: { zoom: 1.05, yaw: -0.55 },
  },
  {
    id: 'sole',
    point: [0.055, 0.0, 0.005],
    title: 'Suela de goma',
    text: 'Goma con círculo de pivote para girar con agarre.',
    pose: { yaw: 0.2, pitch: 0.04, bank: -0.62, rim: 0.2, shadow: 0 },
    camera: { zoom: 1.15, elev: -0.06, focus: 0.25, shift: -0.05 },
    slot: { side: 'right', y: 0.5 },
    mobile: { zoom: 1, yaw: 0.2 },
  },
];

// Puntos del Jordan 4 Travis Scott. Mismo encuadre que los del Air Jordan 1
// (las dos siluetas miden casi lo mismo), con las posiciones verificadas con
// marcadores sobre su propio render.
const JORDAN_4_TRAVIS_HOTSPOTS = [
  {
    id: 'support',
    point: [-0.04, 0.06, -0.058],
    title: 'Soporte lateral',
    text: 'Pieza negra con salpicado de color que sujeta el empeine.',
    pose: { yaw: 0.12, pitch: 0, bank: 0.06 },
    camera: { zoom: 1.1, elev: 0.04, focus: 0.15, shift: -0.06 },
    slot: { side: 'right', y: 0.47 },
    mobile: { zoom: 1, yaw: 0.1 },
  },
  {
    id: 'toe',
    point: [0.105, 0.05, 0.0],
    title: 'Puntera de gamuza',
    text: 'Gamuza lila suave que cubre toda la punta.',
    pose: { yaw: 0.9, pitch: -0.03, bank: 0.36, rim: 0.6 },
    camera: { zoom: 1.12, elev: 0.1, focus: 0.3, shift: -0.06 },
    slot: { side: 'right', y: 0.42 },
    mobile: { zoom: 1.05, yaw: 0.8 },
  },
  {
    id: 'collar',
    point: [-0.105, 0.112, -0.035],
    title: 'Forro morado',
    text: 'Cuello acolchado con forro morado intenso alrededor del tobillo.',
    pose: { yaw: -0.62, pitch: 0, bank: 0.2 },
    camera: { zoom: 1.2, elev: 0.12, focus: 0.3, shift: 0.07 },
    slot: { side: 'left', y: 0.27 },
    mobile: { zoom: 1.05, yaw: -0.55 },
  },
  {
    id: 'sole',
    point: [0.055, 0.0, -0.005],
    title: 'Suela de goma',
    text: 'Goma negra y gris con agarre de punta a talón.',
    pose: { yaw: 0.2, pitch: 0.04, bank: -0.62, rim: 0.2, shadow: 0 },
    camera: { zoom: 1.15, elev: -0.06, focus: 0.25, shift: -0.05 },
    slot: { side: 'right', y: 0.5 },
    mobile: { zoom: 1, yaw: 0.2 },
  },
];

// Zapatos posibles para la portada. Cada opción trae su producto del
// catálogo, sus medidas en la pose canónica, sus puntos de detalle y un
// acento opcional (data-hero-accent en la sección, ver flight.css).
// shoe.baseYaw: giro base para que el lado externo mire a la cámara (+Z). Un
// zapato derecho ya lo hace con la punta hacia la derecha (0); uno izquierdo
// se gira 180° y queda con la punta hacia la izquierda (Math.PI).
// shoe.yawSign: signo del giro que acerca la punta a la cámara (derecho: -1,
// izquierdo girado 180°: +1).
export const HERO_OPTIONS = {
  aj1: {
    slug: 'air-jordan-1',
    shoe: { length: 0.3, height: 0.177, halfWidth: 0.057, baseYaw: 0, yawSign: -1 },
    hotspots: AIR_JORDAN_1_HOTSPOTS,
    // Titular de la portada en dos líneas (la segunda entra como contorno).
    headline: ['Air Jordan', '1'],
    accent: null,
  },
  travis: {
    slug: 'jordan-4-travis-scott',
    // Zapato izquierdo: su lado externo mira a -Z en la pose canónica.
    shoe: { length: 0.3, height: 0.174, halfWidth: 0.056, baseYaw: Math.PI, yawSign: 1 },
    hotspots: JORDAN_4_TRAVIS_HOTSPOTS,
    headline: ['Jordan 4', 'Travis Scott'],
    accent: 'violet',
  },
};

// Portada por defecto (elegida por el dueño): el Jordan 4 Travis Scott.
// Cambiar esta línea a 'aj1' vuelve al Air Jordan 1 negro.
export const DEFAULT_HERO = 'travis';

// ?hero=travis (o cualquier clave de HERO_OPTIONS) prueba otra portada sin
// cambiar el código. Una clave desconocida cae en la portada por defecto.
const requestedHero = new URLSearchParams(location.search).get('hero');
export const HERO_KEY = Object.hasOwn(HERO_OPTIONS, requestedHero ?? '') ? requestedHero : DEFAULT_HERO;
export const HERO = HERO_OPTIONS[HERO_KEY];

export const PRODUCT_SLUG = HERO.slug;
export const SHOE = HERO.shoe;
export const HOTSPOTS = HERO.hotspots;

// Líneas de la carga inicial; la última es el modelo y muestra el progreso real.
export const BOOT_CHECKS = ['Modelos 3D', 'Texturas', 'Iluminación'];

export const BOOT_COPY = {
  title: 'Cargando colección',
  season: 'Temporada 26',
  view: 'Vista 3D',
};
