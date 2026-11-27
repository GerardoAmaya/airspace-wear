// Prefetch de un GLB al pasar el cursor o enfocar un botón (prioridad baja):
// cuando se elige, useGLTF lo encuentra en la caché del navegador.
const requested = new Set<string>();

export function prefetch(url: string) {
  if (requested.has(url)) return;
  requested.add(url);
  void fetch(url, { priority: 'low' } as RequestInit).catch(() => requested.delete(url));
}

// GLB del sneaker que se cuelga del avatar: el hero (texturas de 2048 px, se
// ve nítido en el primer plano "Zapatos") y el -lite.glb solo en modo
// liviano. El prefetch pide la misma variante que se va a montar.
export const shoeUrl = (model: { heroUrl: string; liteUrl: string }, lite: boolean): string => (lite ? model.liteUrl : model.heroUrl);
