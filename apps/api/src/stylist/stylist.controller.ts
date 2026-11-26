import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type StylistEvent, type StylistRequest, stylistRequestSchema, type StylistStatus } from '@airspace/contracts';
import type { Request, Response } from 'express';
import { StylistService } from './stylist.service.js';

@Controller('stylist')
export class StylistController {
  constructor(private readonly stylist: StylistService) {}

  // GET /v1/stylist/status: la web usa el guion si la IA no está disponible.
  @Get('status')
  status(): Promise<StylistStatus> {
    return this.stylist.status();
  }

  // POST /v1/stylist/chat: respuesta en streaming (text/event-stream). Límite
  // propio, más estricto que el general: 10 mensajes por minuto por IP.
  @Post('chat')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async chat(@Body({ schema: stylistRequestSchema }) body: StylistRequest, @Req() request: Request, @Res() response: Response): Promise<void> {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    // Si el visitante cierra o cancela, se corta también el pedido al modelo.
    const controller = new AbortController();
    request.on('close', () => controller.abort());

    const emit = (event: StylistEvent) => {
      if (!response.writableEnded) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    await this.stylist.chat(body, emit, controller.signal);
    response.end();
  }
}
