'use client';

import { useEffect, useRef } from 'react';

const requested = new Set<string>();

// Prefetch del modelo 3D al pasar el cursor o enfocar la tarjeta (CLAUDE.md:
// "load 3D models on demand and prefetch on hover or focus"). Baja el GLB con
// prioridad baja a la caché HTTP; la ficha lo encuentra listo.
export function PrefetchModel({ url }: { url: string }) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const card = anchor.current?.closest('article');
    if (!card) return;
    const prefetch = () => {
      if (requested.has(url)) return;
      requested.add(url);
      void fetch(url, { priority: 'low' } as RequestInit).catch(() => requested.delete(url));
    };
    card.addEventListener('pointerenter', prefetch, { once: true });
    card.addEventListener('focusin', prefetch, { once: true });
    return () => {
      card.removeEventListener('pointerenter', prefetch);
      card.removeEventListener('focusin', prefetch);
    };
  }, [url]);

  return <span ref={anchor} hidden />;
}
