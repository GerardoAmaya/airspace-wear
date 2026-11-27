'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@/i18n/navigation';
import type { CatalogHref } from '@/lib/catalog-query';
import { scrollToElement } from '@/lib/motion/scroll';
import { PendingMark } from './PendingMark';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { RESULTS_ID } from '@/lib/pagination';
import type { FilterOption } from './FilterMenu';
import styles from './CatalogToolbar.module.css';

export interface SheetGroup {
  key: string;
  label: string;
  options: FilterOption[];
}

// true solo en el cliente ya hidratado (el portal no existe en el servidor).
const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Hoja de filtros del teléfono y la tableta: botón "Filtros" (con cuántos
// hay puestos) que abre una hoja desde abajo con Marca, Ordenar y el tipo de
// prenda. Cada opción es un enlace: el catálogo se actualiza detrás y la hoja
// sigue abierta; "Ver N resultados" la cierra y baja a la rejilla. Modal de
// verdad: el foco queda atrapado, Escape cierra y el foco vuelve al botón.
// Motion anima la entrada y la salida (solo opacidad con movimiento reducido).
export function FilterSheet({ groups, total, active, clearHref }: { groups: SheetGroup[]; total: number; active: number; clearHref: CatalogHref }) {
  const t = useTranslations('Catalog');
  const [open, setOpen] = useState(false);
  const reduced = useMotionStore((state) => state.reducedMotion);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const hydrated = useHydrated();

  // Al abrir, el foco entra a la hoja; al cerrar, vuelve al botón.
  useEffect(() => {
    if (!open) return;
    const button = trigger.current;
    panel.current?.querySelector<HTMLElement>('[aria-current="true"], a[href]')?.focus();
    return () => button?.focus();
  }, [open]);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    // Trampa de foco: Tab en el último vuelve al primero y al revés.
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const showResults = () => {
    setOpen(false);
    const results = document.getElementById(RESULTS_ID);
    if (results) scrollToElement(results, { duration: 0.8, focus: false });
  };

  const transition = { duration: reduced ? DURATION.micro : DURATION.ui, ease: EASE.out.bezier };

  return (
    <>
      <button ref={trigger} type="button" className={styles.sheetButton} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {t('filtersButton')}
        {active > 0 && (
          <span className={styles.sheetBadge}>
            <span aria-hidden="true">{active}</span>
            <span className="visually-hidden">{t('activeCount', { count: active })}</span>
          </span>
        )}
      </button>
      {hydrated &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  key="backdrop"
                  className={styles.sheetBackdrop}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  onClick={() => setOpen(false)}
                />
                <motion.div
                  key="sheet"
                  ref={panel}
                  className={styles.sheet}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={titleId}
                  onKeyDown={onKey}
                  initial={reduced ? { opacity: 0 } : { y: '100%' }}
                  animate={reduced ? { opacity: 1 } : { y: 0 }}
                  exit={reduced ? { opacity: 0 } : { y: '100%' }}
                  transition={transition}
                >
                  <header className={styles.sheetHead}>
                    <h2 id={titleId} className={styles.sheetTitle}>
                      {t('filtersLabel')}
                    </h2>
                    <button type="button" className={styles.sheetClose} aria-label={t('closeFilters')} onClick={() => setOpen(false)}>
                      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                        <path stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="m4 4 8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </header>
                  <div className={styles.sheetBody}>
                    {groups.map((group) => (
                      <section key={group.key} className={styles.sheetGroup} aria-labelledby={`${titleId}-${group.key}`}>
                        <h3 id={`${titleId}-${group.key}`} className={styles.sheetGroupTitle}>
                          {group.label}
                        </h3>
                        <ul className={styles.sheetOptions}>
                          {group.options.map((option) => (
                            <li key={option.key}>
                              {option.disabled && !option.selected ? (
                                <span className={styles.chip} aria-disabled="true" aria-label={option.ariaLabel}>
                                  {option.label}
                                  {option.count !== undefined && <span className={styles.chipCount}>{option.count}</span>}
                                </span>
                              ) : (
                                <Link
                                  href={option.href}
                                  replace
                                  scroll={false}
                                  className={styles.chip}
                                  aria-current={option.selected ? 'true' : undefined}
                                  aria-label={option.ariaLabel}
                                >
                                  {option.label}
                                  {option.count !== undefined && <span className={styles.chipCount}>{option.count}</span>}
                                  <PendingMark />
                                </Link>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                  <footer className={styles.sheetFoot}>
                    <Link href={clearHref} replace scroll={false} className={styles.sheetClear}>
                      {t('clearSheet')}
                      <PendingMark />
                    </Link>
                    <button type="button" className={styles.sheetSubmit} onClick={showResults}>
                      {t('showResults', { count: total })}
                    </button>
                  </footer>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
