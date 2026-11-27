'use client';

import { type ComponentProps, type MouseEvent, useState, useTransition } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { usePendingMark } from '@/lib/catalog-pending';
import { scrollToElement } from '@/lib/motion/scroll';
import { RESULTS_ID } from '@/lib/pagination';

// Duración del salto al inicio de los resultados.
const SCROLL_SECONDS = 0.8;

type PageLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'onClick' | 'scroll' | 'prefetch'> & {
  href: { pathname: '/catalog'; query: Record<string, string> };
  // Anterior y Siguiente: se precargan completas al verse (son el clic más
  // probable). Los números, al pasar el puntero o enfocarlos.
  eager?: boolean;
};

// Enlace del paginador: un <a> real (funciona sin JS y lo siguen los
// buscadores). Con JS, el clic pide la página nueva y a la vez sube con
// suavidad al inicio de los resultados: no espera a que termine el salto.
// Mientras llega, la rejilla actual se atenúa (ResultsRegion); al llegar, sus
// tarjetas hacen su entrada ya con la vista arriba. Con movimiento reducido
// el salto es inmediato.
export function PageLink({ href, eager = false, onMouseEnter, onFocus, onTouchStart, ...props }: PageLinkProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  usePendingMark(pending);
  // Precarga completa (con los resultados, no solo el cascarón) a pedido.
  const [warm, setWarm] = useState(eager);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    startTransition(() => router.push(href, { scroll: false }));
    const target = document.getElementById(RESULTS_ID);
    if (target) scrollToElement(target, { duration: SCROLL_SECONDS });
  };

  return (
    <Link
      href={href}
      scroll={false}
      prefetch={warm ? true : null}
      onClick={onClick}
      onMouseEnter={(event) => {
        setWarm(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setWarm(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setWarm(true);
        onTouchStart?.(event);
      }}
      {...props}
    />
  );
}
