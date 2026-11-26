'use client';

import { create } from 'zustand';

export type Theme = 'dark' | 'light';
const STORAGE_KEY = 'airspace-theme';

// Tema activo. El script del <head> ya fijó data-theme antes de pintar (sin
// parpadeo); este store lo refleja para los componentes y las escenas 3D.
interface ThemeState {
  theme: Theme;
  sync(): void;
  setTheme(theme: Theme, origin?: { x: number; y: number }): void;
}

const readTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  // La barra del navegador móvil toma el fondo del tema.
  const background = getComputedStyle(root).getPropertyValue('--color-background').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'dark',
  sync: () => set({ theme: readTheme() }),
  setTheme(theme, origin) {
    if (theme === readTheme()) return;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Sin almacenamiento: el cambio vale solo para esta visita.
    }
    const commit = () => {
      applyTheme(theme);
      set({ theme });
    };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduced) {
      commit();
      return;
    }
    // El tema nuevo se revela en un círculo que crece desde el interruptor.
    const x = origin?.x ?? innerWidth / 2;
    const y = origin?.y ?? 0;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(commit);
    void transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 700, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    });
  },
}));
