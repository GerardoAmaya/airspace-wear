// Tema claro / oscuro. El script del <head> en index.html ya fijó
// data-theme antes de pintar (sin parpadeo); este módulo maneja el cambio.
//
// Prioridad: ?theme=light|dark en la URL (no se guarda), luego la elección
// guardada, luego la preferencia del sistema.
// Al cambiar se emite el evento "themechange" en document con { theme }.

import { reducedMotion } from './motion.js';

const STORAGE_KEY = 'airspace-theme';
const root = document.documentElement;

export const getTheme = () => root.dataset.theme ?? 'dark';

function hasSavedChoice() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

// La barra del navegador móvil toma el color de fondo del tema activo.
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const background = getComputedStyle(root).getPropertyValue('--color-background').trim();
  if (meta && background) meta.setAttribute('content', background);
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  syncThemeColor();
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

// Cambia de tema. Con View Transitions, el nuevo tema se revela en un
// círculo que crece desde el punto de origen (el interruptor).
export function setTheme(theme, { origin, persist = true } = {}) {
  if (theme === getTheme()) return;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Sin almacenamiento disponible: el cambio vale solo para esta visita.
    }
  }
  if (!document.startViewTransition || reducedMotion) {
    applyTheme(theme);
    return;
  }
  const x = origin?.x ?? innerWidth / 2;
  const y = origin?.y ?? 0;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const transition = document.startViewTransition(() => applyTheme(theme));
  transition.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 700, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
}

// Conecta el botón del encabezado y sigue al sistema mientras no haya elección guardada.
export function initThemeToggle(button) {
  const label = button.querySelector('.theme-toggle__label');
  const sync = () => {
    const isLight = getTheme() === 'light';
    // Una sola semántica: la etiqueta dice la acción (sin aria-pressed, que
    // con una etiqueta cambiante se lee contradictorio).
    button.setAttribute('aria-label', isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
    if (label) label.textContent = isLight ? 'Día' : 'Noche';
  };
  button.addEventListener('click', (event) => {
    const rect = button.getBoundingClientRect();
    setTheme(getTheme() === 'dark' ? 'light' : 'dark', {
      origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    });
  });
  document.addEventListener('themechange', sync);
  syncThemeColor();
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (event) => {
    if (!hasSavedChoice()) setTheme(event.matches ? 'light' : 'dark', { persist: false });
  });
  sync();
}
