'use client';

import type { AvatarSlot } from '@airspace/contracts';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { HANGAR_FEATURES } from '@/lib/avatar/hangar-features';
import {
  BARE_OUTFIT,
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

// Pestañas del panel derecho del Hangar (la última elegida se recuerda).
export const HANGAR_TABS = ['shoes', 'wear', 'colors'] as const;
export type HangarTab = (typeof HANGAR_TABS)[number];
const DEFAULT_TAB: HangarTab = 'shoes';
// Pestañas que el Hangar ofrece hoy: "Colores" solo con su bandera
// (lib/avatar/hangar-features.ts). Una pestaña oculta guardada vuelve a "Zapatos".
const SHOWN_TABS: readonly HangarTab[] = HANGAR_TABS.filter((tab) => tab !== 'colors' || (HANGAR_FEATURES.colorsTab && HANGAR_FEATURES.baseOutfit));
const sanitizeTab = (value: unknown): HangarTab => (SHOWN_TABS.includes(value as HangarTab) ? (value as HangarTab) : DEFAULT_TAB);

// Filtros de la pestaña "Zapatos" (se recuerdan como la pestaña): texto
// buscado, marca (su nombre, o "Jordan") y tipo de calzado.
export const SHOE_TYPES = ['all', 'sneaker', 'cleat'] as const;
export type ShoeType = (typeof SHOE_TYPES)[number];
export interface ShoeFilter {
  query: string;
  brand: string | null;
  type: ShoeType;
}
export const DEFAULT_SHOE_FILTER: ShoeFilter = { query: '', brand: null, type: 'all' };
const sanitizeShoeFilter = (value: unknown): ShoeFilter => {
  const raw = (value ?? {}) as Partial<Record<keyof ShoeFilter, unknown>>;
  return {
    query: typeof raw.query === 'string' ? raw.query.slice(0, 60) : '',
    brand: typeof raw.brand === 'string' && raw.brand ? raw.brand.slice(0, 40) : null,
    type: SHOE_TYPES.includes(raw.type as ShoeType) ? (raw.type as ShoeType) : 'all',
  };
};

interface OutfitState extends OutfitChoice {
  tab: HangarTab;
  setTab(tab: HangarTab): void;
  shoeFilter: ShoeFilter;
  setShoeFilter(patch: Partial<ShoeFilter>): void;
  clearShoeFilter(): void;
  setShirt(shirt: ShirtStyle): void;
  setBottoms(bottoms: Bottoms): void;
  setCap(cap: boolean): void;
  setGlasses(glasses: boolean): void;
  setSocks(socks: boolean): void;
  setStripes(stripes: boolean): void;
  setColor(slot: ColorSlot, color: GarmentColor): void;
  // Prenda del catálogo en un lugar (null vuelve a la pieza base).
  setWear(slot: AvatarSlot, slug: string | null): void;
  // "Combinar con el zapato": la gorra y las franjas de las medias toman el
  // acento del par (y se ponen).
  matchSneaker(): void;
  // "Restablecer": el maniquí sin ropa (HANGAR_FEATURES.resetToBare) o el
  // look de fábrica. El par no cambia (no vive en este store).
  reset(): void;
}

export const useOutfitStore = create<OutfitState>()(
  persist(
    (set) => ({
      ...DEFAULT_OUTFIT,
      tab: DEFAULT_TAB,
      setTab: (tab) => set({ tab }),
      shoeFilter: DEFAULT_SHOE_FILTER,
      setShoeFilter: (patch) => set((state) => ({ shoeFilter: { ...state.shoeFilter, ...patch } })),
      clearShoeFilter: () => set({ shoeFilter: DEFAULT_SHOE_FILTER }),
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
      setWear: (slot, slug) =>
        set((state) => {
          const wear = { ...state.wear };
          if (slug) wear[slot] = slug;
          else delete wear[slot];
          return { wear };
        }),
      matchSneaker: () =>
        set((state) => ({
          cap: true,
          socks: true,
          stripes: true,
          colors: { ...state.colors, ...Object.fromEntries(MATCH_SLOTS.map((slot) => [slot, 'match'])) },
        })),
      reset: () => {
        const target = HANGAR_FEATURES.resetToBare ? BARE_OUTFIT : DEFAULT_OUTFIT;
        set({ ...target, colors: {}, wear: { ...target.wear } });
      },
    }),
    {
      name: 'airspace-hangar-outfit',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ shirt, bottoms, cap, glasses, socks, stripes, colors, wear, tab, shoeFilter }) => ({
        shirt,
        bottoms,
        cap,
        glasses,
        socks,
        stripes,
        colors,
        wear,
        tab,
        shoeFilter,
      }),
      // Sin nada guardado (visita nueva), zustand igual llama a merge: se
      // quedan los valores de fábrica (con el anorak puesto).
      merge: (persisted, current) => (persisted == null ? current : {
        ...current,
        ...sanitizeChoice(persisted),
        tab: sanitizeTab((persisted as { tab?: unknown } | undefined)?.tab),
        shoeFilter: sanitizeShoeFilter((persisted as { shoeFilter?: unknown } | undefined)?.shoeFilter),
      }),
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
  const wear = useOutfitStore((state) => state.wear);
  return hydrated ? { shirt, bottoms, cap, glasses, socks, stripes, colors, wear } : DEFAULT_OUTFIT;
}

// Pestaña del panel: la de fábrica en el servidor y la hidratación.
export function useHangarTab(): HangarTab {
  const hydrated = useHydrated();
  const tab = useOutfitStore((state) => state.tab);
  return hydrated ? tab : DEFAULT_TAB;
}

// Filtros de "Zapatos": sin filtros en el servidor y la hidratación.
export function useShoeFilter(): ShoeFilter {
  const hydrated = useHydrated();
  const filter = useOutfitStore((state) => state.shoeFilter);
  return hydrated ? filter : DEFAULT_SHOE_FILTER;
}
