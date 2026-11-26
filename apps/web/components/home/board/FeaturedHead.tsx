'use client';

import { useRef } from 'react';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { DURATION, EASE } from '@/lib/motion/tokens';
import styles from './Featured.module.css';
import { scramble } from './scramble';
import ui from './ui.module.css';

// Textos del encabezado, ya traducidos y formateados en el servidor (cada
// sección usa su propio espacio de nombres de mensajes).
export interface FeaturedHeadCopy {
  store: string;
  kicker: string;
  title: string;
  // Conteo con relleno, por ejemplo "06 pares" o "06 prendas".
  count: string;
  lead: string;
}

// Encabezado de "Destacados" y de "Ropa". Único guiño al tablero de salidas:
// el título y el conteo se decodifican letra por letra una sola vez, cuando el
// encabezado entra en vista (ScrollTrigger solo como disparador, once: true).
// Con movimiento reducido o sin JS el texto se ve fijo desde el inicio. El
// estado oculto vive en CSS (Featured.module.css, [data-enter='idle']).
export function FeaturedHead({ brands, copy, titleId }: { brands: string[]; copy: FeaturedHeadCopy; titleId: string }) {
  const root = useRef<HTMLDivElement>(null);
  const { title, count: countText } = copy;

  useGSAP(
    () => {
      const element = root.current;
      if (!element) return;
      if (!document.documentElement.classList.contains('motion-ok')) {
        element.dataset.enter = 'done';
        return;
      }
      const targets = Array.from(element.querySelectorAll<HTMLElement>('[data-scramble]'));
      const rule = element.querySelector<HTMLElement>('[data-rule]');
      const fades = Array.from(element.querySelectorAll<HTMLElement>('[data-fade]'));
      let timeline: gsap.core.Timeline | null = null;

      const done = () => {
        element.dataset.enter = 'done';
        gsap.set([rule, ...fades].filter(Boolean), { clearProps: 'opacity,transform' });
      };
      const play = () => {
        if (element.dataset.enter !== 'idle') return;
        timeline = gsap.timeline({ onComplete: done });
        if (rule) timeline.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: DURATION.cinematic, ease: EASE.inOut.gsap }, 0);
        targets.forEach((target, index) => {
          // Primer cuadro ya cifrado: el texto final no asoma antes del giro.
          const text = target.dataset.scramble ?? '';
          target.textContent = text.replace(/\S/g, '0');
          timeline!.add(scramble(target, text, { duration: index === 0 ? 0.9 : 0.7 }), index * 0.15);
        });
        timeline.fromTo(fades, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: DURATION.reveal, ease: EASE.out.gsap, stagger: 0.08 }, 0.2);
        element.dataset.enter = 'run';
      };
      // Si el foco entra a la sección antes de la entrada, se completa al instante.
      const section = element.closest('section') ?? element;
      const finish = () => {
        if (timeline) timeline.progress(1);
        else if (element.dataset.enter === 'idle') done();
      };
      const trigger = ScrollTrigger.create({ trigger: element, start: 'top 85%', end: 'max', once: true, onEnter: play });
      section.addEventListener('focusin', finish);
      return () => {
        trigger.kill();
        section.removeEventListener('focusin', finish);
        timeline?.kill();
      };
    },
    { scope: root },
  );

  return (
    <div ref={root} className={styles.head} data-enter="idle">
      <div className={styles.intro} aria-hidden="true">
        <span className={ui.hudLabel}>{copy.store}</span>
        <span className={styles.introRule} data-rule="" />
        <span className={`${ui.hudLabel} ${styles.introBrands}`}>{brands.join(' · ')}</span>
      </div>

      <div className={styles.headMeta}>
        <p className={`${ui.hudLabel} ${ui.hudPrimary}`}>{copy.kicker}</p>
        <p className={`${ui.hudLabel} ${styles.count}`}>
          <span className="visually-hidden">{countText}</span>
          <span aria-hidden="true" data-scramble={countText}>
            {countText}
          </span>
        </p>
      </div>

      <div className={styles.headTitle}>
        <h2 id={titleId} className={`${ui.display} ${styles.title}`}>
          <span className="visually-hidden">{title}</span>
          <span aria-hidden="true" data-scramble={title}>
            {title}
          </span>
        </h2>
        <p className={styles.lead} data-fade="">
          {copy.lead}
        </p>
      </div>
    </div>
  );
}
