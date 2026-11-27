import { detectOrderQuestion, type OrderDetail, type ProductCard, type StylistEvent, type StylistRequest } from '@airspace/contracts';
import type { SessionUser } from '../auth/session-auth.guard.js';
import type { AppConfig } from '../config/config.module.js';
import type { CatalogService } from '../catalog/catalog.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StylistOrders } from './stylist-orders.js';
import { StylistService, type StylistModelClient } from './stylist.service.js';
import { costMicros } from './usage.js';

// Cliente simulado: un stream con deltas de texto y un mensaje final por
// vuelta (rounds: una entrada por cada llamada al modelo, en orden).
interface Round {
  final: Record<string, unknown>;
  deltas?: string[];
}
function fakeClient(rounds: Round[]) {
  let call = 0;
  const stream = vi.fn((_params: unknown, _options: unknown) => {
    const round = rounds[Math.min(call++, rounds.length - 1)]!;
    return {
      async *[Symbol.asyncIterator]() {
        for (const text of round.deltas ?? []) yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
      },
      finalMessage: async () => round.final,
    };
  });
  return { client: { beta: { messages: { stream } } } as unknown as StylistModelClient, stream };
}

const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 };
const card = (slug: string) => ({ slug, name: slug, brand: { slug: 'nike', name: 'Nike' }, category: 'sneaker', availability: 'available', tagline: 't', colorway: null, edition: null, sizeRange: null }) as unknown as ProductCard;

const NOW = Date.now();
const ALICE: SessionUser = { id: 'user-alice', name: 'Alicia', email: 'alicia@example.com', image: null };

// Pedido de prueba con la forma pública (OrderDetail), pagado hace 7 minutos.
function order(number: string, id = '00000000-0000-4000-8000-000000000001'): OrderDetail {
  const paidAt = new Date(NOW - 7 * 60_000);
  const at = (index: number) => new Date(paidAt.getTime() + index * 5 * 60_000).toISOString();
  return {
    id,
    number,
    status: 'paid',
    createdAt: paidAt.toISOString(),
    paidAt: paidAt.toISOString(),
    itemCount: 1,
    total: { amountCents: 18000, currency: 'USD' },
    trackingStage: 'preparing',
    locale: 'es',
    subtotal: { amountCents: 18000, currency: 'USD' },
    items: [{ slug: 'air-jordan-1', brand: 'Jordan', name: 'Air Jordan 1', detail: 'Rojo', size: '42', quantity: 1, unitPrice: { amountCents: 18000, currency: 'USD' }, lineTotal: { amountCents: 18000, currency: 'USD' }, image: null }],
    trackingNumber: 'ASW000000000001',
    tracking: {
      steps: [
        { key: 'paid', state: 'done', at: at(0) },
        { key: 'preparing', state: 'current', at: at(1) },
        { key: 'shipped', state: 'upcoming', at: at(2) },
        { key: 'in_transit', state: 'upcoming', at: at(3) },
        { key: 'delivered', state: 'upcoming', at: at(4) },
      ],
      current: 'preparing',
      nextAt: at(2),
      computedAt: new Date(NOW).toISOString(),
    },
    resumeUrl: null,
  };
}

function setup({ enabled = true, spent = 0, final, deltas, rounds, mine = [] }: { enabled?: boolean; spent?: number; final?: Record<string, unknown>; deltas?: string[]; rounds?: Round[]; mine?: OrderDetail[] }) {
  const config = { stylist: { enabled, model: 'claude-opus-5-5', dailyBudgetUsd: 2 } } as AppConfig;
  const catalog = { listProducts: vi.fn(async () => ({ locale: 'es', items: [card('adidas-gazelle'), card('nike-air-uptempo')] })) } as unknown as CatalogService;
  const upsert = vi.fn(async () => ({}));
  const prisma = { stylistUsage: { findUnique: vi.fn(async () => (spent ? { costMicros: spent } : null)), upsert } } as unknown as PrismaService;
  // Pedidos simulados: solo los de Alicia (mine); cualquier otro usuario no tiene.
  const orders = {
    recent: vi.fn(async (userId: string, _locale: string, limit: number) => (userId === ALICE.id ? mine.slice(0, limit) : [])),
    byNumber: vi.fn(async (userId: string, number: string) => (userId === ALICE.id ? (mine.find((item) => item.number === number) ?? null) : null)),
  };
  const { client, stream } = fakeClient(rounds ?? [{ final: final!, deltas }]);
  const service = new StylistService(config, enabled ? client : null, catalog, prisma, orders as unknown as StylistOrders);
  return { service, stream, upsert, orders };
}

async function run(service: StylistService, question = 'Busco algo clásico', user: SessionUser | null = null) {
  const events: StylistEvent[] = [];
  const request: StylistRequest = { locale: 'es', messages: [{ role: 'user', content: question }] };
  await service.chat(request, (event) => events.push(event), new AbortController().signal, user);
  return events;
}

