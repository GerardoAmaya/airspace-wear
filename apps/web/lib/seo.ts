import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

// Dirección pública del sitio: convierte en absolutas las URLs de los
// metadatos (hreflang y canónica exigen URLs completas). Se lee en el
// servidor al prerenderizar; ver SITE_URL en .env.example.
export const SITE_URL = new URL(process.env.SITE_URL ?? 'http://localhost:3000');

// Rutas de cada idioma para una ruta sin prefijo (por ejemplo '/catalog' o ''
// para la home). x-default apunta al español.
function localePaths(path: string): Record<string, string> {
  const languages: Record<string, string> = Object.fromEntries(routing.locales.map((code) => [code, `/${code}${path}`]));
  languages['x-default'] = `/${routing.defaultLocale}${path}`;
  return languages;
}

// URL absoluta de una ruta del sitio.
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

// Canónica y versiones por idioma de una ruta, para los metadatos de una página.
export function localeAlternates(locale: string, path: string): Metadata['alternates'] {
  return { canonical: `/${locale}${path}`, languages: localePaths(path) };
}

// Las mismas versiones por idioma con URLs absolutas (el sitemap no usa metadataBase).
export function absoluteLanguages(path: string): Record<string, string> {
  return Object.fromEntries(Object.entries(localePaths(path)).map(([code, href]) => [code, absoluteUrl(href)]));
}
