// Genera el atlas de humo (flipbook) de la entrada de la portada: una
// bocanada que nace compacta, se enrosca, se abre y se deshilacha, en 8 x 8
// cuadros. Obra propia, hecha con ruido procedural (sin recursos de
// terceros): ruido de gradiente 3D, fBm y deformación del dominio con un
// remolino que crece con el tiempo. El tiempo es la tercera coordenada del
// ruido, así dos cuadros vecinos se parecen y el shader puede mezclarlos.
//
// Salida (escala de grises: la densidad del humo; la luz la pone el shader):
//   apps/web/public/fx/smoke-atlas.webp       1024 px (cuadros de 128 px)
//   apps/web/public/fx/smoke-atlas-lite.webp   512 px (cuadros de 64 px)
//
// Uso: pnpm fx:smoke (node scripts/fx/smoke-atlas.mjs)

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'apps/web/public/fx');
// Cuadros por lado y tamaño de cada cuadro. Se dibuja al doble y se reduce
// (suavizado de bordes gratis).
const GRID = 8;
const FRAME = 128;
const SUPERSAMPLE = 2;
const QUALITY = 84;

// ---------- Ruido de gradiente 3D con semilla ----------

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = seeded(1729);
const PERM = new Uint8Array(512);
{
  const base = Array.from({ length: 256 }, (_, index) => index);
  for (let index = 255; index > 0; index -= 1) {
    const swap = Math.floor(rand() * (index + 1));
    [base[index], base[swap]] = [base[swap], base[index]];
  }
  for (let index = 0; index < 512; index += 1) PERM[index] = base[index & 255];
}
const GRADIENTS = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
function grad(hash, x, y, z) {
  const g = GRADIENTS[hash % 12];
  return g[0] * x + g[1] * y + g[2] * z;
}
// Ruido de Perlin clásico, en -1..1 (aprox.).
function noise(x, y, z) {
  const X = Math.floor(x);
  const Y = Math.floor(y);
  const Z = Math.floor(z);
  x -= X;
  y -= Y;
  z -= Z;
  const xi = X & 255;
  const yi = Y & 255;
  const zi = Z & 255;
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  const A = PERM[xi] + yi;
  const AA = PERM[A] + zi;
  const AB = PERM[A + 1] + zi;
  const B = PERM[xi + 1] + yi;
  const BA = PERM[B] + zi;
  const BB = PERM[B + 1] + zi;
  return lerp(
    lerp(lerp(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u), lerp(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u), v),
    lerp(
      lerp(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u),
      lerp(grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1), u),
      v,
    ),
    w,
  );
}
function fbm(x, y, z, octaves) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * noise(x * frequency, y * frequency, z * frequency + octave * 17.3);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return sum;
}

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// Lóbulos de la bocanada (coliflor): cada uno parte cerca del centro y se
// aleja un poco con el tiempo.
const LOBES = Array.from({ length: 7 }, (_, index) => {
  const angle = (index / 7) * Math.PI * 2 + rand() * 0.6;
  const reach = index === 0 ? 0 : 0.16 + rand() * 0.14;
  return { angle, reach, size: index === 0 ? 0.42 : 0.24 + rand() * 0.1 };
});

