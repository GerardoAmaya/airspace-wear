'use client';

import type { ComponentProps } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { WARM_ON_INTENT } from '@/lib/auth/warm';

// Enlace del encabezado a una página propia: marca la página actual (y sus
// subpáginas, como /orders/[id]) con aria-current="page". Con warmOnIntent
// despierta la base al acercarse (páginas con sesión, lib/auth/warm.ts).
export function NavLink({ href, warmOnIntent = false, ...props }: Omit<ComponentProps<typeof Link>, 'href'> & { href: string; warmOnIntent?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return <Link href={href} aria-current={active ? 'page' : undefined} {...(warmOnIntent ? WARM_ON_INTENT : {})} {...props} />;
}
