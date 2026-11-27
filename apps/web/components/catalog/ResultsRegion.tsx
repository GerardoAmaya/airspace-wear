'use client';

import type { ReactNode } from 'react';
import { useCatalogPending } from '@/lib/catalog-pending';
import { RESULTS_ID } from '@/lib/pagination';

// Bloque de resultados (conteo, rejilla y paginador), destino del salto al
// cambiar de página. Con una navegación del catálogo en curso lleva
// data-pending (el CSS atenúa la rejilla) y aria-busy.
export function ResultsRegion({ className, children }: { className?: string; children: ReactNode }) {
  const pending = useCatalogPending();
  return (
    <div id={RESULTS_ID} className={className} data-pending={pending || undefined} aria-busy={pending || undefined}>
      {children}
    </div>
  );
}
