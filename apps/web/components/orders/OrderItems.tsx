'use client';

import type { OrderItem } from '@airspace/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { formatPrice } from '@/lib/price';
import styles from './orders.module.css';

// Cuántas líneas se ven antes de "Ver todo".
const VISIBLE = 3;

// Productos del pedido. Con más de 3 líneas, el resto se despliega con un
// botón; Motion anima la entrada y salida de cada línea (transform y
// opacidad, sin animar alturas) y el reacomodo con layout.
export function OrderItems({ items }: { items: OrderItem[] }) {
  const t = useTranslations('Orders');
  const locale = useLocale();
  const reduced = useMotionStore((state) => state.reducedMotion);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const shown = expanded ? items : items.slice(0, VISIBLE);
  const hidden = items.length - VISIBLE;

  return (
    <>
      <ul id={listId} className={styles.items}>
        <AnimatePresence initial={false}>
          {shown.map((item, index) => (
            <motion.li
              key={`${item.slug}:${item.size ?? ''}:${index}`}
              className={styles.item}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{ duration: DURATION.ui, ease: EASE.out.bezier, delay: expanded && index >= VISIBLE ? (index - VISIBLE) * 0.04 : 0 }}
            >
              <span className={styles.thumb} aria-hidden="true">
                {item.image && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- póster pequeño por tema; next/image no aporta aquí */}
                    <img src={item.image.dark} alt="" className={styles.thumbDark} loading="lazy" decoding="async" />
                    {/* eslint-disable-next-line @next/next/no-img-element -- póster pequeño por tema */}
                    <img src={item.image.light} alt="" className={styles.thumbLight} loading="lazy" decoding="async" />
                  </>
                )}
              </span>
              <span className={styles.itemText}>
                <span className={styles.hud}>{item.brand}</span>
                <Link href={`/products/${item.slug}`} className={styles.itemName}>
                  {item.name}
                </Link>
                <span className={styles.itemMeta}>
                  {[item.detail, item.size ? t('size', { size: item.size }) : null, t('quantity', { count: item.quantity })].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={styles.itemPrice}>{formatPrice(item.lineTotal, locale)}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {hidden > 0 && (
        <motion.button
          type="button"
          className={styles.moreButton}
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((current) => !current)}
          whileTap={reduced ? undefined : { scale: 0.97 }}
        >
          {expanded ? t('showLess') : t('showMore', { count: hidden })}
          <motion.svg
            viewBox="0 0 12 12"
            width="10"
            height="10"
            aria-hidden="true"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: reduced ? 0 : DURATION.ui, ease: EASE.out.bezier }}
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </motion.svg>
        </motion.button>
      )}
    </>
  );
}
