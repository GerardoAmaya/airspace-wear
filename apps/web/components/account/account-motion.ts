'use client';

import type { RefObject } from 'react';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { SplitText } from '@/lib/motion/split-text';
import { DURATION, EASE } from '@/lib/motion/tokens';

// Entradas de la página de cuenta (una sola vez por bloque, por tiempo).
// Cada bloque con [data-enter] entra cuando aparece (ScrollTrigger solo como
// disparador, sin scrub) y anima sus piezas marcadas:
//   [data-item]   suben y aparecen en cascada
//   [data-ring]   el anillo HUD del avatar gira hasta su lugar y aparece
//   [data-name]   el nombre se revela por letras con máscara (SplitText)
//   [data-rule]   una línea que se dibuja de izquierda a derecha (scaleX)
//   [data-count]  números que cuentan desde 0 (format() escribe el texto)
//   [data-bar]    barras de avance que crecen desde 0 (scaleX)
//
// El estado oculto vive en el CSS (Dashboard.module.css, solo con
// html.motion-ok): sin JS o con movimiento reducido todo se ve desde el
// inicio y los números muestran su valor final. Si el foco del teclado
// entra antes de tiempo, la entrada se completa al instante. end: 'max' completa también
// los bloques que una recarga dejó por encima de la pantalla.
export function useAccountEntrance(root: RefObject<HTMLElement | null>, format: (kind: string, value: number) => string) {
  useGSAP(
    () => {
      const element = root.current;
      if (!element) return;
      const blocks = Array.from(element.querySelectorAll<HTMLElement>('[data-enter]'));
      if (!document.documentElement.classList.contains('motion-ok')) {
        for (const block of blocks) block.dataset.entered = '';
        return;
      }
      const cleanups = blocks.map((block) => enterBlock(block, format));
      return () => cleanups.forEach((cleanup) => cleanup());
    },
    { scope: root },
  );
}

function enterBlock(block: HTMLElement, format: (kind: string, value: number) => string): () => void {
  const q = gsap.utils.selector(block);
  const items = q('[data-item]');
  const rings = q('[data-ring]');
  const names = q('[data-name]') as HTMLElement[];
  const rules = q('[data-rule]');
  const counts = q('[data-count]') as HTMLElement[];
  const bars = q('[data-bar]');
  const splits: SplitText[] = [];
  // JS listo: el CSS deja de usar su respaldo por tiempo.
  block.dataset.ready = '';

  const timeline = gsap.timeline({
    paused: true,
    defaults: { ease: EASE.out.gsap, duration: DURATION.reveal },
    onComplete: () => {
      block.dataset.entered = '';
      for (const split of splits) split.revert();
      gsap.set([block, ...items, ...rings, ...names, ...rules, ...bars], { clearProps: 'opacity,transform' });
    },
  });

  timeline.fromTo(block, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: DURATION.ui * 2 }, 0);
  if (rings.length) timeline.fromTo(rings, { opacity: 0, scale: 0.82, rotation: -70 }, { opacity: 1, scale: 1, rotation: 0, duration: DURATION.cinematic }, 0.05);
  for (const name of names) {
    // Máscara por palabra: las letras suben desde abajo de su línea.
    const split = SplitText.create(name, { type: 'words,chars', mask: 'words' });
    splits.push(split);
    timeline.set(name, { opacity: 1 }, 0.15).fromTo(split.chars, { yPercent: 115 }, { yPercent: 0, stagger: 0.03, duration: DURATION.reveal }, 0.15);
  }
  if (rules.length) timeline.fromTo(rules, { scaleX: 0 }, { scaleX: 1, duration: DURATION.cinematic, ease: EASE.inOut.gsap }, 0.2);
  if (items.length) timeline.fromTo(items, { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.07 }, 0.12);
  if (bars.length) timeline.fromTo(bars, { scaleX: 0 }, { scaleX: (_index: number, target: HTMLElement) => Number(target.dataset.bar) || 0, stagger: 0.08, duration: DURATION.cinematic }, 0.35);
  for (const counter of counts) {
    const target = Number(counter.dataset.count) || 0;
    const kind = counter.dataset.kind ?? 'number';
    const state = { value: 0 };
    timeline.to(
      state,
      {
        value: target,
        duration: DURATION.cinematic,
        ease: 'power2.out',
        immediateRender: false,
        onStart: () => {
          counter.textContent = format(kind, 0);
        },
        onUpdate: () => {
          counter.textContent = format(kind, state.value);
        },
        onComplete: () => {
          counter.textContent = format(kind, target);
        },
      },
      0.25,
    );
  }

  const trigger = ScrollTrigger.create({ trigger: block, start: 'top 90%', end: 'max', once: true, onEnter: () => timeline.play() });
  // Teclado: si el foco llega antes de la entrada, todo queda en su lugar.
  // Solo con foco de teclado (:focus-visible): con el mouse, saltar al final
  // movería el botón entre mousedown y mouseup y el clic se perdería.
  const finish = (event: FocusEvent) => {
    if (event.target instanceof Element && event.target.matches(':focus-visible')) timeline.progress(1);
  };
  block.addEventListener('focusin', finish);
  return () => {
    block.removeEventListener('focusin', finish);
    trigger.kill();
    timeline.kill();
    for (const split of splits) split.revert();
  };
}
