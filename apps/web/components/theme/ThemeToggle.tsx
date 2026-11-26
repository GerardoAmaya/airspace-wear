'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useThemeStore } from '@/lib/theme';
import styles from './ThemeToggle.module.css';

// Interruptor Noche / Día. Sigue al sistema mientras no haya elección guardada.
export function ThemeToggle() {
  const t = useTranslations('Theme');
  const theme = useThemeStore((state) => state.theme);
  const sync = useThemeStore((state) => state.sync);
  const setTheme = useThemeStore((state) => state.setTheme);

  useEffect(() => {
    sync();
    const query = matchMedia('(prefers-color-scheme: light)');
    const onChange = (event: MediaQueryListEvent) => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem('airspace-theme');
      } catch {
        saved = null;
      }
      if (!saved) setTheme(event.matches ? 'light' : 'dark');
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [sync, setTheme]);

  const isLight = theme === 'light';
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={isLight ? t('toDark') : t('toLight')}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setTheme(isLight ? 'dark' : 'light', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }}
    >
      {isLight ? (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="3.2" fill="currentColor" />
          <path stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M10.6 1.4a6.6 6.6 0 1 0 4 10.9A5.6 5.6 0 0 1 10.6 1.4Z" />
        </svg>
      )}
      <span className={styles.label} aria-hidden="true">
        {isLight ? t('day') : t('night')}
      </span>
    </button>
  );
}
