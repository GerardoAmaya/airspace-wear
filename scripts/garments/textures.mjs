// Texturas de las prendas propias (hoodie y camiseta): color, relieve (mapa
// de normales) y rugosidad, en el atlas que describe <prenda>-layout.json (lo
// escribe hoodie.py). Todo es obra propia:
// ruido procedural para la felpa, canalé y costuras calculados por píxel y
// los estampados vectoriales de prints.mjs.

import sharp from 'sharp';
import { PRINTS } from './prints.mjs';

// ---------- Ruido ----------

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

// Ruido de valor en una grilla periódica de `cells` celdas, interpolado.
function valueNoise(size, cells, seed) {
  const rand = seeded(seed);
  const grid = new Float32Array(cells * cells).map(() => rand());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const gy = (y / size) * cells;
    const y0 = Math.floor(gy) % cells;
    const y1 = (y0 + 1) % cells;
    const fy = gy - Math.floor(gy);
    const sy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const x0 = Math.floor(gx) % cells;
      const x1 = (x0 + 1) % cells;
      const fx = gx - Math.floor(gx);
      const sx = fx * fx * (3 - 2 * fx);
      const a = grid[y0 * cells + x0] + (grid[y0 * cells + x1] - grid[y0 * cells + x0]) * sx;
      const b = grid[y1 * cells + x0] + (grid[y1 * cells + x1] - grid[y1 * cells + x0]) * sx;
      out[y * size + x] = a + (b - a) * sy;
    }
  }
  return out;
}

// ---------- Islas ----------

function islandAt(layout, px, py) {
  const u = px / layout.size;
  const v = py / layout.size;
  for (const [name, [x0, y0, x1, y1]] of Object.entries(layout.rects)) {
    if (u >= x0 && u < x1 && v >= y0 && v < y1) return name;
  }
  return null;
}

function local(layout, name, px, py) {
  const island = layout.islands[name];
  return [(px - island.offset[0]) / island.scale[0], (py - island.offset[1]) / island.scale[1]];
}

// Transformación SVG de metros de la isla a píxeles.
function islandGroup(layout, name, content) {
  const { scale, offset } = layout.islands[name];
  return `<g transform="matrix(${scale[0]} 0 0 ${scale[1]} ${offset[0]} ${offset[1]})">${content}</g>`;
}

// Zonas de canalé: banda del ruedo (frente y espalda), puños (mangas) y
// cuello redondo, según layout.ribs (la camiseta lleva dobladillo liso en el
// ruedo y las mangas).
function ribAt(layout, name, a, b) {
  const ribs = layout.ribs ?? { hem: true, cuffs: true, collar: false };
  if (name === 'collar') return ribs.collar ? { along: a } : null;
  if ((name === 'front' || name === 'back') && ribs.hem) {
    const y = -b;
    return y >= layout.hemHeight - 0.01 && y <= layout.hemHeight + layout.hemRib ? { along: a } : null;
  }
  if ((name === 'sleeveL' || name === 'sleeveR') && ribs.cuffs) {
    const end = layout.armLength * layout.sleeveEnd;
    return a >= end - layout.cuffLength && a <= end + 0.02 ? { along: b } : null;
  }
  return null;
}

const rgb = (color) => `rgb(${color.join(',')})`;

// ---------- Capas SVG ----------

