// Estampados de los hoodies, dibujados como formas vectoriales (SVG) propias:
// letras geométricas hechas a mano (sin fuentes del sistema), el swoosh, el
// panel con forma de home plate y las franjas. Todo se escribe en metros de
// la isla de la textura; textures.mjs lo lleva a píxeles con la escala de
// cada isla (layout.json).
//
// Coordenadas de cada isla (y hacia abajo, como la imagen):
// - front: (x, -y) con x hacia la izquierda del personaje y y la altura.
// - back: (-x, -y), así el dibujo se lee de frente al mirar la espalda.
// - sleeveL / sleeveR: (a, b) con a a lo largo del brazo desde el hombro y b
//   el arco alrededor de la manga (0 arriba en T-pose, que es el lado de
//   afuera con los brazos abajo; positivo hacia adelante).

// Colores de marca (los mismos valores de los tokens de la web).
export const LIME = '#C6FF3D';
const INK = '#0E0E10';
// Tela de la camiseta negra (COLORWAYS en config.mjs): el borde que separa
// la figura del salpicado.
const FABRIC_BLACK = '#161618';

// ---------- Letras ----------

// Cada letra en una caja de 1 de alto (y hacia abajo) con su ancho. Trazo
// grueso, geométrico y condensado. `fill`: polígonos y rectángulos;
// `stroke`: trazos (curvas) con el mismo grosor.
const T = 0.22;
const rect = (x, y, w, h) => `M${x},${y}h${w}v${h}h${-w}Z`;
const LETTERS = {
  I: { width: T, fill: [rect(0, 0, T, 1)] },
  N: { width: 0.72, fill: [rect(0, 0, T, 1), rect(0.72 - T, 0, T, 1), 'M0,0L0.25,0L0.72,1L0.47,1Z'] },
  // El brazo de la K entra en el asta (sin costura visible entre las dos formas).
  K: { width: 0.7, fill: [rect(0, 0, T, 1), `M${T - 0.06},0.58L0.43,0L0.7,0L${T - 0.06},0.88Z`, 'M0.3,0.38L0.7,1L0.44,1L0.16,0.58Z'] },
  E: { width: 0.56, fill: [rect(0, 0, T, 1), rect(0, 0, 0.56, T), rect(0, 0.4, 0.5, T * 0.92), rect(0, 1 - T, 0.56, T)] },
  A: { width: 0.76, fill: ['M0,1L0.27,0L0.49,0L0.76,1L0.53,1L0.38,0.36L0.23,1Z', rect(0.22, 0.62, 0.32, 0.17)] },
  R: {
    width: 0.66,
    fill: [rect(0, 0, T, 1), 'M0.24,0.5L0.46,0.5L0.68,1L0.43,1Z'],
    stroke: [`M0,${T / 2}H0.32A0.215,0.215 0 0 1 0.32,0.54H0`],
  },
  O: { width: 0.8, fill: [`M0.4,0A0.4,0.5 0 1 0 0.4,1A0.4,0.5 0 1 0 0.4,0ZM0.4,${T * 0.95}A${0.4 - T},${0.5 - T * 0.95} 0 1 1 0.4,${1 - T * 0.95}A${0.4 - T},${0.5 - T * 0.95} 0 1 1 0.4,${T * 0.95}Z`] },
  S: { width: 0.62, stroke: ['M0.54,0.2C0.47,0.06 0.11,0.04 0.11,0.27C0.11,0.5 0.51,0.44 0.51,0.72C0.51,0.97 0.12,0.96 0.05,0.79'] },
  W: { width: 0.98, fill: ['M0,0L0.21,0L0.31,0.62L0.4,0L0.58,0L0.67,0.62L0.77,0L0.98,0L0.78,1L0.57,1L0.49,0.46L0.41,1L0.2,1Z'] },
  H: { width: 0.68, fill: [rect(0, 0, T, 1), rect(0.68 - T, 0, T, 1), rect(0, 0.4, 0.68, T)] },
  B: {
    width: 0.66,
    fill: [rect(0, 0, T, 1)],
    stroke: [`M0,${T / 2}H0.3A0.175,0.175 0 0 1 0.3,0.46H0`, `M0,0.46H0.33A0.215,0.215 0 0 1 0.33,${1 - T / 2}H0`],
  },
  Y: { width: 0.74, fill: ['M0,0L0.25,0L0.37,0.36L0.49,0L0.74,0L0.48,0.58L0.48,1L0.26,1L0.26,0.58Z'] },
  ' ': { width: 0.3 },
};

