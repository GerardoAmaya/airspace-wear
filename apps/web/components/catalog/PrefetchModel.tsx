'use client';

import { useEffect, useRef } from 'react';

const requested = new Set<string>();

// Prefetch del modelo 3D al pasar el cursor o enfocar la tarjeta (CLAUDE.md:
// "load 3D models on demand and prefetch on hover or focus"). Baja el GLB con
// prioridad baja a la caché HTTP; la ficha lo encuentra listo. En modo
// liviano se baja la variante -lite, que es la que usará la ficha.
export function PrefetchModel({ url, liteUrl }: { url: string; liteUrl: string }) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const card = anchor.current?.closest('article');
    if (!card) return;
    const target = document.documentElement.classList.contains('lite') ? liteUrl : url;
    const prefetch = () => {
      if (requested.has(target)) return;
      requested.add(target);
      void fetch(target, { priority: 'low' } as RequestInit).catch(() => requested.delete(target));
    };
    card.addEventListener('pointerenter', prefetch, { once: true });
    card.addEventListener('focusin', prefetch, { once: true });
    return () => {
      card.removeEventListener('pointerenter', prefetch);
      card.removeEventListener('focusin', prefetch);
    };
  }, [url, liteUrl]);

  return <span ref={anchor} hidden />;
}