function seamsSvg(layout, color, width) {
  const lines = layout.seams.map(([x0, y0, x1, y1]) => `M${x0},${y0}L${x1},${y1}`).join('');
  return `<path d="${lines}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

// Pespuntes: borde del canalé del ruedo y de los puños, contorno del bolsillo
// y costura central de la capucha.
function stitchesSvg(layout, color, width, dash) {
  // Grosor y guiones en píxeles, pasados a metros de cada isla.
  const strokeFor = (name) => {
    const scale = layout.islands[name].scale[0];
    const dashes = dash ? ` stroke-dasharray="${dash.map((d) => d / scale).join(' ')}"` : '';
    return `fill="none" stroke="${color}" stroke-width="${width / scale}"${dashes}`;
  };
  const parts = [];
  for (const name of ['front', 'back']) {
    const [a0, , a1] = layout.islands[name].bounds;
    const y = -(layout.hemHeight + layout.hemRib);
    parts.push(islandGroup(layout, name, `<path d="M${a0},${y}H${a1}" ${strokeFor(name)}/>`));
  }
  for (const name of ['sleeveL', 'sleeveR']) {
    const [, b0, , b1] = layout.islands[name].bounds;
    const a = layout.armLength * layout.sleeveEnd - layout.cuffLength;
    parts.push(islandGroup(layout, name, `<path d="M${a},${b0}V${b1}" ${strokeFor(name)}/>`));
  }
  // Costura central del cuello (capucha o cuello redondo, atrás).
  for (const name of ['hood', 'collar']) {
    const island = layout.islands[name];
    if (!island) continue;
    for (const u of [0.006, island.perimeter - 0.006]) {
      parts.push(islandGroup(layout, name, `<path d="M${u},0V0.5" ${strokeFor(name)}/>`));
    }
  }
  const p = layout.pocket;
  if (!p) return parts.join('');
  const inset = 0.006;
  const outline = [
    [-p.halfWidthBottom + inset, -p.bottom - inset],
    [p.halfWidthBottom - inset, -p.bottom - inset],
    [p.halfWidthTop - inset, -p.top + inset],
    [-p.halfWidthTop + inset, -p.top + inset],
  ];
  // El bolsillo es un relieve en el frente: pespunte de su contorno.
  parts.push(
    islandGroup(layout, 'front', `<path d="M${outline.map((q) => q.join(',')).join('L')}Z" ${strokeFor('front')}/>`),
  );
  return parts.join('');
}

// Bolsillo: borde superior y aberturas laterales (en diagonal) como una
// línea oscura fina, la sombra de la abertura.
function pocketSvg(layout, color, width) {
  const p = layout.pocket;
  if (!p) return '';
  const scale = layout.islands.front.scale[0];
  const w = width / scale;
  const left = `M${-p.halfWidthTop},${-p.top}L${-p.halfWidthBottom + 0.01},${-p.bottom - 0.055}`;
  const right = `M${p.halfWidthTop},${-p.top}L${p.halfWidthBottom - 0.01},${-p.bottom - 0.055}`;
  const top = `M${-p.halfWidthTop},${-p.top}H${p.halfWidthTop}`;
  return islandGroup(layout, 'front', `<path d="${left}${right}${top}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`);
}

function printsSvg(layout, colorway, maskColor) {
  const art = PRINTS[colorway.print]();
  const parts = [];
  for (const name of ['front', 'back', 'sleeveL', 'sleeveR']) {
    let content = (art[name] ?? []).join('');
    if (!content) continue;
    // El borde del color de la tela (halo) no es estampado: fuera de la máscara.
    if (maskColor) content = content.replace(/<!--halo-->[\s\S]*?<!--\/halo-->/g, '').replace(/(fill|stroke)="(?!none)[^"]*"/g, `$1="${maskColor}"`);
    parts.push(islandGroup(layout, name, content));
  }
  return parts.join('');
}

async function rasterize(size, body, background) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${background}"/>${body}</svg>`;
  const { data } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}

// ---------- Texturas ----------