// Texto como formas: devuelve { svg, width } en metros, con la línea de base
// abajo y el origen arriba a la izquierda. skew en grados (cursiva).
export function text(value, { height, color, tracking = 0.14, skew = 0 }) {
  let x = 0;
  const parts = [];
  for (const char of value) {
    const letter = LETTERS[char];
    if (!letter) throw new Error(`prints: falta la letra "${char}"`);
    const fill = (letter.fill ?? []).map((d) => `<path d="${d}" fill="${color}"/>`).join('');
    const stroke = (letter.stroke ?? []).map((d) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${T}"/>`).join('');
    parts.push(`<g transform="translate(${x} 0)">${fill}${stroke}</g>`);
    x += letter.width + tracking;
  }
  const width = (x - tracking) * height;
  const slant = skew ? ` skewX(${-skew})` : '';
  return { width, svg: `<g transform="scale(${height})${slant}" fill-rule="evenodd">${parts.join('')}</g>` };
}

function centered(block, cx, top) {
  return `<g transform="translate(${cx - block.width / 2} ${top})">${block.svg}</g>`;
}

// ---------- Formas ----------

// Swoosh propio: una curva en forma de check (1 de ancho, punta arriba a la
// derecha, unos 0,52 de alto).
const SWOOSH = 'M0.02,0.3C-0.04,0.44 0.02,0.56 0.17,0.55C0.4,0.53 0.74,0.27 1,0.04C0.7,0.22 0.37,0.38 0.2,0.4C0.09,0.41 0.03,0.37 0.02,0.3Z';

export function swoosh(cx, cy, width, color, flip = false) {
  // Centrado en (cx, cy).
  const sx = flip ? -width : width;
  return `<path d="${SWOOSH}" fill="${color}" transform="translate(${cx - (flip ? -width : width) / 2} ${cy - width * 0.29}) scale(${sx} ${width})"/>`;
}

// Panel con forma de home plate (punta abajo), relleno y contorno.
function homePlate(cx, top, width, height, fill, outline, stroke) {
  const h = width / 2;
  const shoulder = top + height * 0.62;
  const points = [
    [cx - h, top],
    [cx + h, top],
    [cx + h, shoulder],
    [cx, top + height],
    [cx - h, shoulder],
  ]
    .map((p) => p.join(','))
    .join(' ');
  return `<polygon points="${points}" fill="${fill}" stroke="${outline}" stroke-width="${stroke}" stroke-linejoin="round"/>`;
}

// Figura propia: un basquetbolista de perfil que sube a una bandeja, con el
// cuerpo inclinado hacia adelante, la rodilla de adelante alta, la pierna de
// atrás doblada y pateando hacia atrás, el brazo de adelante en diagonal
// hacia el aro con la pelota en la mano y el otro brazo atrás para el
// equilibrio. Avanza hacia +x.
//
// Se arma desde un esqueleto (articulaciones en una caja de cerca de 1 de
// alto, y hacia abajo) con proporciones de una persona: cada hueso es una
// cápsula que se afina (más gruesa en el muslo que en el tobillo, en el
// hombro que en la muñeca), más la cabeza de perfil, las manos y las
// zapatillas orientadas por su hueso. Un filtro (desenfoque del alfa y
// umbral) funde las piezas en una sola silueta con uniones suaves, sin
// puntas redondas a la vista.
function circlePath(x, y, r) {
  const f = (v) => v.toFixed(4);
  return `M${f(x - r)},${f(y)}a${f(r)},${f(r)} 0 1 0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1 0 ${f(-2 * r)},0Z`;
}

// Piezas de la figura como segmentos con radio (para que el salpicado no las
// toque): se llenan al armar la figura.
const LEAPER_BONES = [];

function capsule([x1, y1], r1, [x2, y2], r2) {
  LEAPER_BONES.push([x1, y1, r1, x2, y2, r2]);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  const ux = dx / d;
  const uy = dy / d;
  // Tangentes exteriores de dos círculos de radios distintos.
  const k = (r1 - r2) / d;
  const c = Math.sqrt(Math.max(0, 1 - k * k));
  const nx = -uy * c + ux * k;
  const ny = ux * c + uy * k;
  const mx = uy * c + ux * k;
  const my = -ux * c + uy * k;
  const f = (v) => v.toFixed(4);
  return [
    `M${f(x1 + nx * r1)},${f(y1 + ny * r1)}L${f(x2 + nx * r2)},${f(y2 + ny * r2)}L${f(x2 + mx * r2)},${f(y2 + my * r2)}L${f(x1 + mx * r1)},${f(y1 + my * r1)}Z`,
    circlePath(x1, y1, r1),
    circlePath(x2, y2, r2),
  ];
}

// Punto a `length` de `from` en la dirección `degrees` (0 = +x, 90 = arriba).
function reach([x, y], degrees, length) {
  const a = (degrees * Math.PI) / 180;
  return [x + Math.cos(a) * length, y - Math.sin(a) * length];
}

// Forma de una pieza en ejes locales (u a lo largo del hueso, v a su
// izquierda) llevada al punto `at` con la dirección `degrees`.
function shape(points, at, degrees) {
  LEAPER_BONES.push([at[0], at[1], 0.075, at[0], at[1], 0.075]);
  const a = (degrees * Math.PI) / 180;
  const u = [Math.cos(a), -Math.sin(a)];
  const v = [Math.sin(a), Math.cos(a)];
  const f = (n) => n.toFixed(4);
  const p = points.map(([pu, pv]) => [at[0] + u[0] * pu + v[0] * pv, at[1] + u[1] * pu + v[1] * pv]);
  // Contorno suave: curvas por los puntos medios de cada lado.
  const mid = (i) => [(p[i][0] + p[(i + 1) % p.length][0]) / 2, (p[i][1] + p[(i + 1) % p.length][1]) / 2];
  let d = `M${f(mid(0)[0])},${f(mid(0)[1])}`;
  for (let i = 1; i <= p.length; i++) {
    const q = p[i % p.length];
    const m = mid(i % p.length);
    d += `Q${f(q[0])},${f(q[1])} ${f(m[0])},${f(m[1])}`;
  }
  return `${d}Z`;
}

// Zapatilla de caña media: talón en 0, puntera hacia +u, suela hacia +v.
const SHOE = [[-0.022, -0.036], [0.028, -0.046], [0.07, -0.026], [0.108, -0.012], [0.128, 0.008], [0.122, 0.026], [0.02, 0.03], [-0.03, 0.026], [-0.034, -0.004]];
// Mano abierta: muñeca en 0, dedos hacia +u, pulgar hacia -v.
const HAND = [[-0.004, -0.016], [0.03, -0.024], [0.05, -0.014], [0.058, 0.002], [0.044, 0.016], [0.006, 0.016]];

function buildLeaper() {
  const pelvis = [0, 0.52];
  const chest = reach(pelvis, 75, 0.3);
  const neck = reach(chest, 72, 0.07);
  const head = reach(neck, 82, 0.068);
  const shoulder = reach(chest, 150, 0.012);
  // Brazo de adelante (pelota) en diagonal hacia arriba y adelante.
  const elbowF = reach(shoulder, 32, 0.165);
  const wristF = reach(elbowF, 60, 0.145);
  const ball = reach(wristF, 56, 0.072);
  // Brazo de atrás: hacia atrás y apenas abajo.
  const elbowB = reach(shoulder, 222, 0.16);
  const wristB = reach(elbowB, 196, 0.14);
  // Pierna de adelante: muslo hacia adelante y arriba, canilla hacia abajo.
  const hipF = reach(pelvis, 0, 0.02);
  const kneeF = reach(hipF, 30, 0.245);
  const ankleF = reach(kneeF, -96, 0.235);
  // Pierna de atrás: muslo hacia abajo y atrás, la canilla patea hacia atrás.
  const hipB = reach(pelvis, 180, 0.02);
  const kneeB = reach(hipB, -112, 0.24);
  const ankleB = reach(kneeB, 160, 0.225);
  LEAPER_BONES.push([ball[0], ball[1], 0.058, ball[0], ball[1], 0.058]);
  return [
    circlePath(ball[0], ball[1], 0.058),
    // Cabeza de perfil: cráneo, mandíbula hacia adelante y nariz corta.
    shape([[-0.055, -0.03], [-0.02, -0.068], [0.04, -0.066], [0.066, -0.02], [0.074, 0.014], [0.058, 0.04], [0.03, 0.062], [-0.02, 0.06], [-0.058, 0.03]], head, 0),
    capsule(neck, 0.03, chest, 0.034),
    // Torso: espalda y pecho, con la camiseta un poco más ancha abajo.
    capsule(pelvis, 0.066, reach(pelvis, 75, 0.15), 0.058),
    capsule(reach(pelvis, 75, 0.15), 0.058, chest, 0.07),
    // Short holgado hasta la mitad del muslo.
    capsule(hipF, 0.064, reach(hipF, 30, 0.12), 0.056),
    capsule(hipB, 0.064, reach(hipB, -112, 0.12), 0.056),
    // Brazos.
    capsule(shoulder, 0.033, elbowF, 0.024),
    capsule(elbowF, 0.025, wristF, 0.018),
    shape(HAND, wristF, 60),
    capsule(shoulder, 0.031, elbowB, 0.023),
    capsule(elbowB, 0.024, wristB, 0.017),
    shape(HAND, wristB, 196),
    // Piernas.
    capsule(kneeF, 0.04, reach(hipF, 30, 0.12), 0.05),
    capsule(kneeF, 0.04, ankleF, 0.021),
    capsule(reach(kneeF, -96, 0.08), 0.034, ankleF, 0.021),
    shape(SHOE, ankleF, -4),
    capsule(kneeB, 0.04, reach(hipB, -112, 0.12), 0.05),
    capsule(kneeB, 0.04, ankleB, 0.021),
    capsule(reach(kneeB, 160, 0.08), 0.034, ankleB, 0.021),
    shape(SHOE, ankleB, 205),
  ].flat();
}

const LEAPER = buildLeaper();
// Caja de la figura, medida sobre las articulaciones (más un margen).
const LEAPER_BOX = { x0: -0.45, y0: -0.3, x1: 0.42, y1: 0.86 };
let filterId = 0;

// Ubicación de la figura: alto total `height` (de la pelota a la rodilla de
// atrás), centrada en `cx`, con su borde de arriba en `top`.
function placement(cx, top, height) {
  const scale = height / 1.03;
  return { scale, x: cx + 0.01 * scale, y: top + 0.22 * scale };
}

// ¿Toca la figura (con un margen) un círculo en (x, y) de radio r, en
// coordenadas del estampado?
function nearLeaper(cx, top, height, margin) {
  const { scale, x: ox, y: oy } = placement(cx, top, height);
  return (x, y, r) => {
    const px = (x - ox) / scale;
    const py = (y - oy) / scale;
    const pad = (margin + r) / scale;
    return LEAPER_BONES.some(([x1, y1, r1, x2, y2, r2]) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length)) : 0;
      const distance = Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
      return distance < r1 + (r2 - r1) * t + pad;
    });
  };
}

