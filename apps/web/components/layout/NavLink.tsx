'use client';

import type { ComponentProps } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

// Enlace del encabezado a una página propia: marca la página actual (y sus
// subpáginas, como /orders/[id]) con aria-current="page".
export function NavLink({ href, ...props }: Omit<ComponentProps<typeof Link>, 'href'> & { href: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return <Link href={href} aria-current={active ? 'page' : undefined} {...props} />;
}
