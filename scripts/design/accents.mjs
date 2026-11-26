// Propuesta de acento por producto: a partir de un tono base (sacado del
// propio tenis o balón) calcula dos tintas que pasan AA (4.5:1) para texto:
// una para el tema oscuro (sobre #0E0E10 y #1C1C21) y otra para el claro
// (sobre #F4F1EA y #FBF9F4). Escribe design/prototype/dev/accents.json, que
// lee la lámina /dev/accents.html.
//
// Uso: node scripts/design/accents.mjs

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT_DIR } from '../models/config.mjs';

// Tono base de cada producto y por qué.
const BASES = {
  'jordan-4-travis-scott': ['#a855f7', 'morado del forro'],
  'nike-dunk-high-hawaii': ['#2dd4bf', 'turquesa del estampado floral'],
  'adidas-prophere': ['#c2b280', 'caqui del camuflaje'],
  'adidas-gazelle': ['#22c55e', 'verde de la gamuza'],
  'nike-air-uptempo': ['#d4d4d8', 'blanco y negro: acento neutro'],
  'jordan-4-university-blue': ['#60a5fa', 'azul universitario'],
  'air-jordan-1': ['#e7dcc4', 'vela (sail): acento neutro cálido'],
  'new-balance-997': ['#94a3b8', 'gris pizarra'],
  'adidas-samba': ['#e4e4e7', 'blanco y negro: acento neutro'],
  'adidas-sambae': ['#f59e0b', 'ámbar de la goma translúcida'],
  'adidas-basketball': ['#ec4899', 'rosa del corte'],
  'air-jordan-1-mid-particle-beige': ['#eab308', 'mostaza del logo'],
  'nike-pegasus-36': ['#818cf8', 'gris azulado: periwinkle'],
  'adidas-trionda-2026': ['#d4af37', 'dorado de la final'],
  'adidas-al-rihla-2022': ['#22d3ee', 'cian de sus trazos'],
  'adidas-jabulani-2010': ['#f87171', 'rojo de sus paneles'],
  'adidas-teamgeist-2006': ['#fbbf24', 'dorado de Berlín'],
  'adidas-telstar-1970': ['#e5e7eb', 'blanco y negro: acento neutro'],
};

const DARK_BACKGROUNDS = ['#0e0e10', '#1c1c21'];
const LIGHT_BACKGROUNDS = ['#f4f1ea', '#fbf9f4'];
const TARGET = 4.6; // un poco sobre 4.5 para tener margen

const toRgb = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
const toHex = (rgb) => `#${rgb.map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('')}`;
const luminance = (hex) => {
  const [r, g, b] = toRgb(hex).map((value) => value / 255).map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
const minContrast = (hex, backgrounds) => Math.min(...backgrounds.map((background) => contrast(hex, background)));

// Mezcla el tono con blanco (oscuro) o con negro (claro) hasta pasar el umbral.
function ink(base, toward, backgrounds) {
  const [r, g, b] = toRgb(base);
  const target = toward === 'white' ? 255 : 0;
  for (let step = 0; step <= 100; step += 1) {
    const mix = step / 100;
    const candidate = toHex([r + (target - r) * mix, g + (target - g) * mix, b + (target - b) * mix]);
    if (minContrast(candidate, backgrounds) >= TARGET) return candidate;
  }
  throw new Error(`Sin tinta posible para ${base}`);
}

const accents = Object.fromEntries(
  Object.entries(BASES).map(([slug, [base, reason]]) => {
    const dark = ink(base, 'white', DARK_BACKGROUNDS);
    const light = ink(base, 'black', LIGHT_BACKGROUNDS);
    return [
      slug,
      {
        base,
        reason,
        dark,
        light,
        contrastDark: Number(minContrast(dark, DARK_BACKGROUNDS).toFixed(2)),
        contrastLight: Number(minContrast(light, LIGHT_BACKGROUNDS).toFixed(2)),
      },
    ];
  }),
);

const file = path.join(ROOT_DIR, 'design/prototype/dev/accents.json');
await writeFile(file, `${JSON.stringify(accents, null, 2)}\n`);
for (const [slug, accent] of Object.entries(accents)) {
  console.log(`${slug.padEnd(34)} oscuro ${accent.dark} (${accent.contrastDark}:1)  claro ${accent.light} (${accent.contrastLight}:1)`);
}
