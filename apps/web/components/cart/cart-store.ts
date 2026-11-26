'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Carrito local (en el navegador, sin pago; ver docs/plan-paso-2.md). Guarda
// solo slug, talla y cantidad: nombres y precios salen del catálogo en el
// idioma activo. Cada línea es un producto con su talla; agregar el mismo
// producto y talla otra vez sube la cantidad en lugar de crear otra línea.
export interface CartItem {
  id: string;
  slug: string;
  size?: string;
  quantity: number;
}

// Límites de cantidad por línea.
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 10;

interface CartState {
  items: CartItem[];
  open: boolean;
  // Devuelve false si la línea ya estaba en el máximo (no se agregó nada).
  add(item: { slug: string; size?: string }): boolean;
  setQuantity(id: string, quantity: number): void;
  remove(id: string): void;
  clear(): void;
  setOpen(open: boolean): void;
}

// Id estable por producto y talla: dos "Agregar" iguales caen en la misma línea.
export const lineId = (slug: string, size?: string) => (size ? `${slug}:${size}` : slug);

const clamp = (quantity: number) => Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.round(quantity)));

// Total de unidades (no de líneas): es lo que muestra el botón del carrito.
export const selectItemCount = (state: Pick<CartState, 'items'>) => state.items.reduce((sum, item) => sum + item.quantity, 0);

// Junta líneas con el mismo producto y talla y deja cada cantidad entre 1 y 10.
// Sirve para migrar el formato viejo (una línea por cada "Agregar", sin
// cantidad) y para limpiar lo que venga guardado en el navegador.
export function normalizeItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<string, CartItem>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { slug, size, quantity } = entry as { slug?: unknown; size?: unknown; quantity?: unknown };
    if (typeof slug !== 'string' || !slug) continue;
    const cleanSize = typeof size === 'string' && size ? size : undefined;
    const amount = typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : 1;
    const id = lineId(slug, cleanSize);
    const current = merged.get(id);
    merged.set(id, { id, slug, size: cleanSize, quantity: clamp((current?.quantity ?? 0) + amount) });
  }
  return [...merged.values()];
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      open: false,
      add: ({ slug, size }) => {
        const id = lineId(slug, size);
        const current = get().items.find((item) => item.id === id);
        if (current && current.quantity >= MAX_QUANTITY) return false;
        set((state) => ({
          items: current
            ? state.items.map((item) => (item.id === id ? { ...item, quantity: item.quantity + 1 } : item))
            : [...state.items, { id, slug, size, quantity: 1 }],
        }));
        return true;
      },
      setQuantity: (id, quantity) =>
        set((state) => ({ items: state.items.map((item) => (item.id === id ? { ...item, quantity: clamp(quantity) } : item)) })),
      remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      clear: () => set({ items: [] }),
      setOpen: (open) => set({ open }),
    }),
    {
      name: 'airspace-cart',
      storage: createJSONStorage(() => localStorage),
      // Versión 1: líneas con cantidad. La versión 0 (sin número guardado)
      // tenía una línea por cada "Agregar"; los duplicados pasan a cantidad.
      version: 1,
      migrate: (persisted) => ({ items: normalizeItems((persisted as { items?: unknown } | null)?.items) }),
      // Al leer, se limpia lo guardado (por si alguien lo editó a mano).
      merge: (persisted, current) => ({ ...current, items: normalizeItems((persisted as { items?: unknown } | null)?.items) }),
      // El panel abierto no se recuerda entre visitas.
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
