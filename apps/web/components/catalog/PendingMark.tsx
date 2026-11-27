'use client';

import { useLinkStatus } from 'next/link';
import { usePendingMark } from '@/lib/catalog-pending';

// Va dentro de un <Link> del catálogo (filtros, orden, píldoras): mientras su
// navegación espera la respuesta, la rejilla se atenúa (ver ResultsRegion).
export function PendingMark() {
  const { pending } = useLinkStatus();
  usePendingMark(pending);
  return null;
}
