'use client';

import type { Locale, StylistOrder } from '@airspace/contracts';
import { create } from 'zustand';
import type { RecommendedProduct, StylistEngine } from '@/components/home/stylist/engine';

// Estado compartido del estilista: el panel flotante (robot) y la consola de
// la home muestran la misma conversación. Vive solo en memoria: dura lo que
// dura la visita (navegar entre páginas la conserva; recargar la borra) y
// nunca se guarda en el navegador ni en el servidor.
//
// Aquí solo hay estado y funciones pequeñas: este módulo entra en el JS de
// todas las páginas (el enlace "Estilista IA" del encabezado lo usa), así que
// no importa Motion, el motor de la API ni zod.

export type TurnSource = 'home' | 'panel';

export interface SharedTurn {
  id: number;
  source: TurnSource;
  question: string;
  // Texto acumulado (lo que va entre [corchetes] es un nombre de producto).
  answer: string;
  products: RecommendedProduct[];
  // Pedidos del visitante citados en la respuesta (solo con sesión).
  orders: StylistOrder[];
  // Preguntó por sus pedidos sin sesión: el panel ofrece iniciarla.
  signIn: boolean;
  status: 'thinking' | 'streaming' | 'done';
}

interface StylistState {
  open: boolean;
  // Idioma de la conversación: al cambiar de idioma empieza una nueva.
  locale: Locale | null;
  turns: SharedTurn[];
  // El estilista está respondiendo (el robot pone los ojos de "pensando").
  busy: boolean;
  setOpen(open: boolean): void;
}

export const useStylistStore = create<StylistState>()((set) => ({
  open: false,
  locale: null,
  turns: [],
  busy: false,
  setOpen: (open) => set({ open }),
}));

// Quién abrió el panel (el robot, un enlace "Estilista IA"): al cerrarlo con
// Escape el foco vuelve al robot o, si aún no cargó, a quien lo abrió.
let opener: HTMLElement | null = null;

export function openStylist() {
  const active = document.activeElement;
  opener = active instanceof HTMLElement && active !== document.body ? active : null;
  useStylistStore.getState().setOpen(true);
}

export function closeStylist({ restoreFocus = false } = {}) {
  useStylistStore.getState().setOpen(false);
  if (!restoreFocus) return;
  const robot = document.querySelector<HTMLElement>('[data-stylist-robot]');
  (robot ?? opener)?.focus({ preventScroll: true });
}

// ---------- Motor compartido ----------

// Un solo motor de la IA por visita e idioma: guarda el historial que se
// manda a la API, así el estilista recuerda lo que se habló en la home al
// seguir en el panel, y al revés.
let shared: { locale: Locale; engine: StylistEngine } | null = null;
let controller: AbortController | null = null;
let nextId = 1;

// Motor que se crea la primera vez que se le pregunta (import diferido).
export function lazyEngine(createEngine: () => Promise<StylistEngine>): StylistEngine {
  let pending: Promise<StylistEngine> | null = null;
  return {
    async *ask(message, options) {
      // Si el import falla (red), el siguiente mensaje lo vuelve a intentar.
      pending ??= createEngine().catch((error: unknown) => {
        pending = null;
        throw error;
      });
      yield* (await pending).ask(message, options);
    },
  };
}

// Deja la conversación lista para el idioma activo (otro idioma: empieza de cero).
export function syncLocale(locale: Locale) {
  const state = useStylistStore.getState();
  if (state.locale === locale) return;
  controller?.abort();
  controller = null;
  shared = null;
  useStylistStore.setState({ locale, turns: [], busy: false });
}

export function sharedEngine(locale: Locale, createEngine: () => StylistEngine): StylistEngine {
  syncLocale(locale);
  if (!shared || shared.locale !== locale) shared = { locale, engine: createEngine() };
  return shared.engine;
}

// Las consultas ya resueltas del idioma activo (las que ve la home al volver).
export function doneTurns(locale: Locale): SharedTurn[] {
  const state = useStylistStore.getState();
  return state.locale === locale ? state.turns.filter((turn) => turn.status === 'done') : [];
}

// La consola de la home anota cada consulta del visitante al terminar.
export function recordTurn(locale: Locale, turn: { question: string; answer: string; products: RecommendedProduct[] }) {
  syncLocale(locale);
  useStylistStore.setState((state) => ({ turns: [...state.turns, { id: nextId++, source: 'home', status: 'done', orders: [], signIn: false, ...turn }] }));
}

const patchTurn = (id: number, patch: (turn: SharedTurn) => Partial<SharedTurn>) =>
  useStylistStore.setState((state) => ({ turns: state.turns.map((turn) => (turn.id === id ? { ...turn, ...patch(turn) } : turn)) }));

// Una consulta desde el panel: se agrega a la conversación y la respuesta
// llega en trozos. Una consulta nueva interrumpe la anterior.
export async function askFromPanel(locale: Locale, question: string, engine: StylistEngine) {
  syncLocale(locale);
  controller?.abort();
  const current = new AbortController();
  controller = current;
  const id = nextId++;
  useStylistStore.setState((state) => ({
    busy: true,
    // La consulta interrumpida queda con lo que alcanzó a llegar.
    turns: [...state.turns.map((turn) => (turn.status === 'done' ? turn : { ...turn, status: 'done' as const })), { id, source: 'panel', question, answer: '', products: [], orders: [], signIn: false, status: 'thinking' }],
  }));
  try {
    for await (const event of engine.ask(question, { locale, signal: current.signal })) {
      if (current.signal.aborted) return;
      if (event.type === 'text') patchTurn(id, (turn) => ({ answer: turn.answer + event.text, status: 'streaming' }));
      else if (event.type === 'products') patchTurn(id, (turn) => ({ products: [...turn.products, ...event.products] }));
      else if (event.type === 'orders') patchTurn(id, (turn) => ({ orders: [...turn.orders, ...event.orders], status: turn.status === 'thinking' ? 'streaming' : turn.status }));
      else if (event.type === 'sign_in') patchTurn(id, () => ({ signIn: true }));
    }
  } catch {
    // Interrumpida por otra consulta o por "Nueva conversación".
  } finally {
    if (controller === current) {
      controller = null;
      patchTurn(id, () => ({ status: 'done' }));
      useStylistStore.setState({ busy: false });
    }
  }
}

// "Nueva conversación": borra lo hablado y el historial que se manda a la IA.
export function resetConversation() {
  controller?.abort();
  controller = null;
  shared = null;
  useStylistStore.setState({ turns: [], busy: false });
}
