// Precios de Claude Opus 5.5 en dólares por millón de tokens (si se cambia
// STYLIST_MODEL, ajustar aquí). La escritura en caché de 5 minutos cuesta
// 1,25 veces la entrada.
export const PRICING = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 } as const;

export interface UsageCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

// Costo estimado en millonésimas de dólar (entero, para sumar sin errores).
export function costMicros(usage: UsageCounts): number {
  const dollars =
    (usage.inputTokens * PRICING.input + usage.outputTokens * PRICING.output + usage.cacheReadTokens * PRICING.cacheRead + usage.cacheWriteTokens * PRICING.cacheWrite) /
    1_000_000;
  return Math.ceil(dollars * 1_000_000);
}

// Día en UTC (clave del presupuesto diario).
export const today = (now = new Date()) => now.toISOString().slice(0, 10);