// Densidad del humo en p (coordenadas -1..1 del cuadro) en el momento t (0..1).
function density(px, py, t) {
  const grow = 1 - Math.pow(1 - t, 2);
  // Remolino suave: gira un poco más cerca del centro y con el tiempo.
  const radius = Math.hypot(px, py);
  const swirl = (0.15 + 0.55 * grow) * Math.exp(-radius * 2.2);
  const cos = Math.cos(swirl);
  const sin = Math.sin(swirl);
  let x = px * cos - py * sin;
  let y = px * sin + py * cos;
  // Deformación del dominio en dos pasos: el borde se enrosca y se deshilacha.
  const z = t * 1.25;
  const warp = 0.12 + 0.3 * grow;
  const ax = fbm(x * 1.3 + 3.1, y * 1.3, z, 3);
  const ay = fbm(x * 1.3, y * 1.3 + 7.7, z + 4.2, 3);
  const bx = fbm(x * 2.6 + ax * 1.5 + 1.7, y * 2.6 + ay * 1.5 + 9.2, z * 1.3 + 2.0, 3);
  const by = fbm(x * 2.6 + ax * 1.5 + 8.3, y * 2.6 + ay * 1.5 + 2.8, z * 1.3 + 6.0, 3);
  x += (ax * 0.7 + bx * 0.5) * warp;
  y += (ay * 0.7 + by * 0.5) * warp;
  // Forma: lóbulos gaussianos (coliflor) que crecen y se separan.
  const scale = 0.62 + 0.36 * grow;
  let shape = 0;
  for (const lobe of LOBES) {
    const cx = Math.cos(lobe.angle) * lobe.reach * (0.7 + 0.8 * grow);
    const cy = Math.sin(lobe.angle) * lobe.reach * (0.7 + 0.8 * grow);
    const size = lobe.size * scale;
    const dx = x - cx;
    const dy = y - cy;
    shape += Math.exp(-(dx * dx + dy * dy) / (2 * size * size)) * (lobe.reach === 0 ? 0.8 : 0.5);
  }
  shape = 1 - Math.exp(-shape * 1.6);
  // Volutas: ruido "billow" (celdas redondas) más un grano fino.
  const billow = 1 - Math.abs(fbm(x * 2.4 + 5, y * 2.4 - 3, z * 1.1 + 11, 4)) * 2.2;
  const grain = fbm(x * 6.5, y * 6.5, z * 1.6 + 23, 3) * 0.5 + 0.5;
  const detail = Math.min(1, Math.max(0, billow * 0.75 + grain * 0.35));
  // Se disuelve con el tiempo: los huecos (detalle bajo) se comen primero.
  const erosion = 0.05 + 0.5 * t;
  let value = shape * (0.45 + 0.55 * detail) - erosion * (1 - detail);
  value = smoothstep(0.02, 0.95, value) * (0.95 - 0.35 * t);
  // Margen: nada toca el borde del cuadro (sin sangrado entre cuadros).
  const edge = Math.max(Math.abs(px), Math.abs(py));
  value *= 1 - smoothstep(0.8, 0.97, edge);
  return value;
}

const size = GRID * FRAME * SUPERSAMPLE;
const frameSize = FRAME * SUPERSAMPLE;
const pixels = new Uint8Array(size * size);
const started = Date.now();
for (let frame = 0; frame < GRID * GRID; frame += 1) {
  const t = frame / (GRID * GRID - 1);
  const ox = (frame % GRID) * frameSize;
  const oy = Math.floor(frame / GRID) * frameSize;
  for (let j = 0; j < frameSize; j += 1) {
    const py = ((j + 0.5) / frameSize) * 2 - 1;
    for (let i = 0; i < frameSize; i += 1) {
      const px = ((i + 0.5) / frameSize) * 2 - 1;
      // Curva suave (0,9): más detalle en la zona tenue.
      const value = Math.pow(density(px, py, t), 0.9);
      pixels[(oy + j) * size + ox + i] = Math.round(Math.min(1, Math.max(0, value)) * 255);
    }
  }
}

await mkdir(OUTPUT_DIR, { recursive: true });
const raw = { raw: { width: size, height: size, channels: 1 } };
for (const [name, width] of [
  ['smoke-atlas.webp', GRID * FRAME],
  ['smoke-atlas-lite.webp', (GRID * FRAME) / 2],
]) {
  const file = path.join(OUTPUT_DIR, name);
  const info = await sharp(Buffer.from(pixels), raw)
    .resize(width, width, { kernel: 'lanczos3' })
    .toColourspace('b-w')
    .webp({ quality: QUALITY, effort: 6, smartSubsample: true })
    .toFile(file);
  console.log(`${path.relative(ROOT_DIR, file)}: ${width} px, ${(info.size / 1024).toFixed(1)} KB`);
}
console.log(`Listo en ${((Date.now() - started) / 1000).toFixed(1)} s`);
