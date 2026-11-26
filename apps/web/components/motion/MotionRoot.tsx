'use client';

import type Lenis from 'lenis';
import { ReactLenis, type LenisRef } from 'lenis/react';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from '@/lib/motion/gsap';
import { scrollToElement } from '@/lib/motion/scroll';
import { useMotionStore } from '@/lib/motion/store';

// Raíz del movimiento (una sola en el layout). Reglas de CLAUDE.md:
// - Lenis solo para saltos suaves de ancla: rueda y touch nativos.
// - Un solo ciclo de cuadros: Lenis se mueve desde gsap.ticker, sin
//   lagSmoothing, y cada scroll de Lenis actualiza ScrollTrigger.
// - Con movimiento reducido no hay saltos suaves.
// - ScrollTrigger se recalcula cuando cargan las fuentes.
// - Una recarga vuelve a la posición guardada.
export function MotionRoot({ children }: { children: ReactNode }) {
  const lenisRef = useRef<LenisRef>(null);
  const setMotion = useMotionStore((state) => state.set);

  useEffect(() => {
    const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
    const lenis: Lenis | null = reducedQuery.matches ? null : (lenisRef.current?.lenis ?? null);
    setMotion({ lenis, reducedMotion: reducedQuery.matches, lite: document.documentElement.classList.contains('lite') });

    const tick = (time: number) => lenis?.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    lenis?.on('scroll', ScrollTrigger.update);
    const onRefresh = () => lenis?.resize();
    ScrollTrigger.addEventListener('refresh', onRefresh);
    void document.fonts.ready.then(() => ScrollTrigger.refresh());

    const onReducedChange = (event: MediaQueryListEvent) => setMotion({ reducedMotion: event.matches });
    reducedQuery.addEventListener('change', onReducedChange);

    return () => {
      gsap.ticker.remove(tick);
      lenis?.off('scroll', ScrollTrigger.update);
      ScrollTrigger.removeEventListener('refresh', onRefresh);
      reducedQuery.removeEventListener('change', onReducedChange);
    };
  }, [setMotion]);

  return (
    <ReactLenis root ref={lenisRef} options={{ autoRaf: false, smoothWheel: false, syncTouch: false }}>
      <ScrollMemory />
      <AnchorLinks />
      {children}
    </ReactLenis>
  );
}

const SCROLL_KEY = 'airspace-scroll:';

// Recarga (Cmd+R): guarda la posición al salir y vuelve a ella cuando la
// página ya tiene su alto final (fuentes cargadas y dos cuadros después).
// html { overflow-anchor: none } evita que el navegador la mueva sola.
function ScrollMemory() {
  const pathname = usePathname();

  useEffect(() => {
    const key = SCROLL_KEY + pathname;
    const save = () => {
      try {
        sessionStorage.setItem(key, String(Math.round(window.scrollY)));
      } catch {
        // Sin almacenamiento: la recarga empieza arriba.
      }
    };
    window.addEventListener('pagehide', save);
    let stopWaiting = () => {};
    const reveal = () => document.documentElement.classList.remove('restoring');

    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    // Enlace profundo (#catalogo) en una visita nueva: se salta al destino
    // cuando todo tiene su alto final (el navegador lo haría antes de tiempo).
    const hashTarget = navigation?.type !== 'reload' && location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    if (hashTarget) {
      void document.fonts.ready.then(() =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            scrollToElement(hashTarget, { immediate: true, focus: false });
            ScrollTrigger.update();
          }),
        ),
      );
    }
    if (navigation?.type === 'reload') {
      let saved = 0;
      try {
        saved = Number(sessionStorage.getItem(key)) || 0;
      } catch {
        saved = 0;
      }
      if (saved <= 0) reveal();
      if (saved > 0) {
        const restore = () => {
          const { lenis } = useMotionStore.getState();
          if (lenis) lenis.scrollTo(saved, { immediate: true, force: true });
          else window.scrollTo(0, saved);
          ScrollTrigger.update();
          // Ya en su lugar: el contenido vuelve a verse en el cuadro siguiente
          // (lo ocultó el script del <head> para que no asome la parte de arriba).
          requestAnimationFrame(reveal);
        };
        // Páginas con contenido en streaming (catálogo, ficha): si aún no
        // alcanzan el alto guardado, se espera a que crezcan (hasta 4 s) en
        // lugar de quedar arriba.
        const tall = () => document.documentElement.scrollHeight - window.innerHeight >= saved - 1;
        void document.fonts.ready.then(() =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (tall()) return restore();
              const observer = new ResizeObserver(() => {
                if (!tall()) return;
                observer.disconnect();
                clearTimeout(timeout);
                restore();
              });
              const timeout = window.setTimeout(() => {
                observer.disconnect();
                restore();
              }, 4000);
              observer.observe(document.body);
              stopWaiting = () => {
                observer.disconnect();
                clearTimeout(timeout);
              };
            }),
          ),
        );
      }
    }
    if (navigation?.type !== 'reload') reveal();
    return () => {
      window.removeEventListener('pagehide', save);
      // Sin reveal() aquí: en desarrollo React desmonta y vuelve a montar el
      // efecto, y quitar la clase antes de restaurar dejaba ver la parte de
      // arriba. Si nunca se restaura, el script del <head> la quita a los 1,5 s.
      stopWaiting();
    };
  }, [pathname]);

  return null;
}

// Enlaces a una sección de la misma página (#catalogo, /#hangar desde la
// home): salto suave con Lenis y foco al destino, sin recargar ni escribir el
// ancla en la URL (así una recarga vuelve a la posición guardada). Se escucha
// en captura para adelantarse a la navegación de Next.
function AnchorLinks() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href*="#"]') as HTMLAnchorElement | null;
      if (!link) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash.length < 2) return;
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      scrollToElement(target);
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);
  return null;
}