function leaper(cx, top, height, color, halo = null) {
  const { scale, x, y } = placement(cx, top, height);
  const place = `translate(${x} ${y}) scale(${scale})`;
  const id = `figure${filterId++}`;
  const { x0, y0, x1, y1 } = LEAPER_BOX;
  const region = `filterUnits="userSpaceOnUse" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"`;
  // Desenfoque del alfa y umbral: las piezas se funden en una silueta.
  const filter = (fill, grow = 0) =>
    `<filter id="${id}${grow ? 'h' : ''}" ${region} color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="0.006" result="b"/><feComponentTransfer in="b" result="t"><feFuncA type="linear" slope="24" intercept="${-11.5 + grow}"/></feComponentTransfer><feFlood flood-color="${fill}"/><feComposite in2="t" operator="in"/>${grow ? `<feMorphology operator="dilate" radius="${halo.width / scale}"/>` : ''}</filter>`;
  const pieces = LEAPER.map((d) => `<path d="${d}" fill="#000"/>`).join('');
  const figure = `<defs>${filter(color)}</defs><g transform="${place}"><g filter="url(#${id})">${pieces}</g></g>`;
  if (!halo) return figure;
  const ring = `<defs>${filter(halo.color, 1)}</defs><g transform="${place}"><g filter="url(#${id}h)">${pieces}</g></g>`;
  return `<!--halo-->${ring}<!--/halo-->${figure}`;
}

