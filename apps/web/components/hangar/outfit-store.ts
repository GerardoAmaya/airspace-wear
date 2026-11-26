'use client';

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  type Bottoms,
  type ColorSlot,
  DEFAULT_OUTFIT,
  type GarmentColor,
  MATCH_SLOTS,
  type OutfitChoice,
  sanitizeChoice,
  type ShirtStyle,
} from '@/lib/avatar/outfit';

// Vestuario elegido en el Hangar 360°, guardado en el navegador. Cada acceso
// al localStorage va en try/catch: en una ventana privada o con los datos del
// sitio bloqueados el panel sigue funcionando, solo que no recuerda nada.
const safeStorage: StateStorage = {
  getItem(name) {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem(name, value) {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Sin almacenamiento: la elección vale solo para esta visita.
    }
  },
  removeItem(name) {
    try {
      localStorage.removeItem(name);
    } catch {
      // Nada que borrar.
    }
  },
};

interface OutfitState extends OutfitChoice {
  setShirt(shirt: ShirtStyle): void;
  setBottoms(bottoms: Bottoms): void;
  setCap(cap: boolean): void;
  setGlasses(glasses: boolean): void;
  setSocks(socks: boolean): void;
  setStripes(stripes: boolean): void;
  setColor(slot: ColorSlot, color: GarmentColor): void;
  // "Combinar con el zapato": la gorra y las franjas de las medias toman el
  // acento del par (y se ponen).
  matchSneaker(): void;
  reset(): void;
}

export const useOutfitStore = create<OutfitState>()(
  persist(
    (set) => ({
      ...DEFAULT_OUTFIT,
      setShirt: (shirt) => set({ shirt }),
      setBottoms: (bottoms) => set({ bottoms }),
      setCap: (cap) => set({ cap }),
      setGlasses: (glasses) => set({ glasses }),
      setSocks: (socks) => set({ socks }),
      setStripes: (stripes) => set({ stripes }),
      setColor: (slot, color) =>
        set((state) => ({
          colors: { ...state.colors, [slot]: color },
          // Elegir el color de un accesorio apagado lo pone a la vista.
          ...(slot === 'cap' ? { cap: true } : {}),
          ...(slot === 'glasses' ? { glasses: true } : {}),
          ...(slot === 'socks' ? { socks: true } : {}),
          ...(slot === 'stripes' ? { socks: true, stripes: true } : {}),
        })),
      matchSneaker: () =>
        set((state) => ({
          cap: true,
          socks: true,
          stripes: true,
          colors: { ...state.colors, ...Object.fromEntries(MATCH_SLOTS.map((slot) => [slot, 'match'])) },
        })),
      reset: () => set({ ...DEFAULT_OUTFIT, colors: {} }),
    }),
    {
      name: 'airspace-hangar-outfit',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ shirt, bottoms, cap, glasses, socks, stripes, colors }) => ({ shirt, bottoms, cap, glasses, socks, stripes, colors }),
      merge: (persisted, current) => ({ ...current, ...sanitizeChoice(persisted) }),
    },
  ),
);

// En el servidor y en la hidratación se usa el vestuario por defecto; lo
// guardado se aplica ya en el cliente (sin aviso de hidratación).
const subscribeNoop = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

export function useOutfitChoice(): OutfitChoice {
  const hydrated = useHydrated();
  const shirt = useOutfitStore((state) => state.shirt);
  const bottoms = useOutfitStore((state) => state.bottoms);
  const cap = useOutfitStore((state) => state.cap);
  const glasses = useOutfitStore((state) => state.glasses);
  const socks = useOutfitStore((state) => state.socks);
  const stripes = useOutfitStore((state) => state.stripes);
  const colors = useOutfitStore((state) => state.colors);
  return hydrated ? { shirt, bottoms, cap, glasses, socks, stripes, colors } : DEFAULT_OUTFIT;
}
