import { type StylistEvent, stylistEventSchema } from '@airspace/contracts';
import request from 'supertest';
import { CLIENT_IP_HEADER, INTERNAL_KEY_HEADER } from '../src/common/throttle-skip.js';
import { APP_CONFIG, type AppConfig } from '../src/config/config.module.js';
import { parseEnv } from '../src/config/env.js';
import { orderNumber } from '../src/orders/orders.mapper.js';
import { StylistThrottle } from '../src/stylist/stylist-throttle.js';
import { ANTHROPIC_CLIENT } from '../src/stylist/stylist.service.js';
import { createTestApp, prismaOf, type TestApp } from './support/app.js';

// Estilista con pedidos (POST /v1/stylist/chat) contra airspace_test, con el
// modelo simulado: nada sale a Anthropic. Comprueba que la sesión es
// opcional, que las herramientas de pedidos solo existen con sesión válida y
// que solo devuelven pedidos del usuario de esa sesión.

const INTERNAL_KEY = 'e2e-internal-key-stylist-0000000000';
const HOUR = 60 * 60 * 1000;
const ALICE = { id: 'e2e-stylist-alice', name: 'Alicia Estilo', email: 'alicia.estilo@example.com' };
const BOB = { id: 'e2e-stylist-bob', name: 'Bruno Estilo', email: 'bruno.estilo@example.com' };
const ALICE_TOKEN = 'e2eStylistAliceToken000000000000';
const BOB_TOKEN = 'e2eStylistBobToken00000000000000';
const EXPIRED_TOKEN = 'e2eStylistExpiredToken0000000000';

type Params = { tools: { name: string }[]; messages: { role: string; content: unknown }[] };

// Modelo simulado. Con get_my_orders, la primera vuelta lo llama; con el
// resultado, responde nombrando todo lo que leyó más un número ajeno (la
// API no debe armar tarjeta de ese). Sin sesión, pide iniciar sesión.
function fakeModel(foreignNumber: () => string) {
  const calls: Params[] = [];
  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const message = (content: unknown[], stop_reason = 'tool_use') => ({ role: 'assistant', stop_reason, usage, content });
  const reply = (params: Params) => {
    const last = params.messages.at(-1)!;
    const names = params.tools.map((tool) => tool.name);
    if (Array.isArray(last.content)) {
      const result = JSON.parse((last.content[0] as { content: string }).content) as { orders: { number: string }[] };
      const numbers = result.orders.map((order) => order.number);
      const text = `Tienes ${numbers.length} pedidos: ${[...numbers, foreignNumber()].join(', ')}.`;
      return { text, final: message([{ type: 'text', text }], 'end_turn') };
    }
    if (names.includes('get_my_orders')) return { text: '', final: message([{ type: 'tool_use', id: 'toolu_get', name: 'get_my_orders', input: {} }]) };
    return { text: 'Inicia sesión para ver tus pedidos.', final: message([{ type: 'text', text: 'Inicia sesión para ver tus pedidos.' }, { type: 'tool_use', id: 'toolu_sign', name: 'ask_to_sign_in', input: {} }]) };
  };
  const client = {
    beta: {
      messages: {
        stream: (params: Params) => {
          // Copia: la API agrega mensajes al mismo arreglo en la vuelta siguiente.
          calls.push({ ...params, messages: [...params.messages] });
          const { text, final } = reply(params);
          return {
            async *[Symbol.asyncIterator]() {
              if (text) yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
            },
            finalMessage: async () => final,
          };
        },
      },
    },
  };
  return { client, calls };
}

function parseSse(text: string): StylistEvent[] {
  return text
    .split('\n\n')
    .map((block) => block.split('\n').find((line) => line.startsWith('data:')))
    .filter((line): line is string => Boolean(line))
    .map((line) => stylistEventSchema.parse(JSON.parse(line.slice(5))));
}

async function seedUsers(app: TestApp) {
  const prisma = prismaOf(app);
  await prisma.user.deleteMany({ where: { id: { in: [ALICE.id, BOB.id] } } });
  for (const [user, token] of [
    [ALICE, ALICE_TOKEN],
    [BOB, BOB_TOKEN],
  ] as const) {
    await prisma.user.create({ data: { ...user, emailVerified: true, sessions: { create: [{ id: `${user.id}-session`, token, expiresAt: new Date(Date.now() + HOUR) }] } } });
  }
  await prisma.session.create({ data: { id: `${ALICE.id}-expired`, token: EXPIRED_TOKEN, expiresAt: new Date(Date.now() - HOUR), userId: ALICE.id } });
  const seedOrder = async (userId: string, minutesAgo: number, name: string) => {
    const paidAt = new Date(Date.now() - minutesAgo * 60_000);
    const order = await prisma.order.create({
      data: {
        userId,
        status: 'paid',
        subtotalCents: 18000,
        totalCents: 18000,
        locale: 'es',
        paidAt,
        createdAt: paidAt,
        trackingNumber: `ASW${userId.length}${String(Date.now()).slice(-8)}${minutesAgo}`,
        items: { create: [{ slug: 'air-jordan-1', brand: 'Jordan', nameEs: name, nameEn: name, size: '42', unitPriceCents: 18000, quantity: 1 }] },
      },
    });
    return orderNumber(order.seq, order.createdAt);
  };
  return {
    alice: [await seedOrder(ALICE.id, 7, 'Air Jordan 1 Alicia'), await seedOrder(ALICE.id, 40, 'Samba Alicia')],
    bob: [await seedOrder(BOB.id, 2, 'Pedido secreto de Bruno')],
  };
}

