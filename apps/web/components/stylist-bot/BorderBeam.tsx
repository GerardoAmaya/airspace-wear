'use client';

import { motion, type MotionStyle } from 'motion/react';
import type { CSSProperties } from 'react';
import styles from './BorderBeam.module.css';

// Línea de luz que recorre el borde de su contenedor (portada del BorderBeam
// de Magic UI del portafolio). El contenedor necesita position: relative y
// su propio border-radius; el haz lo hereda. Solo anima offset-distance.
export function BorderBeam({
  size = 50,
  duration = 6,
  delay = 0,
  colorFrom = 'var(--color-primary-fill)',
  colorTo = 'var(--color-secondary-fill)',
  borderWidth = 1,
}: {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
}) {
  return (
    <div className={styles.frame} style={{ '--beam-width': `${borderWidth}px` } as CSSProperties} aria-hidden="true">
      <motion.div
        className={styles.beam}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            '--beam-from': colorFrom,
            '--beam-to': colorTo,
          } as MotionStyle
        }
        initial={{ offsetDistance: '0%' }}
        animate={{ offsetDistance: ['0%', '100%'] }}
        transition={{ repeat: Infinity, ease: 'linear', duration, delay: -delay }}
      />
    </div>
  );
}
