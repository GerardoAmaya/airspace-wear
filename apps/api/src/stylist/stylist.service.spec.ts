import type { ProductCard, StylistEvent } from '@airspace/contracts';
import type { AppConfig } from '../config/config.module.js';
import type { CatalogService } from '../catalog/catalog.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { StylistService, type StylistModelClient } from './stylist.service.js';
import { costMicros } from './usage.js';

// Cliente simulado: un stream con deltas de texto y un mensaje final.
function fakeClient(final: Record<string, unknown>, deltas: string[] = []) {
  const stream = vi.fn((_params: unknown, _options: unknown) => ({
    async *[Symbol.asyncIterator]() {
      for (const text of deltas) yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
    },
    finalMessage: async () => final,
  }));
  return { client: { beta: { messages: { stream } } } as unknown as StylistModelClient, stream };
}

const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 };
const card = (slug: string) => ({ slug, name: slug, brand: { slug: 'nike', name: 'Nike' }, category: 'sneaker', availability: 'available', tagline: 't', colorway: null, edition: null, sizeRange: null }) as unknown as ProductCard;

function setup({ enabled = true, spent = 0, final, deltas }: { enabled?: boolean; spent?: number; final: Record<string, unknown>; deltas?: string[] }) {
  const config = { stylist: { enabled, model: 'claude-opus-5-5', dailyBudgetUsd: 2 } } as AppConfig;
  const catalog = { listProducts: vi.fn(async () => ({ locale: 'es', items: [card('adidas-gazelle'), card('nike-air-uptempo')] })) } as unknown as CatalogService;
  const upsert = vi.fn(async () => ({}));
  const prisma = { stylistUsage: { findUnique: vi.fn(async () => (spent ? { costMicros: spent } : null)), upsert } } as unknown as PrismaService;
  const { client, stream } = fakeClient(final, deltas);
  const service = new StylistService(config, enabled ? client : null, catalog, prisma);
  return { service, stream, upsert };
}

async function run(service: StylistService) {
  const events: StylistEvent[] = [];
  await service.chat({ locale: 'es', messages: [{ role: 'user', content: 'Busco algo clásico' }] }, (event) => events.push(event), new AbortController().signal);
  return events;
}

describe('StylistService', () => {
  it('envía el texto en streaming, luego tarjetas válidas y done', async () => {
    const { service, stream, upsert } = setup({
      deltas: ['Te recomiendo ', 'el [Adidas Gazelle].'],
      final: {
        stop_reason: 'tool_use',
        usage,
        content: [
          { type: 'text', text: 'Te recomiendo el [Adidas Gazelle].' },
          { type: 'tool_use', name: 'show_products', input: { products: [{ slug: 'adidas-gazelle', reason: 'Clásico y fácil de combinar', match: 93.6 }, { slug: 'inventado', reason: 'x', match: 50 }] } },
        ],
      },
    });
    const events = await run(service);
    expect(events).toEqual([
      { type: 'text', text: 'Te recomiendo ' },
      { type: 'text', text: 'el [Adidas Gazelle].' },
      // El slug inventado se descarta; la coincidencia se redondea.
      { type: 'products', items: [{ slug: 'adidas-gazelle', reason: 'Clásico y fácil de combinar', match: 94 }] },
      { type: 'done' },
    ]);
    // Modelo, esfuerzo bajo, respaldo del servidor, caché del prompt y slugs limitados al catálogo.
    const params = stream.mock.calls[0]![0] as Record<string, any>;
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(params.tools[0].input_schema.properties.products.items.properties.slug.enum).toEqual(['adidas-gazelle', 'nike-air-uptempo']);
    expect(upsert).toHaveBeenCalledOnce();
  });

  it('una negativa del modelo se informa como refused, sin tarjetas', async () => {
    const { service } = setup({ final: { stop_reason: 'refusal', usage, content: [] } });
    expect(await run(service)).toEqual([{ type: 'error', code: 'refused' }]);
  });

  it('sin presupuesto del día no llama al modelo', async () => {
    const { service, stream } = setup({ spent: 2_000_000, final: { stop_reason: 'end_turn', usage, content: [] } });
    expect(await run(service)).toEqual([{ type: 'error', code: 'budget_exhausted' }]);
    expect(stream).not.toHaveBeenCalled();
    expect(await service.status()).toEqual({ available: false });
  });

  it('apagado (sin clave) responde unavailable', async () => {
    const { service } = setup({ enabled: false, final: { stop_reason: 'end_turn', usage, content: [] } });
    expect(await run(service)).toEqual([{ type: 'error', code: 'unavailable' }]);
  });

  it('una respuesta cortada por max_tokens no muestra tarjetas', async () => {
    const { service } = setup({
      final: { stop_reason: 'max_tokens', usage, content: [{ type: 'tool_use', name: 'show_products', input: { products: [{ slug: 'adidas-gazelle', reason: 'x', match: 90 }] } }] },
    });
    expect(await run(service)).toEqual([{ type: 'done' }]);
  });

  it('calcula el costo con los precios de Opus 5.5', () => {
    // 1000 entrada × $4 + 200 salida × $20 + 3000 caché × $0,20 = $0,0086
    expect(costMicros({ inputTokens: 1000, outputTokens: 200, cacheReadTokens: 3000, cacheWriteTokens: 0 })).toBe(8600);
  });
});
