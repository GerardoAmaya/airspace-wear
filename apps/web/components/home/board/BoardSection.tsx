'use client';

import type { Locale } from '@airspace/contracts';
import { useFormatter, useTranslations } from 'next-intl';
import { type CSSProperties, type KeyboardEvent, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HOME_ANCHORS } from '@/lib/home';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { SplitText } from '@/lib/motion/split-text';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { formatPrice } from '@/lib/price';
import { BoardDetails } from './BoardDetails';
import { BoardPreview } from './BoardPreview';
import styles from './Board.module.css';
import { collectTiles, fitText, type Tile, useFlapEngine } from './flap';
import { HangarTeaser } from './HangarTeaser';
import { prefetchModel } from './prefetch';
import { createSpin } from './rig';
import { scramble } from './scramble';
import type { BoardProduct } from './types';
import ui from './ui.module.css';

// Sección "Catálogo" de la home: tablero split-flap, vista 3D con detalles y
// el adelanto del Hangar 360° (design/prototype/sections/departures).
//
// - La selección SOLO cambia con clic, toque o Enter/Espacio en una fila (o
//   con el evento airspace:select-product del estilista). Pasar el cursor o
//   el foco solo precarga el modelo.
// - Las paletas giran por tiempo cuando el tablero entra en vista (una vez) y
//   al cambiar de filtro. Nada depende de la posición del scroll.
// - Orden del DOM = orden de tabulación: filtros, filas, detalles y "Agregar
//   al carrito". En móvil la vista 3D se muestra arriba con CSS (order).

const COLUMNS = ['ref', 'name', 'brand', 'sizes', 'price', 'stock'] as const;
type Column = (typeof COLUMNS)[number];
const MIN_TILES: Partial<Record<Column, number>> = { sizes: 6 };

type Tone = 'primary' | 'alert' | 'muted';
const TONE = { new: 'primary', available: 'muted', low_stock: 'alert', coming_soon: 'muted' } as const satisfies Record<BoardProduct['availability'], Tone>;

export const sizeText = (product: BoardProduct) => (product.sizeRange ? `${product.sizeRange.min}-${product.sizeRange.max}` : '');

interface Row {
  product: BoardProduct;
  tone: Tone;
  label: string;
  fitted: Record<Column, string>;
}

