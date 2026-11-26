'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { useCartStore } from './cart-store';
import styles from './Cart.module.css';

// El conteo depende del localStorage: en el servidor y en la hidratación se
// muestra 0, y se actualiza ya en el cliente (sin aviso de hidratación).
const subscribeNoop = () => () => {};
const useHydrated = () => useSyncExternalStore(subscribeNoop, () => true, () => false);

export function CartButton() {
  const t = useTranslations('Cart');
  const hydrated = useHydrated();
  const count = useCartStore((state) => (hydrated ? state.items.length : 0));
  const open = useCartStore((state) => state.open);
  const setOpen = useCartStore((state) => state.setOpen);

  return (
    <button
      type="button"
      className={styles.button}
      data-has-items={count > 0 || undefined}
      aria-expanded={open}
      aria-controls="cart-panel"
      aria-label={t('buttonLabel', { count })}
      onClick={() => setOpen(!open)}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" d="M3 5.5h10l-.8 8.5H3.8L3 5.5Z" />
        <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="M5.6 5.5V4.4a2.4 2.4 0 0 1 4.8 0v1.1" />
      </svg>
      <span className={styles.buttonLabel} aria-hidden="true">
        {t('title')}
      </span>
      {/* Espacios entre las partes visibles (en flex no se pintan): así el
          texto visible coincide con el nombre accesible (WCAG 2.5.3). */}
      {' '}
      <span className={styles.count} aria-hidden="true">
        {count}
      </span>
    </button>
  );
}
