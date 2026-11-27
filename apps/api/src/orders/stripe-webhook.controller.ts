import { Controller, Headers, HttpCode, HttpException, HttpStatus, Logger, Post, type RawBodyRequest, Req } from '@nestjs/common';
import type { ApiError } from '@airspace/contracts';
import type { Request } from 'express';
import { StripeGateway } from '../payments/stripe.gateway.js';
import { OrdersService } from './orders.service.js';

// POST /v1/stripe/webhook: avisos de Stripe (checkout.session.completed y
// compañía). Sin sesión de usuario: lo que lo autentica es la firma
// Stripe-Signature, calculada sobre el cuerpo exacto. Por eso la app se crea
// con rawBody: true (APP_OPTIONS en app.setup.ts), que guarda los bytes
// originales en request.rawBody además del JSON ya leído.
@Controller('stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripe: StripeGateway,
    private readonly orders: OrdersService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() request: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string | undefined): Promise<{ received: true }> {
    if (!this.stripe.webhookEnabled) throw new HttpException({ code: 'service_unavailable' } satisfies ApiError, HttpStatus.SERVICE_UNAVAILABLE);
    if (!request.rawBody || typeof signature !== 'string') throw new HttpException({ code: 'invalid_request' } satisfies ApiError, HttpStatus.BAD_REQUEST);
    let event;
    try {
      event = this.stripe.constructEvent(request.rawBody, signature);
    } catch {
      this.logger.warn('Webhook de Stripe con firma inválida');
      throw new HttpException({ code: 'invalid_request' } satisfies ApiError, HttpStatus.BAD_REQUEST);
    }
    // Si falla (por ejemplo, la base), responde 500 y Stripe lo reintenta.
    await this.orders.handleEvent(event);
    return { received: true };
  }
}
