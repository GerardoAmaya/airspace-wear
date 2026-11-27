'use client';

import { AnimatePresence, motion } from 'motion/react';
import { type KeyboardEvent, type MouseEvent, useEffect, useId, useRef, useState, useTransition } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { usePendingMark } from '@/lib/catalog-pending';
import type { CatalogHref } from '@/lib/catalog-query';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import styles from './CatalogToolbar.module.css';

export interface FilterOption {
  key: string;
  label: string;
  // Conteo con los demás filtros puestos (opcional: el orden no lo lleva).
  count?: number;
  // Nombre accesible con el conteo ("Nike, 17 productos").
  ariaLabel?: string;
  href: CatalogHref;
  selected: boolean;
  // Sin resultados con los demás filtros: se ve, pero no se puede elegir.
  disabled?: boolean;
}

const ITEM = '[role="menuitemradio"]:not([aria-disabled="true"])';

// Menú desplegable de la barra (Marca, Ordenar): un botón con aria-expanded
// y un menú de opciones de radio que son enlaces reales. Teclado: flechas,
// Inicio y Fin, la inicial de una opción, Escape (vuelve al botón) y Tab
// (cierra). Se abre encima del contenido (position absolute): no mueve nada.
// Motion anima la entrada y la salida (solo opacidad con movimiento reducido).
export function FilterMenu({ label, value, options, align = 'start' }: { label: string; value: string; options: FilterOption[]; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const reduced = useMotionStore((state) => state.reducedMotion);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Al abrir con la flecha arriba, el foco va a la última opción.
  const focusLast = useRef(false);
  const id = useId();
  // La navegación corre aquí (el menú se cierra y sus opciones desaparecen):
  // así la espera sigue marcada y la rejilla se atenúa hasta que llega.
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  usePendingMark(pending);

  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);

  // Al abrir: foco en la opción elegida (o la primera). Un clic o toque
  // fuera del menú lo cierra.
  useEffect(() => {
    if (!open) return;
    const list = Array.from(menu.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    const target = focusLast.current ? list.at(-1) : (list.find((item) => item.getAttribute('aria-checked') === 'true') ?? list[0]);
    focusLast.current = false;
    target?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const choose = (event: MouseEvent<HTMLAnchorElement>, href: CatalogHref) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    startTransition(() => router.push(href, { scroll: false }));
    close(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    focusLast.current = event.key === 'ArrowUp';
    setOpen(true);
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') close(false);
    else if (event.key === ' ') {
      // Espacio elige, como Enter (los enlaces solo responden a Enter).
      event.preventDefault();
      (document.activeElement as HTMLElement | null)?.click();
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      // Salta a la siguiente opción que empieza con esa letra.
      const letter = event.key.toLocaleLowerCase();
      const order = [...list.slice(index + 1), ...list.slice(0, index + 1)];
      const match = order.find((item) => item.textContent?.trim().toLocaleLowerCase().startsWith(letter));
      if (match) {
        event.preventDefault();
        match.focus();
      }
    }
  };

  const offset = reduced ? 0 : -6;
  const selectedOption = options.find((option) => option.selected);

  return (
    <div ref={root} className={styles.menuRoot}>
      <button
        ref={button}
        type="button"
        className={styles.menuButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-active={(selectedOption && selectedOption !== options[0]) || undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onButtonKey}
      >
        <span className={styles.menuLabel}>{label}</span>
        <span className={styles.menuValue}>{value}</span>
        <svg className={styles.menuChevron} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menu}
            id={id}
            role="menu"
            aria-label={label}
            className={styles.menu}
            data-align={align}
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: offset }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: offset }}
            transition={{ duration: DURATION.micro, ease: EASE.out.bezier }}
          >
            {options.map((option) =>
              option.disabled && !option.selected ? (
                <span key={option.key} role="menuitemradio" aria-checked="false" aria-disabled="true" aria-label={option.ariaLabel} className={styles.menuItem}>
                  <span className={styles.menuItemLabel}>{option.label}</span>
                  {option.count !== undefined && <span className={styles.menuCount}>{option.count}</span>}
                </span>
              ) : (
                <Link
                  key={option.key}
                  href={option.href}
                  scroll={false}
                  role="menuitemradio"
                  aria-checked={option.selected}
                  aria-label={option.ariaLabel}
                  tabIndex={-1}
                  className={styles.menuItem}
                  onClick={(event) => choose(event, option.href)}
                >
                  <span className={styles.menuItemLabel}>{option.label}</span>
                  {option.count !== undefined && <span className={styles.menuCount}>{option.count}</span>}
                </Link>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
