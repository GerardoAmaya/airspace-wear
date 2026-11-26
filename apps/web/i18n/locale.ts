import type { Locale } from '@airspace/contracts';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

// Idioma del segmento [locale] de una página. Algunas rutas llegan sin pasar
// por el proxy (las que empiezan por api/, models/, vendor/, _vercel/...), y
// entonces el "idioma" puede ser cualquier cosa, como /models/balls. Sin este
// control la página pedía datos a la API con ese valor, la API respondía 400
// y la página fallaba con un 500. Así responde 404.
export function pageLocale(raw: string): Locale {
  if (!hasLocale(routing.locales, raw)) notFound();
  return raw;
}
