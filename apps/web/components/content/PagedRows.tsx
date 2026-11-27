'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Children, type ReactNode, useRef, useState } from 'react';
import pager from '@/components/catalog/Pager.module.css';
import { pageWindow } from '@/lib/pagination';
import { DURATION, EASE } from '@/lib/motion/tokens';
import styles from './content.module.css';

// Lista larga paginada en el navegador (créditos de modelos). Las filas
// llegan ya renderizadas del servidor; aquí solo se elige qué página se ve,
// sin cambiar la URL. El HTML del servidor trae la primera página; las demás
// se muestran con los botones (los créditos completos también están en
// CREDITS.md del repositorio).
export interface PagedRowsLabels {
  nav: string;
  previous: string;
  next: string;
  // Plantillas con {page} y {total}.
  pageLink: string;
  pageOf: string;
}

export function PagedRows({ children, pageSize, labels }: { children: ReactNode; pageSize: number; labels: PagedRowsLabels }) {
  const rows = Children.toArray(children);
  const total = Math.max(1, Math.ceil(rows.length / pageSize));
  const [page, setPage] = useState(1);
  const reduced = useReducedMotion();
  const list = useRef<HTMLUListElement>(null);

  const go = (next: number) => {
    setPage(next);
    // Al cambiar de página se vuelve al inicio de la lista si quedó arriba.
    const top = list.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) list.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  };
  const fill = (template: string, values: Record<string, number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.ul
          key={page}
          ref={list}
          className={styles.rows}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: DURATION.ui, ease: EASE.out.bezier }}
        >
          {rows.slice((page - 1) * pageSize, page * pageSize)}
        </motion.ul>
      </AnimatePresence>
      {total > 1 && (
        <nav className={`${pager.pager} ${styles.pagedNav}`} aria-label={labels.nav}>
          <button type="button" className={pager.step} aria-disabled={page === 1 || undefined} disabled={page === 1} onClick={() => go(page - 1)}>
            {labels.previous}
          </button>
          <ul className={pager.pages}>
            {pageWindow(page, total).map((item, index) =>
              item === 'gap' ? (
                <li key={`gap-${index}`} className={pager.gap} aria-hidden="true" />
              ) : (
                <li key={item}>
                  <button
                    type="button"
                    className={pager.page}
                    aria-current={item === page ? 'page' : undefined}
                    aria-label={fill(labels.pageLink, { page: item })}
                    onClick={() => go(item)}
                  >
                    {item}
                  </button>
                </li>
              ),
            )}
          </ul>
          <p className={pager.compact}>{fill(labels.pageOf, { page, total })}</p>
          <button type="button" className={pager.step} aria-disabled={page === total || undefined} disabled={page === total} onClick={() => go(page + 1)}>
            {labels.next}
          </button>
        </nav>
      )}
    </>
  );
}
