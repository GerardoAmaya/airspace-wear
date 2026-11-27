'use client';

import { type ReactNode, useEffect, useRef } from 'react';

// Lista del control segmentado. En el teléfono se desliza de lado: al cargar
// y al cambiar de categoría, la elegida queda a la vista (solo se mueve la
// lista, nunca la página, y sin animación).
export function SegmentedList({ className, label, active, children }: { className: string; label: string; active?: string; children: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const element = list.current;
    const current = element?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!element || !current) return;
    const item = current.getBoundingClientRect().left - element.getBoundingClientRect().left + element.scrollLeft;
    if (item < element.scrollLeft || item + current.offsetWidth > element.scrollLeft + element.clientWidth) {
      element.scrollLeft = item - (element.clientWidth - current.offsetWidth) / 2;
    }
  }, [active]);

  return (
    <ul ref={list} className={className} aria-label={label}>
      {children}
    </ul>
  );
}
