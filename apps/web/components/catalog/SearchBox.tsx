'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import { getPathname, useRouter } from '@/i18n/navigation';
import { usePendingMark } from '@/lib/catalog-pending';
import { type CatalogState, catalogHref, cleanQuery, QUERY_MAX } from '@/lib/catalog-query';
import styles from './CatalogToolbar.module.css';

// Espera antes de buscar mientras se escribe.
const DEBOUNCE_MS = 300;

// Buscador del catálogo. Es un formulario GET real (sin JS, Enter recarga con
// ?q= y los demás filtros en campos ocultos). Con JS busca solo al dejar de
// escribir (router.replace, sin sumar historial ni mover el scroll) y Enter
// busca al instante. La página siempre vuelve a la 1. La página lo pone en su
// cascarón estático (respaldo de Suspense con el estado vacío), así el
// formulario está aunque no corra JS ni llegue el streaming.
export function SearchBox({ state }: { state: CatalogState }) {
  const t = useTranslations('Catalog');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Mientras llega el resultado, la rejilla se atenúa (ResultsRegion).
  usePendingMark(pending);
  const [value, setValue] = useState(state.q ?? '');
  // Última búsqueda enviada por este campo: si la URL cambia por otro motivo
  // (una píldora, "Limpiar todo", atrás), el campo toma el valor de la URL;
  // si es la respuesta a lo que se está escribiendo, no se pisa lo tecleado.
  const [sent, setSent] = useState(state.q);
  const [urlQuery, setUrlQuery] = useState(state.q);
  if (state.q !== urlQuery) {
    setUrlQuery(state.q);
    if (state.q !== sent) {
      setValue(state.q ?? '');
      setSent(state.q);
    }
  }
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const search = (raw: string) => {
    window.clearTimeout(timer.current);
    const q = cleanQuery(raw);
    if (q === state.q) return;
    setSent(q);
    startTransition(() => router.replace(catalogHref({ ...state, q }), { scroll: false }));
  };

  const onChange = (next: string) => {
    setValue(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => search(next), DEBOUNCE_MS);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    search(value);
  };

  const clear = () => {
    setValue('');
    search('');
    document.getElementById('catalog-search')?.focus();
  };

  // Campos ocultos: sin JS, el envío conserva los demás filtros (sin página).
  const hidden = Object.entries(catalogHref({ ...state, q: undefined }).query);

  return (
    <form role="search" className={styles.search} action={getPathname({ href: '/catalog', locale })} method="get" onSubmit={onSubmit} aria-busy={pending || undefined}>
      <label htmlFor="catalog-search" className="visually-hidden">
        {t('searchLabel')}
      </label>
      <svg className={styles.searchIcon} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        id="catalog-search"
        className={styles.searchInput}
        type="search"
        name="q"
        value={value}
        maxLength={QUERY_MAX}
        placeholder={t('searchLabel')}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Escape con texto: borra la búsqueda (como el buscador nativo).
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            clear();
          }
        }}
      />
      {hidden.map(([name, field]) => (
        <input key={name} type="hidden" name={name} value={field} />
      ))}
      {/* El botón siempre ocupa su lugar (no mueve nada al aparecer). */}
      <button type="button" className={styles.searchClear} aria-label={t('clearSearch')} onClick={clear} data-empty={!value || undefined}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="m4 4 8 8M12 4l-8 8" />
        </svg>
      </button>
    </form>
  );
}
