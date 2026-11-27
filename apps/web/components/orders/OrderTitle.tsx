'use client';

import { useRef, ViewTransition } from 'react';
import { gsap, useGSAP } from '@/lib/motion/gsap';
import { SplitText } from '@/lib/motion/split-text';
import { DURATION, EASE } from '@/lib/motion/tokens';
import styles from './orders.module.css';

// Número del pedido como titular. Llega desde la fila de la lista con
// <ViewTransition> (mismo name, morph de la fila al titular) y, al aparecer,
// sus caracteres suben dentro de una máscara (SplitText, una sola vez).
// El estado inicial oculto vive en CSS (data-split="idle", solo con
// movimiento permitido) con un respaldo que lo muestra a los 6 s: el texto
// nunca depende de la animación para leerse.
export function OrderTitle({ id, number }: { id: string; number: string }) {
  const title = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      const element = title.current;
      if (!element) return;
      if (!document.documentElement.classList.contains('motion-ok')) {
        element.dataset.split = 'done';
        return;
      }
      const split = SplitText.create(element, { type: 'chars', mask: 'chars' });
      element.dataset.split = 'run';
      const tween = gsap.fromTo(
        split.chars,
        { yPercent: 110 },
        {
          yPercent: 0,
          duration: DURATION.reveal,
          ease: EASE.out.gsap,
          stagger: 0.03,
          onComplete: () => {
            split.revert();
            element.dataset.split = 'done';
          },
        },
      );
      return () => {
        tween.kill();
        split.revert();
      };
    },
    { scope: title },
  );

  return (
    <ViewTransition name={`order-number-${id}`} share="morph" default="none">
      <h1 ref={title} className={styles.detailTitle} data-split="idle">
        {number}
      </h1>
    </ViewTransition>
  );
}
