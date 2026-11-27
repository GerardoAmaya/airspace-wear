'use client';

import type { OrderStatus, TrackingStepKey } from '@airspace/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import styles from './orders.module.css';

// Estado del pedido: pendiente o vencido (pago sin completar) o, si está
// pagado, el paso actual del seguimiento. Cuando cambia (pago confirmado,
// paso nuevo), Motion cruza el texto viejo con el nuevo (solo opacidad con
// movimiento reducido).
export function StatusChip({ status, stage }: { status: OrderStatus; stage: TrackingStepKey | null }) {
  const t = useTranslations('Orders');
  const reduced = useMotionStore((state) => state.reducedMotion);
  const tone = status === 'paid' ? (stage === 'delivered' ? 'done' : 'live') : status;
  const label = status === 'paid' && stage ? t(`stage.${stage}`) : t(`status.${status}`);
  const offset = reduced ? 0 : 8;
  return (
    <span className={styles.chip} data-tone={tone}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={label}
          className={styles.chipText}
          initial={{ opacity: 0, y: offset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -offset }}
          transition={{ duration: DURATION.ui, ease: EASE.out.bezier }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
