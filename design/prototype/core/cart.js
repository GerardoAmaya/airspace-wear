// Carrito del prototipo. Vive en memoria y en sessionStorage (sobrevive a una
// recarga, no a cerrar la pestaña). En el sitio real lo maneja la API.
//
// Uso desde una sección:
//   context.cart.add({ slug: 'air-jordan-1', kind: 'sneaker', size: 'EU 42' })
//   context.cart.onChange(({ count, items }) => { ... })
// Cada artículo: { id, slug, kind: 'sneaker' | 'ball', size? }.

import { findBall, findProduct } from './catalog.js';

const STORAGE_KEY = 'airspace-cart';
const listeners = new Set();

function readSaved() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((item) => describe(item)) : [];
  } catch {
    return [];
  }
}

let items = [];
let nextId = 1;

function save() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Sin almacenamiento: el carrito vale solo mientras la página esté abierta.
  }
}

function emit() {
  const snapshot = { count: items.length, items: items.slice() };
  for (const listener of listeners) listener(snapshot);
}

// Nombre, detalle y precio de un artículo, sacados del catálogo.
export function describe(item) {
  const product = item.kind === 'ball' ? findBall(item.slug) : findProduct(item.slug);
  if (!product) return null;
  const detail = item.kind === 'ball' ? product.edition : [product.colorway, item.size].filter(Boolean).join(' · ');
  return { name: product.name, brand: product.brand, detail, price: product.price };
}

export function add({ slug, kind = 'sneaker', size } = {}) {
  const item = { id: nextId++, slug, kind, ...(size ? { size } : {}) };
  if (!describe(item)) {
    console.warn(`[cart] producto desconocido: ${kind}/${slug}`);
    return items.length;
  }
  items.push(item);
  save();
  emit();
  return items.length;
}

export function remove(id) {
  items = items.filter((item) => item.id !== id);
  save();
  emit();
}

export function clear() {
  items = [];
  save();
  emit();
}

export const count = () => items.length;
export const getItems = () => items.slice();
export const total = () => items.reduce((sum, item) => sum + (describe(item)?.price ?? 0), 0);

// Devuelve una función para dejar de escuchar.
export function onChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

items = readSaved().map((item) => ({ ...item, id: nextId++ }));
