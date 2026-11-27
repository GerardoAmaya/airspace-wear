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

// ---------- Letras ----------

// Cada letra en una caja de 1 de alto (y hacia abajo) con su ancho. Trazo
// grueso, geométrico y condensado. `fill`: polígonos y rectángulos;
// `stroke`: trazos (curvas) con el mismo grosor.
const T = 0.22;
const rect = (x, y, w, h) => `M${x},${y}h${w}v${h}h${-w}Z`;
const LETTERS = {
  I: { width: T, fill: [rect(0, 0, T, 1)] },
  N: { width: 0.72, fill: [rect(0, 0, T, 1), rect(0.72 - T, 0, T, 1), 'M0,0L0.25,0L0.72,1L0.47,1Z'] },
  K: { width: 0.7, fill: [rect(0, 0, T, 1), `M${T},0.5L0.43,0L0.7,0L${T},0.8Z`, 'M0.3,0.38L0.7,1L0.44,1L0.16,0.58Z'] },
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