const toolNames = (params: Record<string, any>) => (params.tools as { name: string }[]).map((tool) => tool.name);

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

  it('sin sesión: solo show_products y ask_to_sign_in; la acción de iniciar sesión llega como evento', async () => {
    const { service, stream, orders } = setup({
      deltas: ['Inicia sesión para ver tus pedidos.'],
      final: { stop_reason: 'tool_use', usage, content: [{ type: 'text', text: 'Inicia sesión para ver tus pedidos.' }, { type: 'tool_use', id: 't1', name: 'ask_to_sign_in', input: {} }] },
    });
    const events = await run(service, '¿Cómo van mis pedidos?');
    expect(toolNames(stream.mock.calls[0]![0] as Record<string, any>)).toEqual(['show_products', 'ask_to_sign_in']);
    expect(events).toEqual([{ type: 'text', text: 'Inicia sesión para ver tus pedidos.' }, { type: 'sign_in' }, { type: 'done' }]);
    expect(stream).toHaveBeenCalledOnce();
    expect(orders.recent).not.toHaveBeenCalled();
  });

  it('con sesión: get_my_orders lee solo los pedidos del usuario, el modelo responde y las tarjetas salen de los números que escribió', async () => {
    const mine = [order('AS-2026-000123'), order('AS-2026-000120', '00000000-0000-4000-8000-000000000002')];
    const { service, stream, orders, upsert } = setup({
      mine,
      rounds: [
        { final: { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_my_orders', input: {} }] } },
        {
          // Un número que no leyó (o de otro usuario) no arma tarjeta.
          deltas: ['Tu pedido as-2026-000123 está en Preparando; ', 'el AS-2026-999999 no aparece.'],
          final: { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Tu pedido as-2026-000123 está en Preparando; el AS-2026-999999 no aparece.' }] },
        },
      ],
    });
    const events = await run(service, '¿Cómo van mis pedidos?', ALICE);

    expect(orders.recent).toHaveBeenCalledWith(ALICE.id, 'es', 5, expect.any(Date));
    expect(stream).toHaveBeenCalledTimes(2);
    const first = stream.mock.calls[0]![0] as Record<string, any>;
    expect(toolNames(first)).toEqual(['show_products', 'get_my_orders', 'get_order']);
    // La segunda vuelta lleva el turno del modelo y el resultado de la herramienta.
    const second = stream.mock.calls[1]![0] as Record<string, any>;
    expect(second.messages).toHaveLength(3);
    expect(second.messages[1].role).toBe('assistant');
    const toolResult = second.messages[2].content[0];
    expect(toolResult).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1' });
    const data = JSON.parse(toolResult.content as string);
    expect(data.orders.map((item: { number: string }) => item.number)).toEqual(['AS-2026-000123', 'AS-2026-000120']);
    expect(data.orders[0]).toMatchObject({ status: 'paid', tracking: { current_step: 'preparing', next_step: 'shipped', next_step_in_minutes: 3 }, items: [{ name: 'Air Jordan 1', size: '42' }] });
    // Sin datos de cuenta en lo que ve el modelo.
    expect(toolResult.content).not.toContain(ALICE.email);

    expect(events).toEqual([
      { type: 'text', text: 'Tu pedido as-2026-000123 está en Preparando; ' },
      { type: 'text', text: 'el AS-2026-999999 no aparece.' },
      { type: 'orders', items: [expect.objectContaining({ id: mine[0]!.id, number: 'AS-2026-000123', trackingStage: 'preparing', nextStepAt: mine[0]!.tracking!.nextAt })] },
      { type: 'done' },
    ]);
    // Un solo registro de uso con la suma de las dos vueltas.
    expect(upsert).toHaveBeenCalledOnce();
    expect((upsert.mock.calls[0] as unknown as [{ create: { inputTokens: number } }])[0].create.inputTokens).toBe(2000);
  });

  it('get_order con un número ajeno responde found: false y no arma tarjeta', async () => {
    const { service, stream, orders } = setup({
      mine: [order('AS-2026-000123')],
      rounds: [
        { final: { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_order', input: { number: 'AS-2026-000999' } }] } },
        { deltas: ['No encontré el pedido AS-2026-000999.'], final: { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'No encontré el pedido AS-2026-000999.' }] } },
      ],
    });
    const events = await run(service, '¿Cuándo llega mi pedido AS-2026-000999?', ALICE);
    expect(orders.byNumber).toHaveBeenCalledWith(ALICE.id, 'AS-2026-000999', 'es', expect.any(Date));
    const second = stream.mock.calls[1]![0] as Record<string, any>;
    expect(JSON.parse(second.messages[2].content[0].content)).toMatchObject({ found: false });
    expect(events).toEqual([{ type: 'text', text: 'No encontré el pedido AS-2026-000999.' }, { type: 'done' }]);
  });

  it('sin números en el texto, la tarjeta es la del pedido más reciente; el texto de vueltas distintas se separa', async () => {
    const mine = [order('AS-2026-000123'), order('AS-2026-000120', '00000000-0000-4000-8000-000000000002')];
    const { service } = setup({
      mine,
      rounds: [
        { deltas: ['Déjame revisar.'], final: { stop_reason: 'tool_use', usage, content: [{ type: 'text', text: 'Déjame revisar.' }, { type: 'tool_use', id: 'toolu_1', name: 'get_my_orders', input: {} }] } },
        { deltas: ['Tu última compra fue un par de Jordan.'], final: { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Tu última compra fue un par de Jordan.' }] } },
      ],
    });
    const events = await run(service, '¿Qué compré la última vez?', ALICE);
    expect(events.filter((event) => event.type === 'text').map((event) => (event.type === 'text' ? event.text : '')).join('')).toBe('Déjame revisar. Tu última compra fue un par de Jordan.');
    expect(events.find((event) => event.type === 'orders')).toMatchObject({ items: [{ number: 'AS-2026-000123' }] });
  });

  it('ask_to_sign_in con sesión se ignora (no aplica)', async () => {
    const { service } = setup({ final: { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 't', name: 'ask_to_sign_in', input: {} }] } });
    expect(await run(service, '¿Cómo van mis pedidos?', ALICE)).toEqual([{ type: 'done' }]);
  });

  describe('respaldo sin modelo (sin clave o sin presupuesto)', () => {
    it('sin sesión: aviso y acción de iniciar sesión', async () => {
      const { service, stream } = setup({ enabled: false });
      expect(await run(service, '¿Cómo van mis pedidos?')).toEqual([{ type: 'notice', code: 'sign_in_required' }, { type: 'sign_in' }, { type: 'done' }]);
      expect(stream).not.toHaveBeenCalled();
    });

    it('con sesión: los pedidos reales, el último o el que se nombra', async () => {
      const mine = [order('AS-2026-000123'), order('AS-2026-000120', '00000000-0000-4000-8000-000000000002')];
      const { service } = setup({ spent: 2_000_000, mine });
      const list = await run(service, 'How are my orders?', ALICE);
      expect(list[0]).toEqual({ type: 'notice', code: 'orders_found', count: 2 });
      expect(list[1]).toMatchObject({ type: 'orders', items: [{ number: 'AS-2026-000123' }, { number: 'AS-2026-000120' }] });

      const latest = await run(service, '¿Qué compré la última vez?', ALICE);
      expect(latest[1]).toMatchObject({ type: 'orders', items: [{ number: 'AS-2026-000123' }] });

      const named = await run(service, '¿Cuándo llega mi pedido as-2026-000120?', ALICE);
      expect(named.slice(0, 2)).toMatchObject([{ type: 'notice', code: 'order_found' }, { type: 'orders', items: [{ number: 'AS-2026-000120' }] }]);

      const missing = await run(service, '¿Y el pedido AS-2026-000777?', ALICE);
      expect(missing[0]).toEqual({ type: 'notice', code: 'order_not_found', count: 2 });
    });

    it('con sesión y sin pedidos: orders_empty', async () => {
      const { service } = setup({ enabled: false });
      expect(await run(service, '¿Cuáles son mis pedidos?', ALICE)).toEqual([{ type: 'notice', code: 'orders_empty' }, { type: 'done' }]);
    });

    it('otra pregunta sin modelo sigue respondiendo unavailable (la web usa el guion)', async () => {
      const { service } = setup({ enabled: false });
      expect(await run(service, 'Busco tenis para correr', ALICE)).toEqual([{ type: 'error', code: 'unavailable' }]);
    });
  });
});

describe('detectOrderQuestion', () => {
  it.each([
    ['¿Cómo van mis pedidos?', { number: null, latest: false }],
    ['¿Cuáles son mis pedidos?', { number: null, latest: false }],
    ['¿Cuándo llega mi pedido AS-2026-000123?', { number: 'AS-2026-000123', latest: false }],
    ['¿Qué compré la última vez?', { number: null, latest: true }],
    ['How are my orders doing?', { number: null, latest: false }],
    ['What did I buy last time?', { number: null, latest: true }],
    ['Where is my package?', { number: null, latest: false }],
    ['when does as-2026-000042 arrive', { number: 'AS-2026-000042', latest: false }],
  ])('%s es una pregunta de pedidos', (text, expected) => {
    expect(detectOrderQuestion(text)).toEqual(expected);
  });

  it.each(['Busco tenis para correr', 'Quiero comprar algo para el verano', 'Ropa para ir de compras', 'In order to look sharp, what should I wear?', 'Do you have track pants?', 'Tell me about the last Jordan release'])(
    '%s no lo es',
    (text) => {
      expect(detectOrderQuestion(text)).toBeNull();
    },
  );
});
