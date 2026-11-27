import { Body, Controller, Get, Header, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  type CreateCheckoutRequest,
  createCheckoutRequestSchema,
  type CreateCheckoutResponse,
  type LocaleQuery,
  localeQuerySchema,
  type OrderDetail,
  orderIdSchema,
  type OrderList,
} from '@airspace/contracts';
import { CurrentUser, type SessionUser, SessionAuthGuard } from '../auth/session-auth.guard.js';
import { RateLimit } from '../common/rate-limit.js';
import { CheckoutThrottle } from './checkout-throttle.js';
import { OrdersService } from './orders.service.js';

// Pago y pedidos del usuario con sesión (la web reenvía el token de sesión
// en Authorization: Bearer). Datos personales: nunca en caché compartida.
@Controller()
@UseGuards(SessionAuthGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly throttle: CheckoutThrottle,
  ) {}

  // POST /v1/checkout { locale, items: [{ slug, size?, quantity }] }
  // Límites: 10 intentos por minuto por IP (llamadas directas) y por usuario
  // (CheckoutThrottle, también a través del servidor de la web).
  @Post('checkout')
  @RateLimit({ limit: 10, ttlMs: 60_000 })
  @Header('Cache-Control', 'private, no-store')
  checkout(@CurrentUser() user: SessionUser, @Body({ schema: createCheckoutRequestSchema }) body: CreateCheckoutRequest): Promise<CreateCheckoutResponse> {
    this.throttle.hit(user.id);
    return this.orders.createCheckout(user, body);
  }

  @Get('orders')
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() user: SessionUser): Promise<OrderList> {
    return this.orders.list(user.id);
  }

  // GET /v1/orders/:id?locale=es (404 si no existe o es de otro usuario).
  @Get('orders/:id')
  @Header('Cache-Control', 'private, no-store')
  detail(@CurrentUser() user: SessionUser, @Param('id', { schema: orderIdSchema }) id: string, @Query({ schema: localeQuerySchema }) query: LocaleQuery): Promise<OrderDetail> {
    return this.orders.detail(user.id, id, query.locale);
  }
}