// "Flight" en cursiva trazada a mano: letras unidas y un trazo de remate
// debajo (y hacia abajo; mayúscula de 1 de alto, ancho cerca de 1,9). Se
// dibuja con una pluma de punta ancha: el mismo trazo repetido a lo largo de
// la punta inclinada da trazos gruesos y finos según la dirección.
const FLIGHT_SCRIPT = [
  // F: remate de arriba ondulado, asta curva y travesaño.
  'M0.02,0.2C0.14,0.06 0.4,0.14 0.52,0.06C0.58,0.02 0.64,0.03 0.66,0.07',
  'M0.38,0.1C0.33,0.4 0.26,0.7 0.14,0.9C0.1,0.97 0.02,0.97 0.0,0.9',
  'M0.2,0.52C0.3,0.48 0.4,0.5 0.47,0.46',
  // l
  'M0.42,0.9C0.5,0.7 0.62,0.36 0.67,0.14C0.69,0.03 0.61,0.03 0.59,0.14C0.55,0.4 0.52,0.7 0.54,0.86C0.56,0.95 0.63,0.92 0.67,0.84',
  // i y su punto
  'M0.67,0.84C0.7,0.76 0.72,0.66 0.74,0.58M0.74,0.58C0.72,0.72 0.71,0.86 0.75,0.9C0.79,0.93 0.84,0.88 0.87,0.82',
  'M0.775,0.43L0.785,0.425',
  // g
  'M0.87,0.82C0.87,0.66 0.94,0.56 1.0,0.58C1.05,0.6 1.03,0.72 0.98,0.8C0.94,0.86 0.91,0.9 0.95,0.9C1.0,0.88 1.04,0.74 1.06,0.58C1.05,0.86 1.02,1.12 0.96,1.24C0.9,1.34 0.82,1.3 0.86,1.2C0.9,1.1 1.02,1.0 1.12,0.92',
  // h
  'M1.12,0.92C1.18,0.62 1.26,0.28 1.3,0.1C1.32,0.02 1.26,0.02 1.24,0.12C1.2,0.42 1.18,0.72 1.18,0.9C1.22,0.72 1.3,0.58 1.37,0.6C1.43,0.62 1.39,0.8 1.41,0.88C1.43,0.94 1.49,0.92 1.52,0.86',
  // t
  'M1.52,0.86C1.56,0.62 1.6,0.38 1.63,0.22M1.63,0.22C1.6,0.48 1.58,0.78 1.62,0.88C1.66,0.96 1.76,0.92 1.82,0.84',
  'M1.5,0.46C1.6,0.44 1.7,0.43 1.82,0.39',
  // Remate debajo de la palabra.
  'M0.16,1.08C0.6,1.0 1.2,1.04 1.92,0.9',
];

