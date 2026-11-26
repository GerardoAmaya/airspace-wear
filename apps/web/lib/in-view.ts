'use client';

import { useEffect, useState } from 'react';

// Si el elemento está a la vista (para pausar la flotación del póster fuera
// de pantalla). Cambia solo al cruzar el borde, nunca por cuadro. Vive aparte
// de lib/three/poster-match para no arrastrar three.js al JS inicial.
export function useInView(element: Element | null): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return inView;
}
