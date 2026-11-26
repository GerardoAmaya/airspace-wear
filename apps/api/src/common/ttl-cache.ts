// Caché en memoria con vencimiento, para lecturas que cambian poco (solo con
// el seed). Acotada en tamaño y con desalojo del menos usado: cada acierto
// mueve la entrada al final, así una lectura frecuente no se desaloja primero.
export class TtlCache<T> {
  private readonly entries = new Map<string, { expires: number; value: Promise<T> }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 200,
  ) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && hit.expires > now) {
      // Reinsertar la deja como la más reciente (orden de un Map = inserción).
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit.value;
    }
    // Solo se desaloja otra entrada si esta clave es nueva.
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
    const value = load();
    this.entries.set(key, { expires: now + this.ttlMs, value });
    // Un error no se guarda: el siguiente pedido vuelve a intentar. Solo se
    // borra si sigue siendo esta misma carga (no una más nueva).
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}
