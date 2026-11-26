'use client';

import { useEffect, useId, useState } from 'react';
import { create } from 'zustand';

// Director de render (CLAUDE.md: "only one canvas draws at a time"). Cada
// escenario informa qué fracción de él se ve; solo el más visible dibuja y
// los demás quedan con frameloop="never". Cambia al cruzar umbrales de
// visibilidad, nunca por cuadro.
interface DirectorState {
  ratios: Record<string, number>;
  setRatio(id: string, ratio: number): void;
  remove(id: string): void;
}

export const useDirector = create<DirectorState>((set) => ({
  ratios: {},
  setRatio: (id, ratio) => set((state) => (state.ratios[id] === ratio ? state : { ratios: { ...state.ratios, [id]: ratio } })),
  remove: (id) =>
    set((state) => {
      const ratios = { ...state.ratios };
      delete ratios[id];
      return { ratios };
    }),
}));

const activeId = (ratios: Record<string, number>) => {
  let best: string | null = null;
  let bestRatio = 0;
  for (const [id, ratio] of Object.entries(ratios)) {
    if (ratio > bestRatio) {
      best = id;
      bestRatio = ratio;
    }
  }
  return best;
};

// Registra un escenario y devuelve si es el que debe dibujar.
export function useStageActivity(element: HTMLElement | null): boolean {
  const id = useId();
  const setRatio = useDirector((state) => state.setRatio);
  const remove = useDirector((state) => state.remove);
  const isActive = useDirector((state) => activeId(state.ratios) === id);
  const [visibleOnce, setVisibleOnce] = useState(false);

  useEffect(() => {
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setRatio(id, entry.isIntersecting ? Math.round(entry.intersectionRatio * 20) / 20 : 0);
        if (entry.isIntersecting) setVisibleOnce(true);
      },
      { threshold: Array.from({ length: 21 }, (_, index) => index / 20) },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      remove(id);
    };
  }, [element, id, setRatio, remove]);

  return isActive && visibleOnce;
}
