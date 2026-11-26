// Encabezado y navegación compartidos: enlaces de ancla, menú móvil, carrito,
// selector de idioma y el fondo sólido al bajar.
//
// Navegación: todo clic en un enlace "#id" lo resuelve este módulo (salvo que
// una sección ya lo haya manejado con preventDefault). Desplaza con Lenis, no
// escribe el ancla en la URL (así una recarga vuelve a la posición guardada y
// no al ancla) y pasa el foco al destino para quien navega con teclado.

import * as cart from './cart.js';
import { formatPrice } from './catalog.js';
import { scrollTo } from './motion.js';

// Anclas viejas (de la versión con nombres de aeropuerto) que aún pueden
// llegar en enlaces guardados.
const LEGACY_IDS = { flight: 'inicio', departures: 'catalogo', tower: 'estilista', boarding: 'club' };

export const resolveAnchor = (id) => document.getElementById(LEGACY_IDS[id] ?? id);

function focusTarget(target) {
  if (!target.matches('a, button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

// Salta a un destino (ver scrollTo en core/motion.js para dónde aterriza) y
// le pasa el foco.
export function goTo(target, { motion, immediate = false } = {}) {
  scrollTo(target, { duration: 1.2, force: true, immediate: immediate || motion.reducedMotion });
  focusTarget(target);
}

export function initHeader({ motion }) {
  const header = document.querySelector('[data-site-header]');
  if (!header) return;
  const nav = header.querySelector('#site-nav');
  const menuButton = header.querySelector('[data-menu-toggle]');
  const note = header.querySelector('[data-header-note]');

  // ---------- Fondo sólido al bajar ----------
  // Un cambio de estado al cruzar el umbral, no una animación ligada al scroll.
  let scrolled = null;
  const syncScrolled = () => {
    const next = window.scrollY > 8;
    if (next === scrolled) return;
    scrolled = next;
    header.classList.toggle('is-scrolled', next);
  };
  window.addEventListener('scroll', syncScrolled, { passive: true });
  syncScrolled();

  // ---------- Aviso breve en el encabezado ----------
  let noteTimer = 0;
  const showNote = (text) => {
    note.textContent = text;
    header.classList.add('has-note');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => header.classList.remove('has-note'), 3200);
  };

  // ---------- Menú móvil ----------
  const mobileQuery = window.matchMedia('(max-width: 960px)');
  const setMenu = (open) => {
    header.classList.toggle('is-menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    if (open) nav.querySelector('a')?.focus();
  };
  menuButton.addEventListener('click', () => setMenu(!header.classList.contains('is-menu-open')));
  mobileQuery.addEventListener('change', () => setMenu(false));

  // ---------- Idioma ----------
  // El prototipo existe solo en español; el sitio final tendrá /es y /en.
  for (const button of document.querySelectorAll('[data-lang="en"]')) {
    button.addEventListener('click', () => showNote('La versión en inglés llega con el sitio final.'));
  }

  // ---------- Carrito ----------
  const cartButton = header.querySelector('[data-cart-toggle]');
  const panel = document.querySelector('[data-cart-panel]');
  const list = panel.querySelector('[data-cart-list]');
  const empty = panel.querySelector('[data-cart-empty]');
  const foot = panel.querySelector('[data-cart-foot]');
  const totalNode = panel.querySelector('[data-cart-total]');
  const countNode = header.querySelector('[data-cart-count]');
  const countLabel = header.querySelector('[data-cart-count-label]');

  const renderCart = ({ count, items }) => {
    countNode.textContent = String(count);
    countLabel.textContent = `, ${count} ${count === 1 ? 'producto' : 'productos'}`;
    cartButton.classList.toggle('has-items', count > 0);
    list.innerHTML = items
      .map((item) => {
        const info = cart.describe(item);
        return `
          <li class="cart-item">
            <span class="cart-item__brand hud-label">${info.brand}</span>
            <span class="cart-item__name">${info.name}</span>
            <span class="cart-item__detail">${info.detail}</span>
            <span class="cart-item__price mono">${formatPrice(info.price)}</span>
            <button class="cart-item__remove" type="button" data-cart-remove="${item.id}">Quitar<span class="visually-hidden"> ${info.name}</span></button>
          </li>`;
      })
      .join('');
    empty.hidden = count > 0;
    foot.hidden = count === 0;
    totalNode.textContent = formatPrice(cart.total());
  };

  // Pulso breve del contador cuando se agrega algo (solo transform).
  let lastCount = cart.count();
  cart.onChange((snapshot) => {
    renderCart(snapshot);
    if (snapshot.count > lastCount && !motion.reducedMotion) {
      countNode.classList.remove('is-bumped');
      void countNode.offsetWidth;
      countNode.classList.add('is-bumped');
    }
    lastCount = snapshot.count;
  });
  renderCart({ count: cart.count(), items: cart.getItems() });

  const setCart = (open, { returnFocus = true } = {}) => {
    if (open === !panel.hidden) return;
    cartButton.setAttribute('aria-expanded', String(open));
    if (open) {
      setMenu(false);
      header.classList.remove('has-note');
      panel.hidden = false;
      // Un cuadro después, para que la transición de entrada arranque.
      requestAnimationFrame(() => panel.classList.add('is-open'));
      panel.querySelector('[data-cart-close]').focus();
    } else {
      panel.classList.remove('is-open');
      panel.hidden = true;
      if (returnFocus) cartButton.focus();
    }
  };
  cartButton.addEventListener('click', () => setCart(panel.hidden));
  panel.querySelector('[data-cart-close]').addEventListener('click', () => setCart(false));
  panel.querySelector('[data-cart-clear]').addEventListener('click', () => {
    cart.clear();
    panel.querySelector('[data-cart-close]').focus();
  });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cart-remove]');
    if (!button) return;
    cart.remove(Number(button.dataset.cartRemove));
    (list.querySelector('[data-cart-remove]') ?? panel.querySelector('[data-cart-close]')).focus();
  });

  // Cierra el menú y el carrito con Escape o con un clic fuera.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!panel.hidden) setCart(false);
    if (header.classList.contains('is-menu-open')) {
      setMenu(false);
      menuButton.focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !cartButton.contains(event.target)) setCart(false, { returnFocus: false });
    if (header.classList.contains('is-menu-open') && !header.contains(event.target)) setMenu(false);
  });

  // ---------- Enlaces de ancla ----------
  // En fase de burbuja: si la sección ya manejó el clic (preventDefault), no
  // se toca.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    if (!id) {
      event.preventDefault();
      return;
    }
    const target = resolveAnchor(id);
    if (!target) return;
    event.preventDefault();
    setMenu(false);
    setCart(false, { returnFocus: false });
    goTo(target, { motion });
  });
}
