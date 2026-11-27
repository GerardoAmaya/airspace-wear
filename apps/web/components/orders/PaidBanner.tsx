'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import styles from './orders.module.css';

// Rayos HUD alrededor de la marca (ángulos en grados).
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

// Aviso de pago confirmado al volver de Stripe: el panel entra, la marca de
// verificación aparece con un pequeño rebote y un anillo y unos rayos HUD se
// abren una sola vez. Solo transform y opacidad; con movimiento reducido,
// un fundido corto. El texto se lee desde el primer momento.
export function PaidBanner() {
  const t = useTranslations('Orders');
  const reduced = useMotionStore((state) => state.reducedMotion);
  const ease = EASE.out.bezier;
  return (
    <motion.section
      className={styles.banner}
      data-tone="ok"
      role="status"
      aria-labelledby="paid-title"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduced ? DURATION.micro : DURATION.reveal, ease }}
    >
      <span className={styles.bannerMarkWrap} aria-hidden="true">
        {!reduced && (
          <>
            <motion.span
              className={styles.bannerRing}
              initial={{ opacity: 0.9, scale: 0.6 }}
              animate={{ opacity: 0, scale: 2.2 }}
              transition={{ duration: DURATION.cinematic, ease, delay: 0.25 }}
            />
            {RAYS.map((angle, index) => (
              <span key={angle} className={styles.bannerRayArm} style={{ transform: `rotate(${angle}deg)` }}>
                <motion.span
                  className={styles.bannerRay}
                  initial={{ opacity: 0, x: 0, scaleX: 0.2 }}
                  animate={{ opacity: [0, 1, 0], x: 26, scaleX: 1 }}
                  transition={{ duration: DURATION.reveal, ease, delay: 0.3 + index * 0.02 }}
                />
              </span>
            ))}
          </>
        )}
        <motion.span
          className={styles.bannerMark}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.3, rotate: -20 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={reduced ? { duration: DURATION.micro } : { type: 'spring', stiffness: 420, damping: 18, delay: 0.15 }}
        />
      </span>
      <div>
        <h2 id="paid-title" className={styles.bannerTitle}>
          {t('paidTitle')}
        </h2>
        <p>{t('paidText')}</p>
      </div>
    </motion.section>
  );
}