function script(paths, cx, top, height, color, width) {
  // Pluma inclinada: copias corridas a lo largo de la punta (45 grados).
  const nib = 0.045;
  const copies = 6;
  const strokes = [];
  for (let i = 0; i < copies; i++) {
    const t = i / (copies - 1) - 0.5;
    const offset = `translate(${(t * nib).toFixed(4)} ${(-t * nib).toFixed(4)})`;
    strokes.push(`<g transform="${offset}">${paths.map((d) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width / height}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</g>`);
  }
  // Cursiva: inclinada hacia la derecha.
  return `<g transform="translate(${cx - 0.97 * height} ${top}) scale(${height}) skewX(-10)">${strokes.join('')}</g>`;
}

// Generador con semilla (mismo resultado en cada corrida).
function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Salpicado: gotas más densas y más grandes cerca de la figura, más chicas y
// escasas hacia el borde del óvalo; algunas se estiran en la dirección del
// salto (`motion`, en grados de la imagen).
function speckles({ cx, cy, rx, ry, count, color, seed, size = [0.0009, 0.0046], motion = -55, avoid = null }) {
  const random = seededRandom(seed);
  const dots = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const r = Math.pow(random(), 1.1);
    const x = cx + Math.cos(angle) * r * rx;
    const y = cy + Math.sin(angle) * r * ry;
    const big = Math.pow(random(), 2.4) * (1 - 0.75 * r);
    const radius = size[0] + (size[1] - size[0]) * big;
    // Una de cada cinco gotas se estira en la dirección del salto.
    const moving = random() < 0.2;
    const streak = moving ? 1.5 + random() * 0.7 : 0.88 + random() * 0.24;
    const tilt = moving ? motion + (random() - 0.5) * 16 : Math.round(random() * 180);
    // Sin gotas pegadas a la figura (se verían cortadas por su borde).
    if (avoid?.(x, y, radius * streak)) continue;
    const f = (v, n = 4) => v.toFixed(n);
    dots.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(radius * streak, 5)}" ry="${f(radius / Math.sqrt(streak), 5)}" transform="rotate(${f(tilt, 1)} ${f(x)} ${f(y)})" fill="${color}"/>`);
  }
  return dots.join('');
}

