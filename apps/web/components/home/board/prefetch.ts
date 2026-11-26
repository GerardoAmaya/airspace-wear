'use client';

const requested = new Set<string>();

// Precarga silenciosa de un GLB al pasar el cursor o enfocar una fila
// (CLAUDE.md: "prefetch on hover or focus"). Baja el archivo con prioridad
// baja a la caché HTTP; useGLTF lo encuentra listo al elegir la fila.
export function prefetchModel(url: string) {
  if (requested.has(url)) return;
  requested.add(url);
  void fetch(url, { priority: 'low' } as RequestInit).catch(() => requested.delete(url));
}
