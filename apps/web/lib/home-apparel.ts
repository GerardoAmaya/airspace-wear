// Prendas fijas de la sección "Ropa" de la home, en este orden (elegidas por
// el dueño). Si alguna no está publicada, se completa con el resto del
// catálogo en el orden de la API. Función pura: la usan la home y las pruebas.
export const HOME_APPAREL_COUNT = 6;
export const HOME_APPAREL = [
  'chaqueta-adidas-negra',
  'chaqueta-acolchada-roja',
  'gorra-ny-59fifty-marino',
  'gorra-adidas-negra',
  'camiseta-run-turquesa',
  'short-geff-negro-naranja',
];

export function pickHomeApparel<T extends { slug: string }>(items: T[]): T[] {
  const picked = HOME_APPAREL.flatMap((slug) => items.filter((item) => item.slug === slug));
  const rest = items.filter((item) => !HOME_APPAREL.includes(item.slug));
  return [...picked, ...rest].slice(0, HOME_APPAREL_COUNT);
}