// ---------- Estampados por producto ----------

// Cada estampado devuelve SVG por isla (en metros de la isla) y las mismas
// formas en blanco para la máscara (sin ruido de felpa y con otro brillo).
export const PRINTS = {
  // Hoodie blanco: panel negro con contorno y swoosh lima al frente; swoosh
  // negro grande y "SWOOSH BY NIKE" en gris en la espalda; etiqueta tejida
  // negra con "NIKE" en el canalé del ruedo.
  'nike-white': () => {
    // Pecho alto, justo bajo el final de los cordones.
    const panelTop = -1.33;
    const front = [
      homePlate(0, panelTop, 0.23, 0.215, INK, LIME, 0.007),
      swoosh(0, panelTop + 0.092, 0.165, LIME),
    ];
    const label = text('NIKE', { height: 0.0085, color: '#F4F1EA', tracking: 0.16 });
    front.push(`<rect x="0.122" y="-0.846" width="0.036" height="0.017" rx="0.001" fill="${INK}"/>`, centered(label, 0.14, -0.8418));
    // Espalda: swoosh grande a lo ancho de la espalda alta, entre los
    // omóplatos (la capucha cae justo encima), y el texto debajo.
    // Todo dentro del panel plano de la espalda (unos 12 cm a cada lado del
    // centro): nada se envuelve hacia los costados ni toca la capucha.
    const by = text('SWOOSH BY NIKE', { height: 0.0175, color: '#8A8A8E', tracking: 0.2 });
    const back = [swoosh(-0.004, -1.205, 0.215, INK), centered(by, 0, -1.128)];
    return { front, back, sleeveL: [], sleeveR: [] };
  },
  // Camiseta Nike Flight negra: al frente, NIKE en blanco con un swoosh
  // grande debajo, centrado en el pecho (unos 24 cm de ancho, las letras 8 cm
  // bajo el cuello). Atrás, una figura propia de basquetbolista que sube a
  // una bandeja (unos 25 cm de alto) en amarillo dorado, sobre un óvalo de
  // salpicado del mismo color y la palabra "Flight" en cursiva bajo sus pies.
  'nike-flight-black': () => {
    const yellow = '#F2C21B';
    // Espalda: coordenadas (-x, -y); el escote de atrás queda cerca de 1,47 m.
    const back = [
      speckles({ cx: 0, cy: -1.27, rx: 0.16, ry: 0.19, count: 440, color: yellow, seed: 23, avoid: nearLeaper(0, -1.405, 0.25, 0.003) }),
      leaper(0, -1.405, 0.25, yellow, { color: FABRIC_BLACK, width: 0.0022 }),
      script(FLIGHT_SCRIPT, 0.005, -1.155, 0.042, yellow, 0.0022),
    ];
    // Frente: (x, -y), x hacia la izquierda del personaje. El mismo blanco
    // que los estampados de los hoodies (no brilla de más con las luces).
    const white = '#F2F1EC';
    const nike = text('NIKE', { height: 0.068, color: white, tracking: 0.08, skew: 12 });
    const top = -1.335;
    const front = [centered(nike, -0.02, top), swoosh(0.008, top + 0.088, 0.235, white)];
    return { front, back, sleeveL: [], sleeveR: [] };
  },
  // Hoodie negro Nike Air: "NIKE" con el swoosh debajo, "A I R" espaciado y
  // una fila de franjas grises en diagonal al frente; bandas blancas en
  // diagonal sobre el hombro y la parte alta de la manga; etiqueta tejida
  // "NIKE AIR" en el puño izquierdo.
  'nike-air-black': () => {
    const white = '#F2F1EC';
    const nike = text('NIKE', { height: 0.055, color: white, tracking: 0.1, skew: 10 });
    const air = text('A I R', { height: 0.028, color: white, tracking: 0.32 });
    const stripes = [];
    for (let i = 0; i < 7; i++) {
      const x = -0.074 + i * 0.024;
      stripes.push(`<polygon points="${x},-1.12 ${x + 0.012},-1.12 ${x + 0.021},-1.14 ${x + 0.009},-1.14" fill="#8E8E93"/>`);
    }
    const front = [centered(nike, 0, -1.31), swoosh(0.004, -1.221, 0.165, white), centered(air, 0, -1.177), ...stripes];
    // Banda en diagonal: del hombro (atrás) hacia el frente sobre el brazo.
    const band = `<polygon points="0.0,-0.13 0.0,-0.035 0.3,0.115 0.3,0.02" fill="${white}"/>`;
    const tag = text('NIKE AIR', { height: 0.0075, color: INK, tracking: 0.16 });
    const label = `<g transform="translate(0.452 -0.012) rotate(-90)"><rect x="${-tag.width / 2 - 0.004}" y="-0.0075" width="${tag.width + 0.008}" height="0.015" fill="${white}"/>${centered(tag, 0, -0.0038)}</g>`;
    return { front, back: [], sleeveL: [band, label], sleeveR: [band] };
  },
};
