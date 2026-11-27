'use client';

import type { Locale } from '@airspace/contracts';
import type { CatalogEntry } from '@/components/home/stylist/api-engine';
import type { StylistScript } from '@/components/home/stylist/engine';

// Datos del panel (guion de respaldo, ideas sugeridas y catálogo para las
// tarjetas), servidos por app/api/stylist/context. Se piden una sola vez por
// idioma y visita: al pasar sobre el robot (precarga) o al abrir el panel.
export interface StylistContext {
  script: StylistScript;
  chips: { id: string; label: string }[];
  catalog: Record<string, CatalogEntry>;
}

const cache = new Map<Locale, Promise<StylistContext>>();

export function loadStylistContext(locale: Locale): Promise<StylistContext> {
  let pending = cache.get(locale);
  if (!pending) {
    pending = fetch(`/api/stylist/context?locale=${locale}`).then((response) => {
      if (!response.ok) throw new Error(`stylist context ${response.status}`);
      return response.json() as Promise<StylistContext>;
    });
    // Si falla (red), el siguiente intento vuelve a pedirlo.
    pending.catch(() => cache.delete(locale));
    cache.set(locale, pending);
  }
  return pending;
}
