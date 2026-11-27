import { Inject, Injectable, Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import * as stripeModule from 'stripe';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';

// Vercel compila la API con otras reglas de módulos que tsc local (ver
// resolveHelmet en app.setup.ts): según cuál, stripe llega como la clase,
// como { default } o como { Stripe }. Se busca el constructor en tiempo de
// ejecución.
type StripeConstructor = new (key: string, config?: Stripe.StripeConfig) => Stripe;
function resolveStripe(candidate: unknown): StripeConstructor {
  let current = candidate;
  for (let depth = 0; depth < 3 && typeof current !== 'function'; depth++) {
    const module = current as { default?: unknown; Stripe?: unknown };
    current = module.default ?? module.Stripe;
  }
  if (typeof current !== 'function') throw new Error('stripe no se pudo cargar');
  return current as StripeConstructor;
}

export type CheckoutSession = Stripe.Checkout.Session;
export type CheckoutSessionParams = Stripe.Checkout.SessionCreateParams;
export type StripeEvent = Stripe.Event;

// Stripe en modo de prueba (docs/plan-paso-5.md, fase 2). Única puerta de la
// API hacia Stripe: las pruebas e2e reemplazan los métodos que salen a la red
// (crear y leer sesiones) y usan la verificación de firma real.
@Injectable()
export class StripeGateway {
  private readonly logger = new Logger(StripeGateway.name);
  private client: Stripe | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    if (config.payments.rejectedLiveKey) this.logger.warn('STRIPE_SECRET_KEY no es una clave de prueba: el pago queda apagado');
  }

  // Hay pago si hay una clave de prueba.
  get enabled(): boolean {
    return this.config.payments.stripeSecretKey !== null;
  }

  // Hay webhook si hay secreto de firma.
  get webhookEnabled(): boolean {
    return this.config.payments.webhookSecret !== null;
  }

  // El cliente se crea al primer uso (así la API arranca sin clave).
  private stripe(): Stripe {
    const key = this.config.payments.stripeSecretKey;
    if (!key) throw new Error('Stripe no está configurado');
    if (!this.client) {
      const StripeClient = resolveStripe(stripeModule);
      // Pocos reintentos y un tiempo máximo corto: el visitante espera la respuesta.
      this.client = new StripeClient(key, { maxNetworkRetries: 1, timeout: 10_000, appInfo: { name: 'AIRSPACE Wear (portfolio)' } });
    }
    return this.client;
  }

  // La clave de idempotencia (el id del pedido) evita dos sesiones de pago
  // para el mismo pedido si la petición se repite.
  async createCheckoutSession(params: CheckoutSessionParams, idempotencyKey: string): Promise<CheckoutSession> {
    return this.stripe().checkout.sessions.create(params, { idempotencyKey });
  }

  async retrieveCheckoutSession(id: string): Promise<CheckoutSession> {
    return this.stripe().checkout.sessions.retrieve(id);
  }

  // Verifica la firma (Stripe-Signature) con el cuerpo exacto que llegó y
  // devuelve el evento. Lanza si la firma no coincide o es vieja (5 minutos).
  constructEvent(rawBody: Buffer, signature: string): StripeEvent {
    const secret = this.config.payments.webhookSecret;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET no está configurado');
    const StripeClient = resolveStripe(stripeModule) as unknown as { webhooks: Stripe['webhooks'] };
    return StripeClient.webhooks.constructEvent(rawBody, signature, secret);
  }
}
