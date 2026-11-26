'use client';

import type Lenis from 'lenis';
import { create } from 'zustand';

// Estado de movimiento compartido. No guarda valores por cuadro (esos viven
// en refs): solo la instancia de Lenis y preferencias que cambian poco.
interface MotionState {
  lenis: Lenis | null;
  reducedMotion: boolean;
  lite: boolean;
  set(partial: Partial<Omit<MotionState, 'set'>>): void;
}

export const useMotionStore = create<MotionState>((set) => ({
  lenis: null,
  reducedMotion: false,
  lite: false,
  set: (partial) => set(partial),
}));
