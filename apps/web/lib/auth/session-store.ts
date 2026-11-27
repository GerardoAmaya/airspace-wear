'use client';

import { create } from 'zustand';

// Sesión para el encabezado y el robot, sin el cliente de Better Auth.
// El encabezado está en todas las páginas: pedir la sesión con un fetch
// simple a /api/auth/get-session (la misma ruta que usa Better Auth) evita
// cargar su cliente en el JS inicial. El cliente completo (lib/auth/client)
// solo llega al iniciar o cerrar sesión y en la página de cuenta.
//
// La pregunta se hace una vez por visita, cuando el navegador está libre
// (ver scheduleSession), y se repite al volver a la pestaña si pasó un rato,
// como hacía useSession de Better Auth.

export interface SessionUser {
  name: string;
  email: string;
  image: string | null;
}

interface SessionState {
  // idle: aún no se preguntó; ready: ya se sabe (user null = sin sesión).
  status: 'idle' | 'ready';
  user: SessionUser | null;
}

export const useSessionStore = create<SessionState>(() => ({ status: 'idle', user: null }));

// Al volver a la pestaña, se pregunta de nuevo si la última respuesta tiene
// más de un minuto (por ejemplo, cerró sesión en otra pestaña).
const STALE_MS = 60_000;

let pending: Promise<void> | null = null;
let fetchedAt = 0;
let watching = false;

function readUser(body: unknown): SessionUser | null {
  if (!body || typeof body !== 'object' || !('user' in body)) return null;
  const user = (body as { user?: { name?: unknown; email?: unknown; image?: unknown } }).user;
  if (!user || typeof user.email !== 'string') return null;
  return { name: typeof user.name === 'string' ? user.name : '', email: user.email, image: typeof user.image === 'string' ? user.image : null };
}

export function loadSession(force = false): Promise<void> {
  if (pending && !force) return pending;
  const request = fetch('/api/auth/get-session', { cache: 'no-store', credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: unknown) => {
      fetchedAt = Date.now();
      useSessionStore.setState({ status: 'ready', user: readUser(body) });
    })
    .catch(() => {
      // Sin red: como sin sesión (lo mismo que mostraba useSession con error).
      fetchedAt = Date.now();
      useSessionStore.setState({ status: 'ready', user: null });
    });
  pending = request;
  if (!watching) {
    watching = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - fetchedAt > STALE_MS) void loadSession(true);
    });
  }
  return request;
}

// Pide la sesión cuando el navegador está libre (como mucho a los 800 ms),
// para no competir con la hidratación ni con el primer pintado.
export function scheduleSession(): () => void {
  if (pending) return () => undefined;
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => void loadSession(), { timeout: 800 });
    return () => cancelIdleCallback(id);
  }
  // Safari sin requestIdleCallback.
  const id = setTimeout(() => void loadSession(), 200);
  return () => clearTimeout(id);
}

// Tras cerrar sesión (account-actions.signOut).
export function markSignedOut(): void {
  fetchedAt = Date.now();
  useSessionStore.setState({ status: 'ready', user: null });
}
