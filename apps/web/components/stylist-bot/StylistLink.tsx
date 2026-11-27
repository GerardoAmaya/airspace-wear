'use client';

import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { HOME_ANCHORS, HOME_SECTIONS } from '@/lib/home';
import { openStylist } from './stylist-store';

// Enlace "Estilista IA" del encabezado y del pie: abre el panel del estilista
// en la misma página. Sin JS (o con Cmd/Ctrl + clic) sigue siendo un enlace
// normal: a la sección de la home si está a la vista (HOME_SECTIONS.stylist)
// o, si está oculta, al catálogo (lo que el estilista recomienda; el robot
// también está ahí). data-stylist-open hace que el salto suave a anclas
// (MotionRoot) lo deje pasar.
const FALLBACK = HOME_SECTIONS.stylist ? { pathname: '/', hash: HOME_ANCHORS.stylist } : { pathname: '/catalog' };
export function StylistLink({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Link
      href={FALLBACK}
      className={className}
      data-stylist-open=""
      aria-haspopup="dialog"
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openStylist();
      }}
    >
      {children}
    </Link>
  );
}
