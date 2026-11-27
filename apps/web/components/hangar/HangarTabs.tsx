'use client';

import { useTranslations } from 'next-intl';
import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';
import { type HangarTab, useHangarTab, useOutfitStore } from './outfit-store';
import styles from './HangarTabs.module.css';

// Panel derecho del Hangar 360°: pestañas "Zapatos" y "Ropa" ("Colores"
// oculta, ver lib/avatar/hangar-features.ts) (patrón de pestañas de WAI-ARIA, activación automática). Las flechas,
// Inicio y Fin mueven la pestaña elegida; la última se recuerda en el store.
// Los paneles ocultos quedan montados con `hidden` (sin animación de alto).
export function HangarTabs({ panels }: { panels: Array<{ tab: HangarTab; content: ReactNode }> }) {
  const t = useTranslations('Hangar.tabs');
  const stored = useHangarTab();
  const setTab = useOutfitStore((state) => state.setTab);
  const id = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const current = panels.some((panel) => panel.tab === stored) ? stored : (panels[0]?.tab ?? stored);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = panels.findIndex((panel) => panel.tab === current);
    const last = panels.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index + 1) % panels.length
      : event.key === 'ArrowLeft' ? (index - 1 + panels.length) % panels.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(panels[next].tab);
    buttons.current[next]?.focus();
  };

  return (
    <div className={styles.tabs}>
      <div className={styles.list} role="tablist" aria-label={t('label')} onKeyDown={onKeyDown}>
        {panels.map((panel, index) => {
          const selected = panel.tab === current;
          return (
            <button
              key={panel.tab}
              ref={(node) => void (buttons.current[index] = node)}
              type="button"
              role="tab"
              id={`${id}-tab-${panel.tab}`}
              className={styles.tab}
              aria-selected={selected}
              aria-controls={`${id}-panel-${panel.tab}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(panel.tab)}
            >
              {t(panel.tab)}
            </button>
          );
        })}
      </div>
      {panels.map((panel) => (
        <div
          key={panel.tab}
          role="tabpanel"
          id={`${id}-panel-${panel.tab}`}
          aria-labelledby={`${id}-tab-${panel.tab}`}
          className={styles.panel}
          hidden={panel.tab !== current}
          tabIndex={0}
        >
          {panel.content}
        </div>
      ))}
    </div>
  );
}
