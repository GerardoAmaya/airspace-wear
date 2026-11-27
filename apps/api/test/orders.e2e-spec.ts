import { apiErrorSchema, createCheckoutResponseSchema, orderDetailSchema, orderListSchema } from '@airspace/contracts';
import Stripe from 'stripe';
import request from 'supertest';
import { INTERNAL_KEY_HEADER } from '../src/common/throttle-skip.js';
import { APP_CONFIG, type AppConfig } from '../src/config/config.module.js';
import { parseEnv } from '../src/config/env.js';
import { CheckoutThrottle } from '../src/orders/checkout-throttle.js';
import { type CheckoutSession, type CheckoutSessionParams, StripeGateway } from '../src/payments/stripe.gateway.js';
import { createTestApp, prismaOf, type TestApp } from './support/app.js';
import { setPublished } from './support/catalog.js';

// Pago de prueba y pedidos (paso 5, fases 2 y 3) contra airspace_test, con
// Stripe simulado: nada sale a la red. La verificación de firma del webhook
// es la real del SDK, con un secreto de prueba.

const WEBHOOK_SECRET = 'whsec_e2e_test_secret_0000000000000000';
const HOUR = 60 * 60 * 1000;
const INTERNAL_KEY = 'e2e-internal-key-000000000000000000';
const ALICE = { id: 'e2e-orders-alice', name: 'Alicia Pedidos', email: 'alicia.pedidos@example.com' };
const BOB = { id: 'e2e-orders-bob', name: 'Bruno Pedidos', email: 'bruno.pedidos@example.com' };
const ALICE_TOKEN = 'e2eOrdersAliceToken0000000000000';
const BOB_TOKEN = 'e2eOrdersBobToken000000000000000';

// Stripe sin red: guarda los parámetros de cada sesión y responde lo que la
// prueba decida. constructEvent no se toca (firma real).
class FakeStripeGateway extends StripeGateway {
  sessions = new Map<string, { params: CheckoutSessionParams; session: CheckoutSession }>();
  created: CheckoutSessionParams[] = [];
  paymentsOn = true;
  webhookOn = true;
  failCreate = false;
  private counter = 0;

  override get enabled(): boolean {
    return this.paymentsOn;
  }

  override get webhookEnabled(): boolean {
    return this.webhookOn;
  }

  override async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSession> {
    if (this.failCreate) throw new Error('red caída (simulada)');
    this.created.push(params);
    const id = `cs_test_e2e_${++this.counter}`;
    const amount = (params.line_items ?? []).reduce((sum, line) => sum + (line.price_data?.unit_amount ?? 0) * (line.quantity ?? 1), 0);
    const session = {
      id,
      object: 'checkout.session',
      url: `https://checkout.stripe.com/c/pay/${id}`,
      status: 'open',
      payment_status: 'unpaid',
      amount_total: amount,
      currency: params.line_items?.[0]?.price_data?.currency ?? 'usd',
      client_reference_id: params.client_reference_id ?? null,
      metadata: params.metadata ?? {},
    } as unknown as CheckoutSession;
    this.sessions.set(id, { params, session });
    return session;
  }

  override async retrieveCheckoutSession(id: string): Promise<CheckoutSession> {
    const entry = this.sessions.get(id);
    if (!entry) throw new Error('sesión desconocida');
    return entry.session;
  }

  // La prueba marca una sesión como pagada o vencida (lo que haría Stripe).
  settle(id: string, change: Partial<CheckoutSession>): CheckoutSession {
    const entry = this.sessions.get(id)!;
    entry.session = { ...entry.session, ...change } as CheckoutSession;
    return entry.session;
  }
}

