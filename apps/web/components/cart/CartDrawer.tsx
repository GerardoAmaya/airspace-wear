'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { formatPrice } from '@/lib/price';
import { useCartCatalog } from './CartCatalog';
import { useCartStore } from './cart-store';
import styles from './Cart.module.css';

// Panel lateral del carrito. Motion maneja su entrada y salida (estado de UI,
// ver CLAUDE.md); solo anima transform y opacidad, sin desenfoques.
// Se carga diferido (LazyCartDrawer): Motion no pesa en el JS inicial.
export function CartDrawer() {
  const t = useTranslations('Cart');
  const locale = useLocale();
  const catalog = useCartCatalog();
  const { items, open, setOpen, remove, clear } = useCartStore();
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduced = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Escape cierra; al abrir, el foco va al botón de cerrar; al cerrar, vuelve al carrito.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.querySelector<HTMLButtonElement>('[aria-controls="cart-panel"]')?.focus();
    };
  }, [open, setOpen]);

  const lines = items.flatMap((item) => (catalog[item.slug] ? [{ item, info: catalog[item.slug]! }] : []));
  const totalCents = lines.reduce((sum, line) => sum + line.info.price.amountCents, 0);
  const currency = lines[0]?.info.price.currency ?? 'USD';
  const transition = { duration: reduced ? 0 : DURATION.ui, ease: EASE.out.bezier };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={() => setOpen(false)}
          />
          <motion.aside
            key="panel"
            id="cart-panel"
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={transition}
          >
            <header className={styles.head}>
              <h2 id="cart-title" className={styles.title}>
                {t('title')}
              </h2>
              <button ref={closeRef} type="button" className={styles.close} aria-label={t('close')} onClick={() => setOpen(false)}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="m4 4 8 8M12 4l-8 8" />
                </svg>
              </button>
            </header>

            {lines.length === 0 ? (
              <p className={styles.empty}>{t('empty')}</p>
            ) : (
              <>
                <ul className={styles.list}>
                  {lines.map(({ item, info }) => (
                    <li key={item.id} className={styles.item}>
                      <span className={styles.brand}>{info.brand}</span>
                      <span className={styles.name}>{info.name}</span>
                      <span className={styles.price}>{formatPrice(info.price, locale)}</span>
                      <span className={styles.detail}>
                        {item.size ? t('lineDetail', { detail: info.detail ?? '', size: item.size }) : info.detail}
                      </span>
                      <button type="button" className={styles.remove} onClick={() => remove(item.id)}>
                        {t('remove')}
                        <span className="visually-hidden">{t('removeLabel', { name: info.name })}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <footer className={styles.foot}>
                  <p className={styles.total}>
                    <span className={styles.totalLabel}>{t('total')}</span>
                    <span className={styles.totalValue}>{formatPrice({ amountCents: totalCents, currency }, locale)}</span>
                  </p>
                  <p className={styles.note}>{t('note')}</p>
                  <button type="button" className={styles.clear} onClick={clear}>
                    {t('clear')}
                  </button>
                </footer>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
