'use client';

import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import styles from './SiteHeader.module.css';

// Parte interactiva del encabezado: barra sólida al bajar (un cambio de
// estado al cruzar 8 px, no una animación ligada al scroll) y menú
// desplegable por debajo de 960 px.
export function HeaderShell({
  logo,
  nav,
  tools,
  menuExtras,
  labels,
}: {
  logo: ReactNode;
  nav: ReactNode;
  tools: ReactNode;
  menuExtras: ReactNode;
  labels: { open: string; close: string; nav: string };
}) {
  const [scrolled, setScrolled] = useState(false);
  // El menú queda abierto solo en la ruta donde se abrió: al navegar se
  // cierra solo, sin un efecto que lo cierre.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const header = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const menuOpen = openPath === pathname;
  const setMenuOpen = (open: boolean) => setOpenPath(open ? pathname : null);

  useEffect(() => {
    const sync = () => setScrolled(window.scrollY > 8);
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    return () => window.removeEventListener('scroll', sync);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpenPath(null);
    const onPointer = (event: PointerEvent) => !header.current?.contains(event.target as Node) && setOpenPath(null);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [menuOpen]);

  return (
    <header ref={header} className={styles.header} data-scrolled={scrolled || undefined} data-menu-open={menuOpen || undefined}>
      {logo}
      <nav id="site-nav" className={styles.nav} aria-label={labels.nav}>
        {nav}
        <div className={styles.menuExtras}>{menuExtras}</div>
      </nav>
      <div className={styles.tools}>
        {tools}
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          aria-label={menuOpen ? labels.close : labels.open}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className={styles.bars} aria-hidden="true">
            <span />
            <span />
          </span>
        </button>
      </div>
    </header>
  );
}
