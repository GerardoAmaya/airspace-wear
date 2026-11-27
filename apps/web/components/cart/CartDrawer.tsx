'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { formatPrice } from '@/lib/price';
import { CheckoutButton, type LineIssues } from './CheckoutButton';
import { useCartCatalog } from './CartCatalog';
import { MAX_QUANTITY, MIN_QUANTITY, useCartStore } from './cart-store';
import styles from './Cart.module.css';

// Panel lateral del carrito. Motion maneja su entrada y salida, el cambio de
// cantidad y el reacomodo de las líneas al quitar una (estado de UI, ver
// CLAUDE.md); solo anima transform y opacidad, sin desenfoques.
// Se carga diferido (LazyCartDrawer): Motion no pesa en el JS inicial.
export function CartDrawer() {
  const t = useTranslations('Cart');
  const locale = useLocale();
  const catalog = useCartCatalog();
  const { items, open, setOpen, setQuantity, remove, clear } = useCartStore();
  const closeRef = useRef<HTMLButtonElement>(null);
  // Texto de la región en vivo (cortés): cantidad nueva, máximo o línea quitada.
  const [announcement, setAnnouncement] = useState('');
  // Problemas por línea que devolvió el pago (talla agotada, producto retirado).
  const [lineIssues, setLineIssues] = useState<LineIssues>({});
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
  const totalCents = lines.reduce((sum, line) => sum + line.info.price.amountCents * line.item.quantity, 0);
  const currency = lines[0]?.info.price.currency ?? 'USD';
  const transition = { duration: reduced ? 0 : DURATION.ui, ease: EASE.out.bezier };
  // Con movimiento reducido las líneas no se deslizan: solo un fundido corto.
  const lineTransition = { duration: reduced ? DURATION.micro : DURATION.ui, ease: EASE.out.bezier };

  const changeQuantity = (id: string, name: string, next: number) => {
    if (next > MAX_QUANTITY) {
      setAnnouncement(t('maxReached', { max: MAX_QUANTITY, name }));
      return;
    }
    if (next < MIN_QUANTITY) return;
    setQuantity(id, next);
    setAnnouncement(t('quantityStatus', { name, count: next }));
  };

  const removeLine = (id: string, name: string) => {
    remove(id);
    setAnnouncement(t('removed', { name }));
    // El botón desaparece con su línea: el foco pasa a "Cerrar" para no perderse.
    closeRef.current?.focus();
  };

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

            <p className="visually-hidden" role="status">
              {announcement}
            </p>

            {lines.length === 0 ? (
              <p className={styles.empty}>{t('empty')}</p>
            ) : (
              <>
                <ul className={styles.list}>
                  <AnimatePresence initial={false} mode="popLayout">
                    {lines.map(({ item, info }) => (
                      <motion.li
                        key={item.id}
                        className={styles.item}
                        layout={reduced ? false : 'position'}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
                        transition={lineTransition}
                      >
                        <span className={styles.brand}>{info.brand}</span>
                        <span className={styles.name}>{info.name}</span>
                        <span className={styles.price}>
                          {formatPrice({ amountCents: info.price.amountCents * item.quantity, currency: info.price.currency }, locale)}
                        </span>
                        <span className={styles.detail}>
                          {item.size ? t('lineDetail', { detail: info.detail ?? '', size: item.size }) : info.detail}
                        </span>
                        <span className={styles.unit}>{item.quantity > 1 ? t('unitPrice', { price: formatPrice(info.price, locale) }) : null}</span>
                        {lineIssues[item.id] && (
                          <span className={styles.lineIssue} role="note">
                            {t(`issue.${lineIssues[item.id]}`)}
                          </span>
                        )}
                        <QuantityStepper
                          name={info.name}
                          quantity={item.quantity}
                          reduced={reduced}
                          onChange={(next) => changeQuantity(item.id, info.name, next)}
                        />
                        <button type="button" className={styles.remove} onClick={() => removeLine(item.id, info.name)}>
                          {t('remove')}
                          <span className="visually-hidden">{t('removeLabel', { name: info.name })}</span>
                        </button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
                <footer className={styles.foot}>
                  <p className={styles.total}>
                    <span className={styles.totalLabel}>{t('total')}</span>
                    <span className={styles.totalValue}>{formatPrice({ amountCents: totalCents, currency }, locale)}</span>
                  </p>
                  <CheckoutButton items={lines.map(({ item }) => item)} onIssues={setLineIssues} />
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

// Selector compacto: −, número, +. En los límites (1 y 10) los botones quedan
// con aria-disabled en lugar de disabled: así no pierden el foco al llegar al
// límite. Para quitar la línea está "Quitar", siempre visible.
function QuantityStepper({ name, quantity, reduced, onChange }: { name: string; quantity: number; reduced: boolean; onChange(next: number): void }) {
  const t = useTranslations('Cart');
  const format = useFormatter();
  // Dirección del último cambio (sube o baja) para que el número entre desde el lado correcto.
  const [previous, setPrevious] = useState(quantity);
  const [direction, setDirection] = useState(1);
  if (quantity !== previous) {
    setDirection(quantity > previous ? 1 : -1);
    setPrevious(quantity);
  }
  const atMin = quantity <= MIN_QUANTITY;
  const atMax = quantity >= MAX_QUANTITY;
  const offset = reduced ? 0 : 10;

  return (
    <div className={styles.stepper} role="group" aria-label={t('quantityGroup', { name })}>
      <button type="button" className={styles.step} aria-label={t('decrease', { name })} aria-disabled={atMin || undefined} onClick={() => !atMin && onChange(quantity - 1)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="M4 8h8" />
        </svg>
      </button>
      <span className={styles.qty}>
        <span className="visually-hidden">{format.number(quantity)}</span>
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.span
            key={quantity}
            aria-hidden="true"
            className={styles.qtyValue}
            custom={direction}
            variants={{
              enter: (dir: number) => ({ opacity: 0, y: dir * offset }),
              center: { opacity: 1, y: 0 },
              exit: (dir: number) => ({ opacity: 0, y: dir * -offset }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduced ? DURATION.micro : DURATION.micro * 1.5, ease: EASE.out.bezier }}
          >
            {format.number(quantity)}
          </motion.span>
        </AnimatePresence>
      </span>
      <button type="button" className={styles.step} aria-label={t('increase', { name })} aria-disabled={atMax || undefined} onClick={() => onChange(quantity + 1)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="M4 8h8M8 4v8" />
        </svg>
      </button>
    </div>
  );
}