describe('Pago de prueba y pedidos (e2e)', () => {
  let app: TestApp;
  let stripe: FakeStripeGateway;
  let restorePublished: (() => Promise<void>) | undefined;
  // Productos elegidos de lo que el seed dejó publicado.
  let sneaker: { slug: string; priceCents: number; size: string; stock: number; soldOutSize: string | null; nameEn: string; nameEs: string };
  let single: { slug: string; priceCents: number };

  const server = () => app.getHttpServer();
  // Como el servidor de la web: con la clave interna, que salta el límite por
  // IP (las pruebas hacen más de 10 pagos por minuto desde la misma IP).
  const api = () => request.agent(server()).set(INTERNAL_KEY_HEADER, INTERNAL_KEY);
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const checkout = (body: unknown, token = ALICE_TOKEN) => api().post('/v1/checkout').set(as(token)).send(body as object);

  // Firma un evento con el secreto de prueba, como lo haría Stripe.
  const sendEvent = (event: object, secret = WEBHOOK_SECRET) => {
    const payload = JSON.stringify(event);
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    return api().post('/v1/stripe/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(payload);
  };
  const completedEvent = (session: CheckoutSession, id = `evt_e2e_${Math.random().toString(36).slice(2)}`) => ({
    id,
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: session },
  });

  beforeAll(async () => {
    const config: AppConfig = { ...parseEnv(), internalApiKey: INTERNAL_KEY };
    config.payments = { ...config.payments, stripeSecretKey: 'sk_test_e2e', webhookSecret: WEBHOOK_SECRET, webUrl: 'http://localhost:3000' };
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(APP_CONFIG)
        .useValue(config)
        .overrideProvider(StripeGateway)
        .useFactory({ inject: [APP_CONFIG], factory: (injected: AppConfig) => new FakeStripeGateway(injected) }),
    );
    stripe = app.get(StripeGateway) as FakeStripeGateway;
    const prisma = prismaOf(app);

    await prisma.user.deleteMany({ where: { id: { in: [ALICE.id, BOB.id] } } });
    for (const [user, token] of [
      [ALICE, ALICE_TOKEN],
      [BOB, BOB_TOKEN],
    ] as const) {
      await prisma.user.create({
        data: { ...user, emailVerified: true, sessions: { create: { id: `${user.id}-session`, token, expiresAt: new Date(Date.now() + HOUR) } } },
      });
    }

    const products = await prisma.product.findMany({
      where: { published: true, availability: { not: 'coming_soon' } },
      include: { sizes: { orderBy: { sortOrder: 'asc' } }, translations: true },
      orderBy: { sortOrder: 'asc' },
    });
    const withSizes = products.find((product) => product.sizes.length > 1 && product.sizes.some((size) => size.stock >= 2));
    const oneSize = products.find((product) => product.sizes.length === 1 && product.sizes[0]!.stock >= 1);
    if (!withSizes || !oneSize) throw new Error('El seed no dejó productos con tallas y existencias para probar');
    const size = withSizes.sizes.find((candidate) => candidate.stock >= 2)!;
    sneaker = {
      slug: withSizes.slug,
      priceCents: withSizes.priceCents,
      size: size.label,
      stock: size.stock,
      soldOutSize: withSizes.sizes.find((candidate) => candidate.stock === 0)?.label ?? null,
      nameEs: withSizes.translations.find((row) => row.locale === 'es')!.name,
      nameEn: withSizes.translations.find((row) => row.locale === 'en')!.name,
    };
    single = { slug: oneSize.slug, priceCents: oneSize.priceCents };
  });

  beforeEach(() => app.get(CheckoutThrottle).reset());

  afterEach(() => {
    stripe.paymentsOn = true;
    stripe.webhookOn = true;
    stripe.failCreate = false;
  });

  afterAll(async () => {
    await restorePublished?.();
    // Borrar los usuarios borra sus sesiones y pedidos (ON DELETE CASCADE).
    await prismaOf(app).user.deleteMany({ where: { id: { in: [ALICE.id, BOB.id] } } });
    await app.close();
  });

  describe('POST /v1/checkout', () => {
    it('exige sesión', async () => {
      const response = await api().post('/v1/checkout').send({ locale: 'es', items: [{ slug: single.slug, quantity: 1 }] });
      expect(response.status).toBe(401);
      expect(apiErrorSchema.parse(response.body)).toEqual({ code: 'unauthorized' });
    });

    it('crea el pedido pendiente y la sesión de Stripe con precios del servidor', async () => {
      const before = stripe.created.length;
      const response = await checkout({
        locale: 'es',
        items: [
          { slug: sneaker.slug, size: sneaker.size, quantity: 2 },
          { slug: single.slug, quantity: 1 },
        ],
      }).expect(201);
      const body = createCheckoutResponseSchema.parse(response.body);
      expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      expect(response.headers['cache-control']).toBe('private, no-store');

      const params = stripe.created[before]!;
      expect(params.mode).toBe('payment');
      expect(params.client_reference_id).toBe(body.orderId);
      expect(params.customer_email).toBe(ALICE.email);
      expect(params.locale).toBe('es-419');
      expect(params.metadata).toMatchObject({ orderId: body.orderId });
      expect(params.success_url).toBe(`http://localhost:3000/es/orders/${body.orderId}?paid=1&session_id={CHECKOUT_SESSION_ID}`);
      expect(params.cancel_url).toBe('http://localhost:3000/es/catalog?cart=open');
      expect(params.line_items?.map((line) => [line.price_data?.unit_amount, line.quantity, line.price_data?.currency])).toEqual([
        [sneaker.priceCents, 2, 'usd'],
        [single.priceCents, 1, 'usd'],
      ]);
      expect(params.line_items?.[0]?.price_data?.product_data?.name).toContain(sneaker.nameEs);

      const order = await prismaOf(app).order.findUniqueOrThrow({ where: { id: body.orderId }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
      expect(order.status).toBe('pending');
      expect(order.userId).toBe(ALICE.id);
      expect(order.totalCents).toBe(sneaker.priceCents * 2 + single.priceCents);
      expect(order.stripeCheckoutSessionId).toBe(`cs_test_e2e_${stripe.sessions.size}`);
      expect(order.items.map((item) => [item.slug, item.size, item.quantity, item.unitPriceCents, item.nameEs, item.nameEn])).toEqual([
        [sneaker.slug, sneaker.size, 2, sneaker.priceCents, sneaker.nameEs, sneaker.nameEn],
        [single.slug, expect.anything(), 1, single.priceCents, expect.any(String), expect.any(String)],
      ]);
    });

    it('rechaza precios u otros campos enviados por el navegador', async () => {
      const before = stripe.created.length;
      const tampered = [
        { locale: 'es', items: [{ slug: single.slug, quantity: 1, unitPrice: 1 }] },
        { locale: 'es', items: [{ slug: single.slug, quantity: 1, price: { amountCents: 1, currency: 'USD' } }] },
        { locale: 'es', total: 1, items: [{ slug: single.slug, quantity: 1 }] },
      ];
      for (const body of tampered) {
        const response = await checkout(body).expect(400);
        expect(apiErrorSchema.parse(response.body).code).toBe('invalid_request');
      }
      expect(stripe.created.length).toBe(before);
    });

    it('valida forma, cantidades e idioma', async () => {
      await checkout({ locale: 'es', items: [] }).expect(400);
      await checkout({ locale: 'fr', items: [{ slug: single.slug, quantity: 1 }] }).expect(400);
      await checkout({ locale: 'es', items: [{ slug: single.slug, quantity: 11 }] }).expect(400);
      await checkout({ locale: 'es', items: [{ slug: single.slug, quantity: 0 }] }).expect(400);
      await checkout({ locale: 'es', items: [{ slug: 'NO VALE', quantity: 1 }] }).expect(400);
    });

    it('rechaza productos, tallas y existencias que el catálogo no tiene', async () => {
      const prisma = prismaOf(app);
      const hidden = await prisma.product.findFirst({ where: { published: false }, select: { slug: true } });
      const cases: [unknown[], string][] = [
        [[{ slug: 'no-existe', quantity: 1 }], 'unknown_product'],
        [[{ slug: sneaker.slug, quantity: 1 }], 'invalid_size'],
        [[{ slug: sneaker.slug, size: '99', quantity: 1 }], 'invalid_size'],
        [[{ slug: single.slug, size: 'XXL', quantity: 1 }], 'invalid_size'],
        [[{ slug: sneaker.slug, size: sneaker.size, quantity: Math.min(10, sneaker.stock + 1) }], sneaker.stock >= 10 ? '' : 'out_of_stock'],
        [
          [
            { slug: sneaker.slug, size: sneaker.size, quantity: 1 },
            { slug: sneaker.slug, size: sneaker.size, quantity: 1 },
          ],
          'duplicate_line',
        ],
      ];
      if (hidden) cases.push([[{ slug: hidden.slug, quantity: 1 }], 'unknown_product']);
      if (sneaker.soldOutSize) cases.push([[{ slug: sneaker.slug, size: sneaker.soldOutSize, quantity: 1 }], 'out_of_stock']);
      const before = await prisma.order.count();
      for (const [items, message] of cases) {
        if (!message) continue;
        const response = await checkout({ locale: 'es', items }).expect(400);
        const error = apiErrorSchema.parse(response.body);
        expect(error.code).toBe('invalid_request');
        expect(error.issues?.map((issue) => issue.message)).toContain(message);
      }
      expect(await prisma.order.count()).toBe(before);
    });

    it('rechaza un producto que todavía no está a la venta', async () => {
      const upcoming = await prismaOf(app).product.findFirst({ where: { availability: 'coming_soon' }, select: { slug: true } });
      if (!upcoming) return;
      const restore = await setPublished(prismaOf(app), [upcoming.slug], true);
      restorePublished = restore;
      const response = await checkout({ locale: 'es', items: [{ slug: upcoming.slug, quantity: 1 }] });
      await restore();
      restorePublished = undefined;
      expect(response.status).toBe(400);
      expect(apiErrorSchema.parse(response.body).issues?.map((issue) => issue.message)).toEqual(['unavailable']);
    });

    it('sin Stripe configurado responde 503 y no crea pedidos', async () => {
      stripe.paymentsOn = false;
      const before = await prismaOf(app).order.count();
      const response = await checkout({ locale: 'es', items: [{ slug: single.slug, quantity: 1 }] }).expect(503);
      expect(apiErrorSchema.parse(response.body)).toEqual({ code: 'service_unavailable' });
      expect(await prismaOf(app).order.count()).toBe(before);
    });

    it('si Stripe falla, borra el pedido y responde 503', async () => {
      stripe.failCreate = true;
      const before = await prismaOf(app).order.count();
      await checkout({ locale: 'en', items: [{ slug: single.slug, quantity: 1 }] }).expect(503);
      expect(await prismaOf(app).order.count()).toBe(before);
    });
  });

  describe('límites de intentos de pago', () => {
    it('cada usuario tiene su tope, también a través del servidor de la web', async () => {
      stripe.paymentsOn = false;
      for (let attempt = 0; attempt < 10; attempt++) await checkout({ locale: 'es', items: [{ slug: single.slug, quantity: 1 }] }).expect(503);
      const limited = await checkout({ locale: 'es', items: [{ slug: single.slug, quantity: 1 }] }).expect(429);
      expect(apiErrorSchema.parse(limited.body)).toEqual({ code: 'rate_limited' });
      // Otro usuario no comparte el tope.
      await checkout({ locale: 'es', items: [{ slug: single.slug, quantity: 1 }] }, BOB_TOKEN).expect(503);
    });

    it('sin la clave interna, la IP también tiene tope', async () => {
      stripe.paymentsOn = false;
      const direct = () => request(server()).post('/v1/checkout').set(as(BOB_TOKEN)).send({ locale: 'es', items: [{ slug: single.slug, quantity: 1 }] });
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 11; attempt++) statuses.push((await direct()).status);
      expect(statuses.at(-1)).toBe(429);
    });
  });

  describe('POST /v1/stripe/webhook', () => {
    const newOrder = async (token = ALICE_TOKEN) => {
      const response = await checkout({ locale: 'en', items: [{ slug: single.slug, quantity: 1 }] }, token).expect(201);
      const { orderId } = createCheckoutResponseSchema.parse(response.body);
      const order = await prismaOf(app).order.findUniqueOrThrow({ where: { id: orderId } });
      return { orderId, sessionId: order.stripeCheckoutSessionId! };
    };

    it('rechaza eventos sin firma o con una firma inválida', async () => {
      const { orderId, sessionId } = await newOrder();
      const session = stripe.settle(sessionId, { status: 'complete', payment_status: 'paid' });
      const payload = JSON.stringify(completedEvent(session));
      await api().post('/v1/stripe/webhook').set('Content-Type', 'application/json').send(payload).expect(400);
      await api().post('/v1/stripe/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', 't=1,v1=abc').send(payload).expect(400);
      await sendEvent(completedEvent(session), 'whsec_otro_secreto').expect(400);
      // Cuerpo alterado después de firmar: la firma ya no coincide.
      const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
      await api().post('/v1/stripe/webhook').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(payload.replace('"paid"', '"unpaid"')).expect(400);
      expect((await prismaOf(app).order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('pending');
    });

    it('sin secreto de webhook responde 503', async () => {
      stripe.webhookOn = false;
      await api().post('/v1/stripe/webhook').set('Content-Type', 'application/json').send('{}').expect(503);
    });

    it('checkout.session.completed marca el pedido pagado, una sola vez', async () => {
      const { orderId, sessionId } = await newOrder();
      const session = stripe.settle(sessionId, { status: 'complete', payment_status: 'paid' });
      const event = completedEvent(session, 'evt_e2e_repetido');
      const response = await sendEvent(event).expect(200);
      expect(response.body).toEqual({ received: true });
      const paid = await prismaOf(app).order.findUniqueOrThrow({ where: { id: orderId } });
      expect(paid.status).toBe('paid');
      expect(paid.paidAt).toBeInstanceOf(Date);
      expect(paid.trackingNumber).toMatch(/^ASW\d{12}$/);

      // Stripe reintenta el mismo evento: nada cambia.
      await sendEvent(event).expect(200);
      await sendEvent(completedEvent(session)).expect(200);
      const again = await prismaOf(app).order.findUniqueOrThrow({ where: { id: orderId } });
      expect(again.paidAt?.getTime()).toBe(paid.paidAt?.getTime());
      expect(again.trackingNumber).toBe(paid.trackingNumber);
    });

    it('no paga si el importe, la sesión o el estado del pago no coinciden', async () => {
      const { orderId, sessionId } = await newOrder();
      const base = stripe.settle(sessionId, { status: 'complete', payment_status: 'paid' });
      await sendEvent(completedEvent({ ...base, amount_total: 1 } as CheckoutSession)).expect(200);
      await sendEvent(completedEvent({ ...base, id: 'cs_test_otra' } as CheckoutSession)).expect(200);
      await sendEvent(completedEvent({ ...base, payment_status: 'unpaid' } as CheckoutSession)).expect(200);
      expect((await prismaOf(app).order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('pending');
    });

    it('checkout.session.expired deja el pedido vencido', async () => {
      const { orderId, sessionId } = await newOrder();
      const session = stripe.settle(sessionId, { status: 'expired' });
      await sendEvent({ id: 'evt_e2e_expired', object: 'event', type: 'checkout.session.expired', data: { object: session } }).expect(200);
      expect((await prismaOf(app).order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('expired');
    });

    it('ignora otros eventos y referencias que no son pedidos', async () => {
      await sendEvent({ id: 'evt_e2e_otro', object: 'event', type: 'customer.created', data: { object: { id: 'cus_1' } } }).expect(200);
      await sendEvent(completedEvent({ id: 'cs_x', client_reference_id: 'no-es-uuid', status: 'complete', payment_status: 'paid' } as unknown as CheckoutSession)).expect(200);
    });
  });

  describe('GET /v1/orders y /v1/orders/:id', () => {
    it('exigen sesión', async () => {
      await api().get('/v1/orders').expect(401);
      await api().get('/v1/orders/00000000-0000-4000-8000-000000000000').expect(401);
    });

    it('lista solo los pedidos propios, el más reciente primero', async () => {
      const bobOrder = createCheckoutResponseSchema.parse((await checkout({ locale: 'es', items: [{ slug: single.slug, quantity: 3 }] }, BOB_TOKEN).expect(201)).body);
      const response = await api().get('/v1/orders').set(as(BOB_TOKEN)).expect(200);
      const list = orderListSchema.parse(response.body);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(list.items.map((item) => item.id)).toEqual([bobOrder.orderId]);
      expect(list.items[0]).toMatchObject({ status: 'pending', itemCount: 3, total: { amountCents: single.priceCents * 3, currency: 'USD' }, trackingStage: null });
      expect(list.items[0]!.number).toMatch(/^AS-\d{4}-\d{6}$/);

      const alice = orderListSchema.parse((await api().get('/v1/orders').set(as(ALICE_TOKEN)).expect(200)).body);
      expect(alice.items.length).toBeGreaterThan(1);
      expect(alice.items.some((item) => item.id === bobOrder.orderId)).toBe(false);
      const dates = alice.items.map((item) => item.createdAt);
      expect(dates).toEqual([...dates].sort().reverse());
    });

    it('el pedido de otro usuario responde 404, igual que uno que no existe', async () => {
      const bob = orderListSchema.parse((await api().get('/v1/orders').set(as(BOB_TOKEN)).expect(200)).body).items[0]!;
      const foreign = await api().get(`/v1/orders/${bob.id}`).set(as(ALICE_TOKEN)).expect(404);
      expect(apiErrorSchema.parse(foreign.body)).toEqual({ code: 'not_found' });
      await api().get('/v1/orders/00000000-0000-4000-8000-000000000000').set(as(ALICE_TOKEN)).expect(404);
      await api().get('/v1/orders/no-es-uuid').set(as(ALICE_TOKEN)).expect(400);
    });

    it('sin webhook, abrir el pedido verifica el pago con Stripe y muestra el seguimiento', async () => {
      const created = createCheckoutResponseSchema.parse(
        (await checkout({ locale: 'en', items: [{ slug: sneaker.slug, size: sneaker.size, quantity: 1 }] }).expect(201)).body,
      );
      const order = await prismaOf(app).order.findUniqueOrThrow({ where: { id: created.orderId } });

      // Todavía abierta: pendiente y con el enlace para retomar el pago.
      const open = orderDetailSchema.parse((await api().get(`/v1/orders/${created.orderId}?locale=en`).set(as(ALICE_TOKEN)).expect(200)).body);
      expect(open.status).toBe('pending');
      expect(open.resumeUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      expect(open.tracking).toBeNull();

      stripe.settle(order.stripeCheckoutSessionId!, { status: 'complete', payment_status: 'paid' });
      const en = orderDetailSchema.parse((await api().get(`/v1/orders/${created.orderId}?locale=en`).set(as(ALICE_TOKEN)).expect(200)).body);
      expect(en.status).toBe('paid');
      expect(en.resumeUrl).toBeNull();
      expect(en.trackingNumber).toMatch(/^ASW\d{12}$/);
      expect(en.tracking?.current).toBe('paid');
      expect(en.tracking?.steps.map((step) => step.state)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
      expect(en.items[0]).toMatchObject({ slug: sneaker.slug, name: sneaker.nameEn, size: sneaker.size, quantity: 1, unitPrice: { amountCents: sneaker.priceCents } });

      // Nombres en el idioma pedido, copiados al comprar.
      const es = orderDetailSchema.parse((await api().get(`/v1/orders/${created.orderId}?locale=es`).set(as(ALICE_TOKEN)).expect(200)).body);
      expect(es.items[0]!.name).toBe(sneaker.nameEs);
      expect(es.trackingNumber).toBe(en.trackingNumber);
    });

    it('el seguimiento avanza con el tiempo desde el pago', async () => {
      const prisma = prismaOf(app);
      const paid = await prisma.order.findFirstOrThrow({ where: { userId: ALICE.id, status: 'paid' } });
      await prisma.order.update({ where: { id: paid.id }, data: { paidAt: new Date(Date.now() - 12 * 60 * 1000) } });
      const detail = orderDetailSchema.parse((await api().get(`/v1/orders/${paid.id}`).set(as(ALICE_TOKEN)).expect(200)).body);
      expect(detail.tracking?.current).toBe('shipped');
      expect(detail.tracking?.steps.map((step) => step.state)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
      const list = orderListSchema.parse((await api().get('/v1/orders').set(as(ALICE_TOKEN)).expect(200)).body);
      expect(list.items.find((item) => item.id === paid.id)?.trackingStage).toBe('shipped');
    });
  });
});
