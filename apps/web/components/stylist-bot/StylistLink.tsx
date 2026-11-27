'use client';

import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { HOME_ANCHORS } from '@/lib/home';
import { openStylist } from './stylist-store';

// Enlace "Estilista IA" del encabezado y del pie: abre el panel del estilista
// en la misma página. Sin JS (o con Cmd/Ctrl + clic) sigue siendo un enlace
// normal a la sección de la home. data-stylist-open hace que el salto suave
// a anclas (MotionRoot) lo deje pasar.
export function StylistLink({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Link
      href={{ pathname: '/', hash: HOME_ANCHORS.stylist }}
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
