import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Link, redirect y hooks de navegación que respetan el idioma activo.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
