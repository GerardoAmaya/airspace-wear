'use client';

import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useId, useRef, useState } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { accentProps } from '@/lib/accent';
import { useMotionStore } from '@/lib/motion/store';
import type { HangarProduct } from './HangarStudio';
import { DEFAULT_SHOE_FILTER, SHOE_TYPES, type ShoeFilter, useOutfitStore, useShoeFilter } from './outfit-store';
import { prefetch, shoeUrl } from './prefetch';
import styles from './ShoePicker.module.css';

// Marca derivada: los Jordan vienen con marca Nike, se reconocen por el nombre.
const JORDAN = 'Jordan';
const isJordan = (item: HangarProduct) => /\bjordan\b/i.test(item.name);

// Texto comparable: minúsculas y sin acentos ("Fútbol" = "futbol").
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const matchesQuery = (item: HangarProduct, words: string[]) => {
  const haystack = fold(`${item.name} ${item.brand}`);
  return words.every((word) => haystack.includes(word));
};
const matchesBrand = (item: HangarProduct, brand: string | null) =>
  !brand || item.brand === brand || (brand === JORDAN && isJordan(item));
const matchesType = (item: HangarProduct, type: ShoeFilter['type']) => type === 'all' || item.category === type;

// Chips de marca: Todas y las marcas presentes (más pares primero); Jordan va
// justo después de Nike si algún nombre lo lleva.
function brandList(products: HangarProduct[]): string[] {
  const counts = new Map<string, number>();
  for (const item of products) counts.set(item.brand, (counts.get(item.brand) ?? 0) + 1);
  const brands = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  if (!counts.has(JORDAN) && products.some(isJordan)) {
    const nike = brands.indexOf('Nike');
    brands.splice(nike < 0 ? brands.length : nike + 1, 0, JORDAN);
  }
  return brands;
}

// Pestaña "Zapatos": encabezado fijo con búsqueda, chips de marca y tipo,
// y debajo la cuadrícula de pósters que se desplaza. Las tarjetas siguen su
// orden natural y no se mueven al elegir: solo cambia el estado "Puesto". Si
// los filtros dejan fuera el par puesto, sigue visible al final con una nota.
// Pasar el cursor o enfocar una tarjeta pide su GLB por adelantado.
export function ShoePicker({ products, current, onSelect }: { products: HangarProduct[]; current: string; onSelect(slug: string): void }) {
  const t = useTranslations('Hangar');
  const id = useId();
  const lite = useMotionStore((state) => state.lite);
  const filter = useShoeFilter();
  const setFilter = useOutfitStore((state) => state.setShoeFilter);
  const clearFilter = useOutfitStore((state) => state.clearShoeFilter);
  const input = useRef<HTMLInputElement>(null);
  // Borrar la búsqueda devuelve el foco al campo (el botón desaparece).
  const clearQuery = () => {
    setFilter({ query: '' });
    input.current?.focus();
  };

  const brands = brandList(products);
  // Una marca guardada que ya no está en los datos no filtra nada.
  const brand = filter.brand && brands.includes(filter.brand) ? filter.brand : null;
  const words = fold(filter.query).split(/\s+/).filter(Boolean);
  // Conteos por marca con la búsqueda y el tipo ya aplicados.
  const base = products.filter((item) => matchesQuery(item, words) && matchesType(item, filter.type));
  const results = base.filter((item) => matchesBrand(item, brand));
  const active = !!words.length || !!brand || filter.type !== DEFAULT_SHOE_FILTER.type;
  const worn = products.find((item) => item.slug === current);
  const outside = !!worn && !results.includes(worn);
  // Los resultados en su orden; el par puesto fuera de los filtros va al final.
  const cards = worn && outside ? [...results, worn] : results;

  // Aviso para lectores de pantalla al cambiar de par (la lista no se mueve).
  const [announce, setAnnounce] = useState('');

  const select = (item: HangarProduct) => {
    if (item.slug === current) return;
    setAnnounce(t('filters.wornAnnounce', { name: item.name }));
    onSelect(item.slug);
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' || !filter.query) return;
    event.preventDefault();
    setFilter({ query: '' });
  };

  const card = (item: HangarProduct) => (
    <li key={item.slug} data-key={item.slug} {...accentProps(item.accent)}>
      <button
        type="button"
        className={styles.card}
        aria-pressed={item.slug === current}
        aria-label={t('pickerItem', { name: item.name })}
        aria-describedby={item === worn && outside ? `${id}-outside` : undefined}
        onClick={() => select(item)}
        onPointerEnter={() => prefetch(shoeUrl(item.model, lite))}
        onFocus={() => prefetch(shoeUrl(item.model, lite))}
      >
        {item.model.poster && <ThemedPoster poster={item.model.poster} alt="" sizes="160px" className={styles.poster} />}
        <span className={styles.name}>{item.name}</span>
        {item.slug === current && (
          <span className={styles.worn} aria-hidden="true">
            {t('filters.worn')}
          </span>
        )}
        {item === worn && outside && (
          <span id={`${id}-outside`} className={styles.outside}>
            {t('filters.outOfFilter')}
          </span>
        )}
      </button>
    </li>
  );

  return (
    <div className={styles.root}>
      <div className={styles.filters} role="search" aria-label={t('filters.label')}>
        <div className={styles.search}>
          <label htmlFor={`${id}-search`} className="visually-hidden">
            {t('filters.search')}
          </label>
          <svg className={styles.searchIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
          <input
            ref={input}
            id={`${id}-search`}
            className={styles.input}
            type="search"
            value={filter.query}
            placeholder={t('filters.search')}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={60}
            onChange={(event) => setFilter({ query: event.target.value })}
            onKeyDown={onSearchKey}
          />
          {filter.query && (
            <button type="button" className={styles.clearSearch} aria-label={t('filters.clearSearch')} onClick={clearQuery}>
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          )}
        </div>

        <div className={styles.brands} role="group" aria-label={t('filters.brands')}>
          <button type="button" className={styles.chip} aria-pressed={!brand} onClick={() => setFilter({ brand: null })}>
            {t('filters.allBrands')}
            <span className={styles.count}>{base.length}</span>
          </button>
          {brands.map((name) => {
            const count = base.filter((item) => matchesBrand(item, name)).length;
            return (
              <button
                key={name}
                type="button"
                className={styles.chip}
                aria-pressed={brand === name}
                data-empty={count === 0 || undefined}
                onClick={() => setFilter({ brand: brand === name ? null : name })}
              >
                {name}
                <span className={styles.count}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.types} role="group" aria-label={t('filters.type')}>
          {SHOE_TYPES.map((type) => (
            <button key={type} type="button" className={styles.type} aria-pressed={filter.type === type} onClick={() => setFilter({ type })}>
              {t(`filters.types.${type}`)}
            </button>
          ))}
        </div>

        <div className={styles.meta}>
          <p className={styles.status} role="status" aria-live="polite">
            {results.length ? t('filters.count', { count: results.length }) : t('filters.empty')}
          </p>
          {active && (
            <button type="button" className={styles.clear} onClick={clearFilter}>
              {t('filters.clear')}
            </button>
          )}
        </div>
      </div>

      <section className={styles.picker} aria-label={t('pickerLabel')}>
        <ul className={styles.cards}>
          {cards.map((item) => card(item))}
        </ul>
        <p className="visually-hidden" aria-live="polite">
          {announce}
        </p>
      </section>
    </div>
  );
}
