'use client';

import { create } from 'zustand';

// Detalle 3D activo de la ficha (null = vista general). Lo comparten el visor
// y la lista de detalles; cambia con un clic o al centrar un capítulo, nunca
// por cuadro.
interface TourState {
  active: string | null;
  setActive(key: string | null): void;
}

export const useTour = create<TourState>((set) => ({
  active: null,
  setActive: (active) => set({ active }),
}));
