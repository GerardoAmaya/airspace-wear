'use client';

import { useParams } from 'next/navigation';
import { ViewTransition } from 'react';

// Marco del visor mientras llegan los datos. Lleva el mismo nombre de
// transición que la tarjeta del catálogo: así la tarjeta se transforma en
// este marco al navegar, y luego el marco en el visor real. El slug sale de
// la URL en el cliente (sin bloquear la navegación instantánea).
export function MediaSkeleton({ className, haloClassName }: { className: string; haloClassName: string }) {
  const { slug } = useParams<{ slug: string }>();
  return (
    <ViewTransition name={`product-media-${slug}`} share="morph" default="none">
      <div className={className}>
        <div className={haloClassName} aria-hidden="true" />
      </div>
    </ViewTransition>
  );
}
