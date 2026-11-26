import { type NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Proxy de Next 16 (antes middleware): redirige "/" al idioma que toca y
// agrega el prefijo de idioma a cada ruta.
const intl = createMiddleware(routing);

// Fichas que no existen: con Cache Components la página envía su cascarón
// prerenderizado (estado 200) antes de que corra notFound(), y el 404 queda
// solo como <meta robots noindex> (un "soft 404"). El estado real solo se
// puede fijar aquí, antes de renderizar (ver la guía de streaming de Next,
// "The HTTP contract"). Se consulta la lista de slugs de la API, guardada en
// memoria unos minutos; si la API no responde, la petición sigue igual y la
// página resuelve como siempre.
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const SLUGS_TTL_MS = 5 * 60 * 1000;
// Si un slug no aparece y la lista tiene más de esto, se vuelve a pedir una
// vez antes de responder 404: así un producto recién publicado no da 404
// durante los minutos que dura la lista en memoria.
const SLUGS_RECHECK_MS = 15 * 1000;
const PRODUCT_PATH = /^\/(es|en)\/products\/([^/]+)\/?$/;
let slugs: { value: Set<string>; expires: number; fetchedAt: number } | null = null;

async function knownSlugs(force = false): Promise<Set<string> | null> {
  if (!force && slugs && slugs.expires > Date.now()) return slugs.value;
  try {
    // Los slugs son los mismos en ambos idiomas: basta con la lista en español.
    const response = await fetch(`${API_URL}/v1/products?locale=${routing.defaultLocale}`, { headers: process.env.INTERNAL_API_KEY ? { 'x-internal-key': process.env.INTERNAL_API_KEY } : {}, signal: AbortSignal.timeout(2000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { items?: Array<{ slug?: unknown }> };
    const value = new Set((body.items ?? []).flatMap((item) => (typeof item.slug === 'string' ? [item.slug] : [])));
    slugs = { value, expires: Date.now() + SLUGS_TTL_MS, fetchedAt: Date.now() };
    return value;
  } catch {
    return null;
  }
}

// Rutas con punto fuera de un idioma (/x.txt, /wp-login.php, /.env): antes
// el matcher las dejaba pasar sin proxy, Next las tomaba como /[locale] con
// "x.txt" de idioma y la home fallaba con un 500. Ahora responden con el 404
// del sitio en el idioma guardado (cookie de next-intl) o el predeterminado,
// sin redirigir: un archivo que no existe no tiene versión en otro idioma.
const LOCALE_PREFIX = new RegExp(`^/(${routing.locales.join('|')})(/|$)`);
const FILE_LIKE = /\.[^/]*$/;

function notFoundLocale(request: NextRequest): string {
  const saved = request.cookies.get('NEXT_LOCALE')?.value;
  return routing.locales.find((locale) => locale === saved) ?? routing.defaultLocale;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (FILE_LIKE.test(pathname) && !LOCALE_PREFIX.test(pathname)) {
    return NextResponse.rewrite(new URL(`/${notFoundLocale(request)}/not-found`, request.url));
  }
  const match = PRODUCT_PATH.exec(pathname);
  if (match) {
    const slug = decodeURIComponent(match[2]!);
    let known = await knownSlugs();
    if (known && !known.has(slug) && slugs && Date.now() - slugs.fetchedAt > SLUGS_RECHECK_MS) known = await knownSlugs(true);
    if (known && !known.has(slug)) {
      // Se reescribe (la URL no cambia) a una ruta que no existe dentro del
      // idioma: Next responde con not-found.tsx en ese idioma y estado 404 de
      // verdad. Reescribir a la misma ficha con { status: 404 } no basta: la
      // primera visita sale igual con 200 por el streaming.
      return NextResponse.rewrite(new URL(`/${match[1]}/products-not-found`, request.url));
    }
  }
  return intl(request);
}

export const config = {
  // Todo menos las carpetas de archivos estáticos (modelos, decodificador,
  // pósters, efectos como el atlas del humo), las rutas internas y los archivos de metadatos de app/. Las
  // carpetas llevan la barra final para que /models.txt sí pase por aquí.
  // Las rutas con punto también pasan: ver FILE_LIKE arriba.
  // avatar-local/ es la copia del avatar para desarrollo (ignorada por git).
  // sitemap.xml queda fuera como robots.txt: si no, FILE_LIKE lo mandaba al 404.
  matcher: '/((?!api/|_next/|_vercel/|models/|vendor/|posters/|fx/|avatar-local/|robots\\.txt|sitemap\\.xml|icon\\.svg).*)',
};