describe('Estilista con pedidos (e2e)', () => {
  let app: TestApp;
  let numbers: { alice: string[]; bob: string[] };
  let model: ReturnType<typeof fakeModel>;
  let enabled = true;

  const chat = (question: string, token?: string, clientIp = '203.0.113.10') => {
    const call = request(app.getHttpServer()).post('/v1/stylist/chat').set(INTERNAL_KEY_HEADER, INTERNAL_KEY).set(CLIENT_IP_HEADER, clientIp);
    if (token) call.set('Authorization', `Bearer ${token}`);
    return call.send({ locale: 'es', messages: [{ role: 'user', content: question }] });
  };

  beforeAll(async () => {
    model = fakeModel(() => numbers.bob[0]!);
    const base = parseEnv({ ...process.env, NODE_ENV: 'test', INTERNAL_API_KEY: INTERNAL_KEY });
    // Un getter: cada prueba decide si la IA está disponible.
    const config: AppConfig = {
      ...base,
      get stylist() {
        return { enabled, model: 'claude-opus-5-5', dailyBudgetUsd: 1000 };
      },
    };
    app = await createTestApp((builder) => builder.overrideProvider(APP_CONFIG).useValue(config).overrideProvider(ANTHROPIC_CLIENT).useValue(model.client));
    numbers = await seedUsers(app);
  });

  beforeEach(() => {
    enabled = true;
    model.calls.length = 0;
    app.get(StylistThrottle).reset();
  });

  afterAll(async () => {
    // Borrar los usuarios borra sus sesiones y pedidos (ON DELETE CASCADE).
    await prismaOf(app).user.deleteMany({ where: { id: { in: [ALICE.id, BOB.id] } } });
    await app.close();
  });

  it('con sesión: lee solo los pedidos del usuario y arma tarjetas solo de esos', async () => {
    const response = await chat('¿Cómo van mis pedidos?', ALICE_TOKEN).expect(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toBe('private, no-store');

    expect(model.calls).toHaveLength(2);
    expect(model.calls[0]!.tools.map((tool) => tool.name)).toEqual(['show_products', 'get_my_orders', 'get_order']);
    // Lo que vio el modelo: los pedidos de Alicia, ninguno de Bruno.
    const toolResult = JSON.stringify(model.calls[1]!.messages.at(-1));
    for (const number of numbers.alice) expect(toolResult).toContain(number);
    expect(toolResult).not.toContain(numbers.bob[0]);
    expect(toolResult).not.toContain('Pedido secreto de Bruno');
    expect(toolResult).not.toContain(ALICE.email);

    const events = parseSse(response.text);
    const orders = events.find((event) => event.type === 'orders');
    expect(orders?.type === 'orders' && orders.items.map((item) => item.number)).toEqual(numbers.alice);
    expect(events.at(-1)).toEqual({ type: 'done' });
  });

  it('sin sesión (o con una vencida): sin herramientas de pedidos y con la acción de iniciar sesión', async () => {
    for (const token of [undefined, EXPIRED_TOKEN, 'not a token']) {
      model.calls.length = 0;
      const events = parseSse((await chat('¿Cómo van mis pedidos?', token).expect(200)).text);
      expect(model.calls[0]!.tools.map((tool) => tool.name)).toEqual(['show_products', 'ask_to_sign_in']);
      expect(events).toEqual([{ type: 'text', text: 'Inicia sesión para ver tus pedidos.' }, { type: 'sign_in' }, { type: 'done' }]);
    }
  });

  it('sin IA: responde preguntas de pedidos con datos reales, sin modelo', async () => {
    enabled = false;
    const signedIn = parseSse((await chat('¿Cuándo llega mi pedido ' + numbers.alice[1] + '?', ALICE_TOKEN).expect(200)).text);
    expect(signedIn[0]).toEqual({ type: 'notice', code: 'order_found' });
    expect(signedIn[1]).toMatchObject({ type: 'orders', items: [{ number: numbers.alice[1], status: 'paid' }] });

    // El número de Bruno no existe para Alicia.
    const foreign = parseSse((await chat(`¿Cuándo llega mi pedido ${numbers.bob[0]}?`, ALICE_TOKEN).expect(200)).text);
    expect(foreign[0]).toEqual({ type: 'notice', code: 'order_not_found', count: 2 });
    expect(JSON.stringify(foreign.slice(1))).not.toContain(numbers.bob[0]);

    const signedOut = parseSse((await chat('How are my orders?').expect(200)).text);
    expect(signedOut).toEqual([{ type: 'notice', code: 'sign_in_required' }, { type: 'sign_in' }, { type: 'done' }]);

    const other = parseSse((await chat('Busco tenis para correr', ALICE_TOKEN).expect(200)).text);
    expect(other).toEqual([{ type: 'error', code: 'unavailable' }]);
    expect(model.calls).toHaveLength(0);
  });

  it('por el servidor de la web: 10 mensajes por minuto por IP del visitante', async () => {
    enabled = false;
    for (let index = 0; index < 10; index++) await chat('Hola', undefined, '203.0.113.20').expect(200);
    const limited = await chat('Hola', undefined, '203.0.113.20').expect(429);
    expect(limited.body).toEqual({ code: 'rate_limited' });
    // Otro visitante no comparte la cuenta.
    await chat('Hola', undefined, '203.0.113.21').expect(200);
  });
});
