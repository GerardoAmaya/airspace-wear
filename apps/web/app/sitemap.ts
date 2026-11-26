import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { getProducts } from '@/lib/api';
import { HANGAR_ENABLED } from '@/lib/avatar/avatar';
import { absoluteLanguages, absoluteUrl } from '@/lib/seo';

// /sitemap.xml: las páginas fijas y cada ficha publicada, en ambos idiomas,
// cada una con sus versiones por idioma (hreflang). El Hangar 360° entra solo
// si está activo (sin avatar responde 404). Las fichas salen de la lista del
// catálogo en caché; si la API no responde, el sitemap trae al menos las
// páginas fijas en vez de romper el build o responder con error.
const STATIC_PATHS = ['', '/catalog', '/balls', '/club', '/credits', '/legal', ...(HANGAR_ENABLED ? ['/hangar'] : [])];

async function productPaths(): Promise<string[]> {
  try {
    // Los slugs son los mismos en ambos idiomas: basta con la lista en español.
    const { items } = await getProducts({ locale: routing.defaultLocale });
    return items.map((item) => `/products/${item.slug}`);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = [...STATIC_PATHS, ...(await productPaths())];
  return paths.flatMap((path) => {
    const languages = absoluteLanguages(path);
    return routing.locales.map((locale) => ({ url: absoluteUrl(`/${locale}${path}`), alternates: { languages } }));
  });
}
