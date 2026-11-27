import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { StripeGateway } from '../payments/stripe.gateway.js';
import { CheckoutThrottle } from './checkout-throttle.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';

// Pago de prueba con Stripe Checkout, pedidos y seguimiento (paso 5).
@Module({
  imports: [AuthModule],
  controllers: [OrdersController, StripeWebhookController],
  providers: [OrdersService, StripeGateway, CheckoutThrottle],
})
export class OrdersModule {}
