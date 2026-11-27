// Paginación del catálogo. Se pagina en la web sobre la lista completa en
// caché (unos 74 productos): la API sigue devolviendo la lista entera, así
// los conteos, el sitemap y la home leen la misma entrada de caché.

// Productos por página (escritorio y teléfono).
export const PAGE_SIZE = 12;

// Id del bloque de resultados (conteo, rejilla y paginador): destino del
// salto al cambiar de página.
export const RESULTS_ID = 'catalog-results';

// Lee ?page de la URL. undefined: no viene (página 1). null: viene pero no es
// un entero positivo (abc, 0, -2, 2.5, repetido), así que hay que corregirla.
export function parsePageParam(raw: string | string[] | undefined): number | null | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !/^\d{1,4}$/.test(raw)) return null;
  const page = Number(raw);
  return page >= 1 ? page : null;
}

// Cantidad de páginas (al menos 1, aunque no haya resultados).
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

// Primer y último índice (base 1) de la página, para "Mostrando 13 a 24 de 74".
export function pageRange(page: number, total: number): { start: number; end: number } {
  return { start: Math.min(total, (page - 1) * PAGE_SIZE + 1), end: Math.min(total, page * PAGE_SIZE) };
}

export function pageItems<T>(items: T[], page: number): T[] {
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

// Números a mostrar en el paginador: la primera, la última y las vecinas de
// la actual, con un hueco ('gap') donde se saltan páginas. Con 7 o menos se
// muestran todas. Un hueco de una sola página se llena con su número.
export function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = [...new Set([1, current - 1, current, current + 1, total])].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  for (const page of pages) {
    const previous = result.at(-1);
    if (typeof previous === 'number' && page - previous === 2) result.push(previous + 1);
    else if (typeof previous === 'number' && page - previous > 2) result.push('gap');
    result.push(page);
  }
  return result;
}
