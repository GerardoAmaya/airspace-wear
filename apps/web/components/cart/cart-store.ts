'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Carrito local (en el navegador, sin pago; ver docs/plan-paso-2.md). Guarda
// solo slug y talla: nombres y precios salen del catálogo en el idioma activo.
export interface CartItem {
  id: string;
  slug: string;
  size?: string;
}

interface CartState {
  items: CartItem[];
  open: boolean;
  add(item: Omit<CartItem, 'id'>): void;
  remove(id: string): void;
  clear(): void;
  setOpen(open: boolean): void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      open: false,
      add: (item) => set((state) => ({ items: [...state.items, { ...item, id: crypto.randomUUID() }] })),
      remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      clear: () => set({ items: [] }),
      setOpen: (open) => set({ open }),
    }),
    {
      name: 'airspace-cart',
      storage: createJSONStorage(() => localStorage),
      // El panel abierto no se recuerda entre visitas.
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
