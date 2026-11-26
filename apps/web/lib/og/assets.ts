import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cacheLife } from 'next/cache';
import sharp from 'sharp';
import { SITE_URL } from '@/lib/seo';

// Recursos de las imágenes para compartir (Open Graph / Twitter), generadas
// con ImageResponse de next/og. Todo va en caché ("use cache"): las fuentes y
// la paleta no cambian entre despliegues, y un póster cambia solo si se vuelve
// a renderizar el modelo.

// ---------- Paleta ----------

// ImageResponse dibuja fuera del navegador y no entiende var(--token), así
// que los colores se leen de styles/tokens.css (el bloque del tema oscuro, la
// paleta de marca) en vez de copiarlos aquí: los tokens siguen siendo la
// única fuente. join(process.cwd(), ...) con una ruta fija deja que Next
// incluya el archivo en la función del servidor.
const PALETTE_TOKENS = {
  background: '--color-background',
  surface: '--color-surface',
  surfaceRaised: '--color-surface-raised',
  primary: '--color-primary',
  text: '--color-text',
  textMuted: '--color-text-muted',
  textFaint: '--color-text-faint',
} as const;

export type OgPalette = Record<keyof typeof PALETTE_TOKENS, string>;

export async function loadPalette(): Promise<OgPalette> {
  'use cache';
  cacheLife('max');
  const css = await readFile(join(process.cwd(), 'styles/tokens.css'), 'utf8');
  // El primer bloque :root es el tema oscuro.
  const dark = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
  const entries = Object.entries(PALETTE_TOKENS).map(([key, token]) => {
    const value = new RegExp(`${token}:\\s*([^;]+);`).exec(dark)?.[1]?.trim();
    if (!value) throw new Error(`OG: falta ${token} en styles/tokens.css`);
    return [key, value];
  });
  return Object.fromEntries(entries) as OgPalette;
}

// ---------- Fuentes ----------

// ImageResponse solo lee TTF, OTF o WOFF, y no maneja ejes variables. La API
// de Google Fonts, pedida sin agente de navegador, responde con TTF, y con un
// valor fijo por eje entrega una instancia estática (por ejemplo Hubot Sans
// con ancho 125 y peso 800, como los títulos del sitio). Se descargan una
// vez y quedan en caché. Si Google no responde, la imagen sale igual con la
// fuente por defecto de next/og (y el fallo no se guarda en caché: se lanza
// dentro de la función en caché y se atrapa fuera).
const FONTS = [
  { name: 'display', family: 'Hubot+Sans:wdth,wght@125,800', weight: 800 },
  { name: 'body', family: 'Mona+Sans:wght@500', weight: 500 },
  { name: 'body', family: 'Mona+Sans:wght@700', weight: 700 },
  { name: 'mono', family: 'Martian+Mono:wght@500', weight: 500 },
] as const;

export type OgFont = { name: string; data: ArrayBuffer; weight: 500 | 700 | 800; style: 'normal' };

async function fetchFontFile(family: string): Promise<ArrayBuffer> {
  'use cache';
  cacheLife('max');
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}`, { signal: AbortSignal.timeout(5000) })).text();
  const url = /src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/.exec(css)?.[1];
  if (!url) throw new Error(`OG: Google Fonts no devolvió un TTF para ${family}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`OG: fuente ${family} respondió ${response.status}`);
  return response.arrayBuffer();
}

export async function loadFonts(): Promise<OgFont[]> {
  const files = await Promise.all(FONTS.map((font) => fetchFontFile(font.family).catch(() => null)));
  return FONTS.flatMap((font, index) => {
    const data = files[index];
    return data ? [{ name: font.name, data, weight: font.weight, style: 'normal' as const }] : [];
  });
}

// ---------- Pósters ----------

// Póster de un producto (tema oscuro) como data URL. Se lee del disco
// (public/posters, disponible al prerenderizar); si no está, por ejemplo al
// regenerar en una función de Vercel, se pide al propio sitio. Devuelve null
// si no hay póster: la imagen usa entonces su versión sin zapato.
// Los pósters son WebP y el motor de ImageResponse (resvg) no dibuja WebP:
// sharp (la misma librería de imágenes de Next) los pasa a PNG con su
// transparencia, a un ancho de sobra para la tarjeta.
const POSTER_PATH = /^\/posters\/[a-z0-9-]+\.webp$/;
const POSTER_WIDTH = 1000;

async function readPoster(path: string): Promise<string> {
  'use cache';
  cacheLife('days');
  let bytes: Buffer;
  try {
    bytes = await readFile(join(process.cwd(), 'public', path));
  } catch {
    const response = await fetch(new URL(path, SITE_URL), { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`OG: póster ${path} respondió ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const png = await sharp(bytes).resize({ width: POSTER_WIDTH, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

export async function loadPoster(path: string | null | undefined): Promise<string | null> {
  if (!path || !POSTER_PATH.test(path)) return null;
  return readPoster(path).catch(() => null);
}
