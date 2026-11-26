'use client';

import type { Hotspot } from '@airspace/contracts';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import styles from './ProductTour.module.css';
import { useTour } from './tour-store';

// Lista de detalles 3D: cada uno mueve la cámara a esa pieza (control
// explícito, nunca por scroll). Es la versión accesible de los marcadores.
export function ProductTour({ hotspots }: { hotspots: Hotspot[] }) {
  const t = useTranslations('Product.viewer');
  const active = useTour((state) => state.active);
  const setActive = useTour((state) => state.setActive);

  // Al salir de la ficha, la próxima empieza en la vista general.
  useEffect(() => () => setActive(null), [setActive]);

  if (hotspots.length === 0) return null;
  return (
    <section className={styles.tour} aria-labelledby="product-tour-title">
      <div className={styles.head}>
        <h2 id="product-tour-title" className={styles.title}>
          {t('detailsTitle')}
        </h2>
        <button type="button" className={styles.overview} aria-pressed={active === null} onClick={() => setActive(null)}>
          {t('overview')}
        </button>
      </div>
      <ol className={styles.list}>
        {hotspots.map((hotspot, index) => (
          <li key={hotspot.key}>
            <button type="button" className={styles.item} aria-pressed={active === hotspot.key} onClick={() => setActive(active === hotspot.key ? null : hotspot.key)}>
              <span className={styles.index}>{String(index + 1).padStart(2, '0')}</span>
              <span className={styles.text}>
                <strong>{hotspot.title}</strong>
                <span>{hotspot.text}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
