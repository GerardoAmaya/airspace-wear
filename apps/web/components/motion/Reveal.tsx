'use client';

import { type ElementType, type ReactNode, useRef } from 'react';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { DURATION } from '@/lib/motion/tokens';

// Entrada de una sola vez cuando el bloque aparece (ScrollTrigger solo como
// disparador, sin scrub). Sus hijos directos suben y aparecen en cascada.
//
// - El estado oculto vive en CSS (base.css, [data-reveal]) y solo con
//   html.motion-ok (movimiento permitido): sin JS o con movimiento reducido,
//   todo se ve desde el inicio.
// - Si el foco entra antes de la animación, se completa al instante.
// - end: 'max' hace que una recarga más abajo también la complete.
//
// immediate: para la cabecera de una página, que ya está a la vista al llegar.
// La misma entrada (subir y aparecer en cascada) la hace CSS desde el primer
// pintado (base.css, [data-reveal='load']), sin esperar a que hidrate el JS:
// el texto principal se ve antes (LCP) y la animación no cambia.
//
// leadOnLoad: lo mismo solo para los 4 primeros hijos (la primera fila de
// una rejilla, ya a la vista al llegar); el resto entra al hacer scroll.
// Cuántos hijos anima CSS con leadOnLoad (debe coincidir con base.css).
const LEAD_COUNT = 4;

export function Reveal({
  as: Tag = 'div',
  className,
  stagger = 0.06,
  immediate = false,
  leadOnLoad = false,
  children,
}: {
  as?: ElementType;
  className?: string;
  stagger?: number;
  immediate?: boolean;
  leadOnLoad?: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const element = root.current;
      if (!element || immediate) return;
      element.dataset.ready = '';
      if (!document.documentElement.classList.contains('motion-ok')) {
        element.dataset.revealed = '';
        return;
      }
      // Los primeros 4 con leadOnLoad ya los anima CSS (base.css).
      const items = (Array.from(element.children) as HTMLElement[]).slice(leadOnLoad ? LEAD_COUNT : 0);
      const timeline = gsap.timeline({
        paused: true,
        onComplete: () => {
          element.dataset.revealed = '';
          gsap.set(items, { clearProps: 'opacity,transform' });
        },
      });
      // Al entrar (o al recargar más abajo), los hijos que ya quedaron por
      // encima de la pantalla aparecen sin esperar: la cascada empieza en el
      // primero visible, así no hay una pausa antes de lo que se ve.
      const play = () => {
        const visible = items.filter((item) => item.getBoundingClientRect().bottom > 0);
        const above = items.filter((item) => !visible.includes(item));
        if (above.length) gsap.set(above, { opacity: 1, y: 0 });
        if (visible.length) timeline.fromTo(visible, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: DURATION.reveal, stagger });
        timeline.play();
      };
      const trigger = ScrollTrigger.create({ trigger: element, start: 'top 88%', end: 'max', once: true, onEnter: play });
      const finish = () => {
        if (!timeline.duration()) play();
        timeline.progress(1);
      };
      element.addEventListener('focusin', finish);
      return () => {
        element.removeEventListener('focusin', finish);
        trigger.kill();
      };
    },
    { scope: root },
  );

  return (
    <Tag ref={root} className={className} data-reveal={immediate ? 'load' : ''} data-reveal-lead={leadOnLoad ? '' : undefined}>
      {children}
    </Tag>
  );
}
