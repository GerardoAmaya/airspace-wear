'use client';

import { authClient } from '@/lib/auth/client';

// Acciones de cuenta compartidas por el encabezado, el menú del teléfono y
// la página de cuenta.

// Iniciales para el avatar sin foto: primera letra de las dos primeras
// palabras del nombre (o del correo).
export function initials(name: string, email: string): string {
  const words = (name.trim() || email).split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

// Lleva a Google y, al volver, a la misma página (ruta, consulta y ancla).
// Si Google falla o el visitante cancela, Better Auth vuelve a la página de
// cuenta del idioma con ?error=<código>. Devuelve false si no se pudo
// empezar (por ejemplo, sin red).
export async function signInWithGoogle(locale: string): Promise<boolean> {
  const here = new URL(window.location.href);
  // Al reintentar desde la página de cuenta no se arrastra el error anterior.
  here.searchParams.delete('error');
  const { error } = await authClient.signIn.social({
    provider: 'google',
    callbackURL: `${here.pathname}${here.search}${here.hash}`,
    errorCallbackURL: `/${locale}/account`,
  });
  return !error;
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
}
