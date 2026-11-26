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
const PRODUCT_PATH = /^\/(es|en)\/products\/([^/]+)\/?$/;
let slugs: { value: Set<string>; expires: number } | null = null;

async function knownSlugs(): Promise<Set<string> | null> {
  if (slugs && slugs.expires > Date.now()) return slugs.value;
  try {
    // Los slugs son los mismos en ambos idiomas: basta con la lista en español.
    const response = await fetch(`${API_URL}/v1/products?locale=${routing.defaultLocale}`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { items?: Array<{ slug?: unknown }> };
    const value = new Set((body.items ?? []).flatMap((item) => (typeof item.slug === 'string' ? [item.slug] : [])));
    slugs = { value, expires: Date.now() + SLUGS_TTL_MS };
    return value;
  } catch {
    return null;
  }
}

export default async function proxy(request: NextRequest) {
  const match = PRODUCT_PATH.exec(request.nextUrl.pathname);
  if (match) {
    const known = await knownSlugs();
    if (known && !known.has(decodeURIComponent(match[2]!))) {
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
  // Todo menos archivos estáticos (modelos, decodificador, pósters) e internos.
  matcher: '/((?!api|_next|_vercel|models|vendor|posters|.*\\..*).*)',
};
