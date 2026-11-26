// Punto de entrada del prototipo: inicia el movimiento y monta cada sección
// en el orden en que aparece en la página (importa para los ScrollTrigger
// con pin, que desplazan a todo lo que viene después).
//
// Contrato de cada sección (sections/<nombre>/<nombre>.js):
//   export async function mount(root, context) { ... }
// root es el elemento [data-section="<nombre>"] y context trae lo compartido.

import * as cart from './core/cart.js';
import { goTo, initHeader, resolveAnchor } from './core/header.js';
import * as hud from './core/hud.js';
import { AVAILABILITY, BALLS, CATALOG, FLIGHT_STATUS, findBall, findProduct, formatPrice } from './core/catalog.js';
import { initMotion, reducedMotion, scrollTo, setScrollLocked } from './core/motion.js';
import { BALL_SLUGS, MODEL_SLUGS, createStage } from './core/stage.js';
import { getTheme, initThemeToggle, setTheme } from './core/theme.js';

const SECTIONS = ['flight', 'departures', 'baggage', 'tower', 'boarding'];

// Modo liviano: lo activa el script del <head> en equipos modestos o ?lite en la URL.
const lite = document.documentElement.classList.contains('lite') || new URLSearchParams(location.search).has('lite');

const motion = initMotion();
initThemeToggle(document.querySelector('[data-theme-toggle]'));
initHeader({ motion });

// theme.onChange(callback) avisa con 'light' o 'dark' cuando cambia el tema;
// devuelve una función para dejar de escuchar.
const theme = {
  get: getTheme,
  set: setTheme,
  onChange(callback) {
    const listener = (event) => callback(event.detail.theme);
    document.addEventListener('themechange', listener);
    return () => document.removeEventListener('themechange', listener);
  },
};

const context = {
  motion: { ...motion, scrollTo, setScrollLocked },
  theme,
  hud,
  createStage,
  MODEL_SLUGS,
  BALL_SLUGS,
  catalog: { CATALOG, BALLS, AVAILABILITY, FLIGHT_STATUS, findBall, findProduct, formatPrice },
  // Carrito compartido: cart.add({ slug, kind: 'sneaker' | 'ball', size }) y
  // cart.onChange(callback). El encabezado muestra el conteo y el panel.
  cart: { add: cart.add, count: cart.count, onChange: cart.onChange },
  lite,
  reducedMotion,
};

for (const name of SECTIONS) {
  const root = document.querySelector(`[data-section="${name}"]`);
  if (!root) continue;
  try {
    const module = await import(`./sections/${name}/${name}.js`);
    await module.mount(root, context);
  } catch (error) {
    console.error(`[${name}]`, error);
    root.dataset.error = 'true';
  }
}

await document.fonts.ready;
motion.ScrollTrigger.refresh();

// Restauración del scroll al recargar: se guarda la posición al salir y se
// vuelve a ella cuando la página ya tiene su alto final. En una recarga manda
// la posición guardada (aunque la URL tenga ancla): el usuario vuelve a donde
// estaba. En una visita nueva con ancla (#catalogo) se salta al destino.
const SCROLL_KEY = `airspace-scroll:${location.pathname}`;
window.addEventListener('pagehide', () => {
  try {
    sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY)));
  } catch {
    // Sin almacenamiento: la recarga empieza arriba.
  }
});

function savedScroll() {
  try {
    return Number(sessionStorage.getItem(SCROLL_KEY)) || 0;
  } catch {
    return 0;
  }
}

const navigation = performance.getEntriesByType('navigation')[0];
const isReload = navigation?.type === 'reload';
// El <head> quitó el ancla de la URL antes de que el navegador saltara.
const deepLink = document.documentElement.dataset.deepLink;
const deepTarget = deepLink ? resolveAnchor(deepLink) : null;

if (isReload && savedScroll() > 0) {
  const saved = savedScroll();
  if (motion.lenis) motion.lenis.scrollTo(saved, { immediate: true, force: true });
  else window.scrollTo(0, saved);
  motion.ScrollTrigger.update();
} else if (deepTarget) {
  goTo(deepTarget, { motion: context.motion, immediate: true });
  motion.ScrollTrigger.update();
}
if (deepLink) {
  // Devuelve el ancla a la URL, para que se pueda copiar y compartir.
  history.replaceState(history.state, '', `${location.pathname}${location.search}#${deepTarget?.id ?? deepLink}`);
}

// Señal para las capturas automáticas: todo montado y medido.
document.documentElement.classList.add('is-ready');
window.__prototypeReady = true;
