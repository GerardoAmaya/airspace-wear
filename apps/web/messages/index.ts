import type { Locale } from '@airspace/contracts';

// Mensajes de la web: un archivo base por idioma (messages/<idioma>.json) y
// uno por sección de la home (messages/home/<sección>.<idioma>.json), cada
// uno con su propio espacio de nombres. Se fusionan aquí. Todos los archivos
// de un idioma deben tener exactamente las mismas llaves que los del otro.
const SECTIONS = ['hero', 'board', 'apparel', 'balls', 'stylist'] as const;

export async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  const base = (await import(`./${locale}.json`)).default as Record<string, unknown>;
  const sections = await Promise.all(SECTIONS.map(async (section) => (await import(`./home/${section}.${locale}.json`)).default as Record<string, unknown>));
  return Object.assign({}, base, ...sections);
}
