import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { RateLimit } from '../common/rate-limit.js';
import { type StylistEvent, type StylistRequest, stylistRequestSchema, type StylistStatus } from '@airspace/contracts';
import type { Request, Response } from 'express';
import { StylistOrders } from './stylist-orders.js';
import { StylistThrottle } from './stylist-throttle.js';
import { StylistService } from './stylist.service.js';

@Controller('stylist')
export class StylistController {
  constructor(
    private readonly stylist: StylistService,
    private readonly orders: StylistOrders,
    private readonly throttle: StylistThrottle,
  ) {}

  // GET /v1/stylist/status: la web usa el guion si la IA no está disponible.
  @Get('status')
  status(): Promise<StylistStatus> {
    return this.stylist.status();
  }

  // POST /v1/stylist/chat: respuesta en streaming (text/event-stream). Límite
  // propio, más estricto que el general: 10 mensajes por minuto por IP (la
  // del visitante también si llega por el servidor de la web, StylistThrottle).
  // Sesión opcional: con Authorization: Bearer <token de sesión> válido, el
  // estilista puede leer los pedidos de ese usuario; sin ella responde igual.
  @Post('chat')
  @RateLimit({ limit: 10, ttlMs: 60_000 })
  async chat(@Body({ schema: stylistRequestSchema }) body: StylistRequest, @Req() request: Request, @Res() response: Response): Promise<void> {
    this.throttle.check(request);
    const user = await this.orders.sessionUser(request.headers.authorization);
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    // Puede llevar datos del usuario (pedidos): nunca en caché.
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    // Si el visitante cierra o cancela, se corta también el pedido al modelo.
    const controller = new AbortController();
    request.on('close', () => controller.abort());

    const emit = (event: StylistEvent) => {
      if (!response.writableEnded) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    await this.stylist.chat(body, emit, controller.signal, user);
    response.end();
  }
}