export async function buildTextures(layout, colorway) {
  const size = layout.size;
  const count = size * size;
  // Capas vectoriales: color con estampados y costuras, máscara del
  // estampado y máscara de las costuras (para el relieve).
  const fabric = rgb(colorway.fabric);
  const cords = layout.rects.cords;
  const cordRect = !cords ? '' : `<rect x="${cords[0] * size}" y="${cords[1] * size}" width="${(cords[2] - cords[0]) * size}" height="${(cords[3] - cords[1]) * size}" fill="${rgb(colorway.cord)}"/>`;
  const colorBody = [cordRect, seamsSvg(layout, rgb(colorway.stitch), 1.4), stitchesSvg(layout, rgb(colorway.stitch), 1.6, [5, 3]), pocketSvg(layout, rgb(colorway.fabric.map((c) => Math.round(c * 0.72))), 2.4), printsSvg(layout, colorway, null)].join('');
  const [color, printMask, seamMask] = await Promise.all([
    rasterize(size, colorBody, fabric),
    rasterize(size, printsSvg(layout, colorway, '#ffffff'), '#000000'),
    rasterize(size, seamsSvg(layout, '#ffffff', 4) + stitchesSvg(layout, '#ffffff', 2.5, null) + pocketSvg(layout, '#ffffff', 5), '#000000'),
  ]);

  // Relieve: felpa (ruido fino y medio), canalé, costuras hundidas y el
  // estampado apenas en relieve.
  const fine = valueNoise(size, 256, 11);
  const medium = valueNoise(size, 96, 23);
  const heather = valueNoise(size, 700, 37);
  const height = new Float32Array(count);
  const rib = new Uint8Array(count);
  const ribColor = colorway.rib;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const index = py * size + px;
      const name = islandAt(layout, px, py);
      let h = 0.5 + (fine[index] - 0.5) * 0.22 + (medium[index] - 0.5) * 0.3;
      if (name && layout.islands[name]?.scale) {
        const [a, b] = local(layout, name, px, py);
        const band = ribAt(layout, name, a, b);
        if (band) {
          rib[index] = 1;
          // Canalé de 5 mm.
          h = 0.5 + 0.45 * Math.sin((band.along / 0.005) * 2 * Math.PI) + (fine[index] - 0.5) * 0.1;
        }
      }
      const seam = seamMask[index * 4] / 255;
      h -= seam * 0.3;
      // El estampado tapa la felpa: queda casi liso y apenas en relieve.
      const print = printMask[index * 4] / 255;
      h = 0.5 + (h - 0.5) * (1 - 0.85 * print) + print * 0.12;
      height[index] = h;
    }
  }

  // Color final: tono del canalé y moteado de la felpa fuera del estampado.
  const colorOut = Buffer.alloc(count * 3);
  for (let index = 0; index < count; index++) {
    const print = printMask[index * 4] / 255;
    const mottling = (heather[index] - 0.5) * 0.06 + (medium[index] - 0.5) * 0.04;
    for (let c = 0; c < 3; c++) {
      let value = color[index * 4 + c];
      if (rib[index] && print < 0.5) value = value + (ribColor[c] - colorway.fabric[c]);
      // En telas oscuras el moteado aclara (jaspeado); en claras oscurece.
      const amount = colorway.fabric[c] > 128 ? value * mottling : 255 * mottling * 0.15;
      value += amount * (1 - print);
      colorOut[index * 3 + c] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }

  // Normales desde el alto (convención OpenGL, Y hacia arriba).
  const strength = 2.2;
  const normalOut = Buffer.alloc(count * 3);
  const at = (x, y) => height[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const index = (y * size + x) * 3;
      normalOut[index] = Math.round((0.5 - (dx / length) * 0.5) * 255);
      normalOut[index + 1] = Math.round((0.5 + (dy / length) * 0.5) * 255);
      normalOut[index + 2] = Math.round((0.5 + (1 / length) * 0.5) * 255);
    }
  }

  // Rugosidad (G) y metal (B): felpa mate, estampado algo más liso.
  const roughOut = Buffer.alloc(count * 3);
  for (let index = 0; index < count; index++) {
    const print = printMask[index * 4] / 255;
    roughOut[index * 3] = 255;
    roughOut[index * 3 + 1] = Math.round(255 * (1 - print * 0.25));
    roughOut[index * 3 + 2] = 0;
  }

  const png = (buffer) => sharp(buffer, { raw: { width: size, height: size, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
  const [baseColor, normal, roughness] = await Promise.all([png(colorOut), png(normalOut), png(roughOut)]);
  return { baseColor, normal, roughness };
}
