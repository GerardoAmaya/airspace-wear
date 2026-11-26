import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';

// Dirección pública del sitio: convierte en absolutas las URLs de los
// metadatos (hreflang y canónica exigen URLs completas). Se lee en el
// servidor al prerenderizar; ver SITE_URL en .env.example.
export const SITE_URL = new URL(process.env.SITE_URL ?? 'http://localhost:3000');

// Canónica y versiones por idioma de una ruta (sin prefijo de idioma, por
// ejemplo '/catalog' o '' para la home). x-default apunta al español.
export function localeAlternates(locale: string, path: string): Metadata['alternates'] {
  const languages: Record<string, string> = Object.fromEntries(routing.locales.map((code) => [code, `/${code}${path}`]));
  languages['x-default'] = `/${routing.defaultLocale}${path}`;
  return { canonical: `/${locale}${path}`, languages };
}
