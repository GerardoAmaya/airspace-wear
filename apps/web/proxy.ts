import { type Locale, type ProductCard, productListSchema } from '@airspace/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { catalogHref, facetProducts, parseCatalogState, searchText } from './lib/catalog-query';
import { pageCount, parsePageParam } from './lib/pagination';
import en from './messages/en.json';
import es from './messages/es.json';

// Proxy de Next 16 (antes middleware): redirige "/" al idioma que toca y
// agrega el prefijo de idioma a cada ruta.
const intl = createMiddleware(routing);

// Fichas que no existen: con Cache Components la página envía su cascarón
// prerenderizado (estado 200) antes de que corra notFound(), y el 404 queda
// solo como <meta robots noindex> (un "soft 404"). El estado real solo se
// puede fijar aquí, antes de renderizar (ver la guía de streaming de Next,
// "The HTTP contract"). Se consulta la lista de slugs de la API, guardada en
// memoria unos minutos (productList, abajo); si la API no responde, la
// petición sigue igual y la página resuelve como siempre.
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const LIST_TTL_MS = 5 * 60 * 1000;
// Si un slug no aparece y la lista tiene más de esto, se vuelve a pedir una
// vez antes de responder 404: así un producto recién publicado no da 404
// durante los minutos que dura la lista en memoria.
const SLUGS_RECHECK_MS = 15 * 1000;
const PRODUCT_PATH = /^\/(es|en)\/products\/([^/]+)\/?$/;
const lists = new Map<Locale, { items: ProductCard[]; expires: number; fetchedAt: number }>();

// Lista de productos de un idioma (la misma que pide el catálogo), guardada
// en memoria unos minutos. null si la API no responde o la respuesta no es
// válida: quien la pide deja pasar la petición sin tocarla.
async function productList(locale: Locale, force = false): Promise<ProductCard[] | null> {
  const cached = lists.get(locale);
  if (!force && cached && cached.expires > Date.now()) return cached.items;
  try {
    const response = await fetch(`${API_URL}/v1/products?locale=${locale}`, { headers: process.env.INTERNAL_API_KEY ? { 'x-internal-key': process.env.INTERNAL_API_KEY } : {}, signal: AbortSignal.timeout(2000) });
    if (!response.ok) return null;
    const parsed = productListSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    lists.set(locale, { items: parsed.data.items, expires: Date.now() + LIST_TTL_MS, fetchedAt: Date.now() });
    return parsed.data.items;
  } catch {
    return null;
  }
}

// Los slugs son los mismos en ambos idiomas: basta con la lista en español.
async function knownSlugs(force = false): Promise<Set<string> | null> {
  const items = await productList(routing.defaultLocale, force);
  return items ? new Set(items.map((item) => item.slug)) : null;
}

// Páginas del catálogo que no existen (?page=abc, 0, 1 escrita a mano o más
// allá de la última): la página lo corrige con redirect(), pero ya empezó a
// enviarse, así que sale como un 200 con redirección en el cliente. Aquí se
// responde antes con una redirección HTTP de verdad: 308 a la URL sin página
// cuando el valor no sirve (no depende de nada que cambie) y 307 a la última
// cuando se pasa del final (el total sí cambia con el catálogo). Para contar
// se usa el mismo filtro que la página (facetProducts y searchText, con los
// nombres de categoría y tipo de prenda de los mensajes, porque la búsqueda
// también los mira). Sin respuesta de la API, la petición sigue y la página
// redirige como antes.
const CATALOG_PATH = /^\/(es|en)\/catalog\/?$/;
const CATALOG_LABELS: Record<Locale, { category: Record<string, string>; subcategory: Record<string, string> }> = { es: es.Catalog, en: en.Catalog };

async function catalogPageRedirect(request: NextRequest, locale: Locale): Promise<NextResponse | null> {
  const params = request.nextUrl.searchParams;
  if (!params.has('page')) return null;
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    query[key] = values.length === 1 ? values[0]! : values;
  }
  const requested = parsePageParam(query.page);
  const state = parseCatalogState(query);
  let target = 1;
  let status = 308;
  if (requested !== null && requested !== undefined && requested > 1) {
    const items = await productList(locale);
    if (!items) return null;
    const labels = CATALOG_LABELS[locale];
    const total = facetProducts(items, state, (product) => searchText(product, { category: labels.category[product.category] ?? '', subcategory: product.subcategory ? labels.subcategory[product.subcategory] : undefined })).results.length;
    const last = pageCount(total);
    if (requested <= last) return null;
    target = last;
    status = 307;
  }
  const url = request.nextUrl.clone();
  url.search = new URLSearchParams(catalogHref(state, target).query).toString();
  return NextResponse.redirect(url, status);
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
    // Un % mal formado (/es/products/%E0%A4%A) hacía fallar el proxy con un
    // 500: responde 400, como Next con cualquier otra ruta mal codificada.
    let slug: string;
    try {
      slug = decodeURIComponent(match[2]!);
    } catch {
      return new NextResponse(null, { status: 400 });
    }
    let known = await knownSlugs();
    const fetchedAt = lists.get(routing.defaultLocale)?.fetchedAt;
    if (known && !known.has(slug) && fetchedAt && Date.now() - fetchedAt > SLUGS_RECHECK_MS) known = await knownSlugs(true);
    if (known && !known.has(slug)) {
      // Se reescribe (la URL no cambia) a una ruta que no existe dentro del
      // idioma: Next responde con not-found.tsx en ese idioma y estado 404 de
      // verdad. Reescribir a la misma ficha con { status: 404 } no basta: la
      // primera visita sale igual con 200 por el streaming.
      return NextResponse.rewrite(new URL(`/${match[1]}/products-not-found`, request.url));
    }
  }
  const catalog = CATALOG_PATH.exec(pathname);
  if (catalog) {
    const response = await catalogPageRedirect(request, catalog[1] as Locale);
    if (response) return response;
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
  matcher: '/((?!api/|_next/|_vercel/|models/|vendor/|posters/|fx/|avatar-local/|avatar-fit/|robots\\.txt|sitemap\\.xml|icon\\.svg).*)',
};
