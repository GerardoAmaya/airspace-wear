'use client';

import { useEffect, useSyncExternalStore } from 'react';

// Navegaciones del catálogo en curso (página, filtros, orden, búsqueda). Cada
// origen marca su espera con usePendingMark y el bloque de resultados
// (ResultsRegion) atenúa la rejilla mientras haya alguna: el clic siempre
// tiene respuesta aunque la página nueva tarde en llegar.
let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Mientras pending sea true, cuenta como una navegación en curso.
export function usePendingMark(pending: boolean): void {
  useEffect(() => {
    if (!pending) return;
    count += 1;
    emit();
    return () => {
      count -= 1;
      emit();
    };
  }, [pending]);
}

export function useCatalogPending(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => count > 0,
    () => false,
  );
}
