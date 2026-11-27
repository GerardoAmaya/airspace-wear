'use client';

import { useSyncExternalStore } from 'react';

// Primera interacción de la persona con la página (mover o apretar el puntero,
// la rueda, un toque o una tecla). Los globos automáticos del robot esperan a
// que llegue: así nunca aparecen solos en una carga sin nadie (Lighthouse
// medía el globo como el elemento más grande de la página, el LCP, a los 9 s).
//
// No se escucha "scroll": la página también lo dispara sola (restaurar la
// posición al recargar, los saltos de ancla). La rueda, el toque y las teclas
// cubren el scroll de la persona.
//
// Se registra al cargar este módulo (lo importa StylistBot, en el JS inicial),
// no al montar el robot: el robot llega después, en reposo, y una interacción
// anterior también cuenta.

const EVENTS = ['pointermove', 'pointerdown', 'wheel', 'touchstart', 'keydown'] as const;

let interacted = false;
const listeners = new Set<() => void>();

function onInteract() {
  if (interacted) return;
  interacted = true;
  for (const event of EVENTS) window.removeEventListener(event, onInteract, true);
  listeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  for (const event of EVENTS) window.addEventListener(event, onInteract, { capture: true, passive: true });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// true desde la primera interacción (no vuelve a false en toda la visita).
export function useFirstInteraction(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => interacted,
    () => false,
  );
}
