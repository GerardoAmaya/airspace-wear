import type { Price } from '@airspace/contracts';

// Precio en dólares según el idioma, siempre con Intl (nunca concatenando):
// - es: estilo latinoamericano "US$180". Intl con "es" escribe "180 US$" y
//   con "es-419" escribe "USD 180", así que se parte de es-419 y se cambia
//   solo el símbolo de moneda por "US$" (sin espacio).
// - en: "$180".
const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, currency: string): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale === 'es' ? 'es-419' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
    formatters.set(key, format);
  }
  return format;
}

export function formatPrice({ amountCents, currency }: Price, locale: string): string {
  const parts = formatter(locale, currency).formatToParts(amountCents / 100);
  if (locale !== 'es' || currency !== 'USD') return parts.map((part) => part.value).join('');
  return parts
    .filter((part, index) => !(part.type === 'literal' && parts[index - 1]?.type === 'currency'))
    .map((part) => (part.type === 'currency' ? 'US$' : part.value))
    .join('');
}