export function BoardSection({ products, locale }: { products: BoardProduct[]; locale: Locale }) {
  const t = useTranslations('HomeBoard');
  const tAvailability = useTranslations('Availability');
  const format = useFormatter();
  const reducedMotion = useMotionStore((state) => state.reducedMotion);
  const lite = useMotionStore((state) => state.lite);

  // ---------- Datos del tablero ----------

  const { rows, counts } = useMemo(() => {
    const texts = products.map((product) => ({
      ref: product.reference,
      name: product.name,
      brand: product.brand.name,
      // La escala va en el encabezado ("Tallas EU"); la celda muestra el rango.
      sizes: sizeText(product),
      price: formatPrice(product.price, locale),
      stock: tAvailability(product.availability),
    }));
    const counts = Object.fromEntries(COLUMNS.map((column) => [column, Math.max(MIN_TILES[column] ?? 0, ...texts.map((text) => text[column].length))])) as Record<Column, number>;
    const rows: Row[] = products.map((product, index) => {
      const text = texts[index];
      return {
        product,
        tone: TONE[product.availability],
        label: t('rowLabel', { reference: product.reference, name: product.name, brand: product.brand.name, sizes: text.sizes, price: text.price, availability: text.stock }),
        fitted: Object.fromEntries(COLUMNS.map((column) => [column, fitText(text[column], counts[column])])) as Record<Column, string>,
      };
    });
    return { rows, counts };
  }, [products, locale, t, tAvailability]);

  // Marcas en el orden en que aparecen en el catálogo, con su conteo.
  const brands = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; count: number }>();
    for (const product of products) {
      const entry = map.get(product.brand.slug) ?? { ...product.brand, count: 0 };
      entry.count += 1;
      map.set(product.brand.slug, entry);
    }
    return [...map.values()];
  }, [products]);

  const sizeBounds = products.flatMap((product) => (product.sizeRange ? [Number(product.sizeRange.min), Number(product.sizeRange.max)] : [])).filter(Number.isFinite);
  const system = products.find((product) => product.sizeRange)?.sizeRange?.system ?? 'EU';

  // ---------- Estado ----------

  const [selected, setSelected] = useState(products[0].slug);
  const [filter, setFilter] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const animateSelection = useRef(false);
  const spin = useRef(createSpin());
  const product = products.find((item) => item.slug === selected) ?? products[0];

  const matches = useCallback((item: BoardProduct, brand: string | null) => brand === null || item.brand.slug === brand, []);
  const ordered = useMemo(
    () => (filter === null ? rows : [...rows.filter((row) => matches(row.product, filter)), ...rows.filter((row) => !matches(row.product, filter))]),
    [rows, filter, matches],
  );

  const select = useCallback(
    (slug: string, { animate = true } = {}) => {
      const next = products.find((item) => item.slug === slug);
      if (!next || slug === selected) return;
      animateSelection.current = animate;
      setSelected(slug);
      // Un solo anuncio por selección, con el texto final (no el que se decodifica).
      if (animate) {
        setAnnouncement(t('details.selection', { name: next.name, price: formatPrice(next.price, locale), availability: tAvailability(next.availability) }));
      }
    },
    [products, selected, t, tAvailability, locale],
  );

  // ---------- Paletas ----------

  const engine = useFlapEngine(reducedMotion);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const tiles = useRef(new Map<string, Record<Column, Tile[]>>());
  const started = useRef(false);
  const flipFrom = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    for (const [slug, item] of itemRefs.current) {
      tiles.current.set(
        slug,
        Object.fromEntries(COLUMNS.map((column) => [column, collectTiles(item.querySelector(`[data-cell="${column}"]`)!)])) as Record<Column, Tile[]>,
      );
    }
  }, [rows]);

  const flapRow = useCallback(
    (row: Row, { delay = 0, short = false } = {}) => {
      const cells = tiles.current.get(row.product.slug);
      if (!cells) return;
      let offset = 0;
      for (const column of COLUMNS) {
        engine.flapTo(cells[column], row.fitted[column], { delay: delay + offset * 0.012, stagger: 0.014, minSteps: short ? 2 : 3, maxSteps: short ? 5 : 11 });
        offset += cells[column].length;
      }
    },
    [engine],
  );

  // El tablero gira sus paletas una vez al entrar en vista (o al recibir el
  // foco). "Últimos pares" late tres veces en ese momento y luego queda fijo.
  const orderedRef = useRef(ordered);
  useEffect(() => {
    orderedRef.current = ordered;
  }, [ordered]);
  const startBoard = useCallback(() => {
    const list = listRef.current;
    if (started.current || !list) return;
    started.current = true;
    list.dataset.pulse = '';
    if (!document.documentElement.classList.contains('motion-ok')) {
      list.dataset.flap = 'done';
      return;
    }
    // Las paletas parten en blanco (el texto final del servidor queda oculto
    // por CSS hasta este momento) y giran hasta su letra.
    for (const row of orderedRef.current) {
      const cells = tiles.current.get(row.product.slug);
      if (cells) for (const column of COLUMNS) engine.set(cells[column], '');
    }
    list.dataset.flap = 'done';
    orderedRef.current.forEach((row, index) => flapRow(row, { delay: index * 0.09 }));
  }, [engine, flapRow]);

  useGSAP(
    () => {
      const list = listRef.current;
      if (!list) return;
      if (!document.documentElement.classList.contains('motion-ok')) {
        startBoard();
        return;
      }
      const trigger = ScrollTrigger.create({ trigger: list, start: 'top 85%', end: 'max', once: true, onEnter: startBoard });
      list.addEventListener('focusin', startBoard, { once: true });
      return () => {
        trigger.kill();
        list.removeEventListener('focusin', startBoard);
      };
    },
    { scope: listRef },
  );

  // ---------- Ajuste del tablero a su columna ----------

  // La mono es ancha: se mide su avance real (ch / em) y el tablero escala su
  // tipografía para que las columnas entren justas. En tarjetas (móvil) el
  // nombre va en su propia fila y su tamaño se ajusta al nombre más largo.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const probe = list.querySelector<HTMLElement>('[data-probe]');
    const fit = () => {
      if (!probe) return;
      const ratio = probe.getBoundingClientRect().width / 10 / parseFloat(getComputedStyle(probe).fontSize);
      const tileEm = ratio + 0.42 + 0.1;
      const total = (keys: readonly Column[]) => keys.reduce((sum, key) => sum + counts[key] * tileEm, 0) + (keys.length - 1) + 2.2;
      const full = total(COLUMNS);
      const compact = total(COLUMNS.filter((column) => column !== 'brand'));
      const width = list.getBoundingClientRect().width;
      const isCompact = width / full < 10.5;
      if (isCompact) list.dataset.compact = '';
      else delete list.dataset.compact;
      list.style.setProperty('--dep-fit', (isCompact ? compact : full).toFixed(2));
      const cells = list.querySelector<HTMLElement>('[data-row-cells]');
      if (cells) {
        const style = getComputedStyle(cells);
        const cellsWidth = cells.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (cellsWidth > 0) list.style.setProperty('--dep-name-size', `${Math.min(14.6, cellsWidth / (counts.name * tileEm)).toFixed(2)}px`);
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(list);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [counts]);

  // ---------- Filtros (reordenan con FLIP) ----------

  const applyFilter = useCallback(
    (brand: string | null) => {
      if (brand === filter) return;
      flipFrom.current = new Map([...itemRefs.current].map(([slug, item]) => [slug, item.getBoundingClientRect().top]));
      setFilter(brand);
      // La selección se mantiene si sigue visible; si quedó filtrada, pasa a la primera fila.
      const current = products.find((item) => item.slug === selected);
      if (current && !matches(current, brand)) {
        const first = products.find((item) => matches(item, brand));
        if (first) select(first.slug);
      }
    },
    [filter, products, selected, matches, select],
  );

  useLayoutEffect(() => {
    const before = flipFrom.current;
    flipFrom.current = null;
    if (!before) return;
    const motion = document.documentElement.classList.contains('motion-ok');
    for (const [slug, item] of itemRefs.current) {
      const delta = (before.get(slug) ?? 0) - item.getBoundingClientRect().top;
      if (delta && motion) gsap.fromTo(item, { y: delta }, { y: 0, duration: DURATION.reveal, ease: EASE.out.gsap, overwrite: true });
    }
    if (started.current) ordered.filter((row) => matches(row.product, filter)).forEach((row, index) => flapRow(row, { delay: 0.08 + index * 0.06, short: true }));
  }, [filter, ordered, matches, flapRow]);

  // ---------- Evento del estilista ----------

  // "Ver en 3D" desde el estilista: elige el producto igual que un clic en su
  // fila. Si un filtro lo oculta, primero se muestran todas las marcas.
  const onExternalSelect = useRef<(slug: string) => void>(() => {});
  useEffect(() => {
    onExternalSelect.current = (slug: string) => {
      const target = products.find((item) => item.slug === slug);
      if (!target) return;
      if (!matches(target, filter)) applyFilter(null);
      select(slug);
    };
  }, [products, filter, matches, applyFilter, select]);
  useEffect(() => {
    const listener = (event: Event) => {
      const slug = (event as CustomEvent<{ slug?: string }>).detail?.slug;
      if (typeof slug === 'string') onExternalSelect.current(slug);
    };
    window.addEventListener('airspace:select-product', listener);
    return () => window.removeEventListener('airspace:select-product', listener);
  }, []);

  // ---------- Prefetch y teclado ----------

  const prefetchAround = (slug: string) => {
    const index = ordered.findIndex((row) => row.product.slug === slug);
    for (const row of [ordered[index], ordered[index + 1]]) {
      const model = row?.product.model;
      if (model) prefetchModel(lite ? model.liteUrl : model.heroUrl);
    }
  };

  // Flechas arriba/abajo mueven el foco entre modelos; Enter o Espacio eligen.
  const onRowsKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
  };

  // ---------- Entrada del encabezado (una vez, por tiempo) ----------

  const boardRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const board = boardRef.current;
      if (!board) return;
      if (!document.documentElement.classList.contains('motion-ok')) {
        board.dataset.enter = 'done';
        return;
      }
      const head = board.querySelector<HTMLElement>('[data-head]')!;
      const title = board.querySelector<HTMLElement>('[data-title]')!;
      const label = board.querySelector<HTMLElement>('[data-kicker]');
      const fades = Array.from(board.querySelectorAll<HTMLElement>('[data-enter-item]'));
      const slot = board.querySelector<HTMLElement>('[data-slot-enter]');
      const rule = board.parentElement?.querySelector<HTMLElement>('[data-intro-rule]');
      let timeline: gsap.core.Timeline | null = null;
      let split: SplitText | null = null;
      const done = () => {
        board.dataset.enter = 'done';
        gsap.set([...fades, slot, rule, title].filter(Boolean), { clearProps: 'opacity,transform' });
        split?.revert();
      };
      const play = () => {
        if (board.dataset.enter !== 'idle') return;
        split = SplitText.create(title, { type: 'lines,chars', mask: 'lines' });
        timeline = gsap.timeline({ onComplete: done });
        if (rule) timeline.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: DURATION.cinematic, ease: EASE.inOut.gsap }, 0);
        if (label?.textContent) timeline.add(scramble(label, label.textContent, { duration: 1.1 }), 0);
        timeline
          .fromTo(split.chars, { yPercent: 110 }, { yPercent: 0, duration: DURATION.reveal, ease: EASE.out.gsap, stagger: 0.04 }, 0)
          .fromTo(fades, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: DURATION.reveal, ease: EASE.out.gsap, stagger: 0.08 }, 0.2);
        if (slot) timeline.fromTo(slot, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: DURATION.cinematic, ease: EASE.out.gsap }, 0);
        board.dataset.enter = 'run';
      };
      // Si el foco llega antes que la entrada, se completa al instante.
      const finish = () => {
        if (timeline) timeline.progress(1);
        else if (board.dataset.enter === 'idle') done();
      };
      const trigger = ScrollTrigger.create({ trigger: head, start: 'top 85%', end: 'max', once: true, onEnter: play });
      board.addEventListener('focusin', finish);
      return () => {
        trigger.kill();
        board.removeEventListener('focusin', finish);
        timeline?.kill();
        split?.revert();
      };
    },
    { scope: boardRef },
  );

  // ---------- Render ----------

  const visibleCount = filter === null ? products.length : products.filter((item) => matches(item, filter)).length;
  const activeBrand = brands.find((brand) => brand.slug === filter);
  const padded = format.number(visibleCount, { minimumIntegerDigits: 2 });
  const countLabel = activeBrand
    ? t('countBrand', { padded, count: visibleCount, brand: activeBrand.name })
    : t('countAll', { padded, count: visibleCount, brands: brands.length });
  const columnVars = Object.fromEntries(COLUMNS.map((column) => [`--n-${column}`, counts[column]])) as CSSProperties;

  return (
    <>
      {/* tabIndex -1: destino de anclas. scrollToElement lo agrega al saltar a
          #catalogo (a veces antes de hidratar); declararlo evita el desajuste. */}
      <section id={HOME_ANCHORS.board} className={styles.section} aria-labelledby="catalogo-title" tabIndex={-1}>
        <div className={`${styles.intro} ${ui.container}`} aria-hidden="true">
          <span className={ui.hudLabel}>{t('store')}</span>
          <span className={styles.introRule} data-intro-rule="" />
          <span className={`${ui.hudLabel} ${styles.introBrands}`}>{brands.map((brand) => brand.name).join(' · ')}</span>
        </div>

        <div ref={boardRef} className={`${styles.board} ${ui.container}`} data-enter="idle">
          <header className={styles.head} data-head="">
            <div className={styles.headMeta}>
              <p className={`${ui.hudLabel} ${ui.hudPrimary}`}>
                <span className="visually-hidden">{t('kicker')}</span>
                <span aria-hidden="true" data-kicker="">
                  {t('kicker')}
                </span>
              </p>
              {sizeBounds.length > 0 && (
                <p className={`${ui.hudLabel} ${styles.headSizes}`}>{t('sizeRange', { system, min: Math.min(...sizeBounds), max: Math.max(...sizeBounds) })}</p>
              )}
            </div>
            <div className={styles.headTitle}>
              <h2 id="catalogo-title" className={`${ui.display} ${styles.title}`} data-title="">
                {t('title')}
              </h2>
              <p className={styles.lead} data-enter-item="">
                {t('lead', { count: products.length })}
              </p>
            </div>
          </header>

          <div ref={listRef} className={styles.list} style={columnVars} data-flap="idle">
            <div className={styles.bar} data-enter-item="">
              <div className={styles.filters} role="group" aria-label={t('filtersLabel')}>
                <button type="button" className={styles.chip} aria-pressed={filter === null} onClick={() => applyFilter(null)}>
                  {t('allBrands')}
                  <span className={styles.chipCount} aria-hidden="true">
                    {products.length}
                  </span>
                  <span className="visually-hidden">{t('chipCount', { count: products.length })}</span>
                </button>
                {brands.map((brand) => (
                  <button key={brand.slug} type="button" className={styles.chip} aria-pressed={filter === brand.slug} onClick={() => applyFilter(brand.slug)}>
                    {brand.name}
                    <span className={styles.chipCount} aria-hidden="true">
                      {brand.count}
                    </span>
                    <span className="visually-hidden">{t('chipCount', { count: brand.count })}</span>
                  </button>
                ))}
              </div>
              <p className={`${ui.hudLabel} ${styles.count}`} aria-live="polite">
                {countLabel}
              </p>
            </div>
            <div className={styles.cols} aria-hidden="true" data-enter-item="">
              {COLUMNS.map((column) => (
                <span key={column} className={styles.col} data-col={column}>
                  {t(`columns.${column}`)}
                </span>
              ))}
            </div>
            <ul className={styles.rows} aria-label={t('rowsLabel')} onKeyDown={onRowsKeyDown}>
              {ordered.map((row) => {
                const slug = row.product.slug;
                const dimmed = !matches(row.product, filter);
                return (
                  <li
                    key={slug}
                    ref={(element) => {
                      if (element) itemRefs.current.set(slug, element);
                      else itemRefs.current.delete(slug);
                    }}
                    className={styles.item}
                    data-dimmed={dimmed || undefined}
                  >
                    <button
                      type="button"
                      className={styles.row}
                      aria-pressed={slug === selected}
                      aria-label={row.label}
                      disabled={dimmed}
                      onClick={() => select(slug)}
                      onFocus={() => prefetchAround(slug)}
                      onPointerEnter={(event) => {
                        if (event.pointerType === 'mouse') prefetchAround(slug);
                      }}
                    >
                      <span className={styles.rowHighlight} aria-hidden="true" />
                      <RowCells fitted={row.fitted} tone={row.tone} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <span className={styles.probe} data-probe="" aria-hidden="true">
              0000000000
            </span>
          </div>

          <div className={styles.band}>
            <BoardPreview product={product} spin={spin} lite={lite} reducedMotion={reducedMotion} />
            <BoardDetails product={product} locale={locale} animate={animateSelection} announcement={announcement} />
          </div>
        </div>
      </section>

      <HangarTeaser product={product} spin={spin} lite={lite} reducedMotion={reducedMotion} />
    </>
  );
}

// Celdas de una fila: paletas con el texto final del servidor. React las
// dibuja una sola vez (memo); después solo el motor escribe en ellas.
const RowCells = memo(function RowCells({ fitted, tone }: { fitted: Record<Column, string>; tone: Tone }) {
  return (
    <span className={styles.cells} data-row-cells="" aria-hidden="true">
      {COLUMNS.map((column) => (
        <span key={column} className={styles.cell} data-cell={column} data-tone={column === 'stock' ? tone : undefined}>
          {Array.from(fitted[column]).map((char, index) => (
            <span key={index} className={styles.tile} data-tile="">
              <span className={styles.ch} data-tile-ch="">
                {char === ' ' ? '' : char}
              </span>
              <span className={styles.flap} data-tile-flap="">
                <span />
              </span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
});
