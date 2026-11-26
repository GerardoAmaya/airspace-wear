import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipRateLimit } from '../common/rate-limit.js';
import type { HealthResponse } from '@airspace/contracts';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

// Estado de la API y de la base. Responde 503 (con el mismo cuerpo) si la
// base no contesta, para que un orquestador o la web lo detecten.
@Controller('health')
@SkipRateLimit()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Sin límite de peticiones (lo consultan orquestadores), así que el ping a
  // la base se reutiliza 2 s: muchas llamadas seguidas cuestan una consulta.
  private lastCheck: { at: number; database: Promise<'up' | 'down'> } | null = null;

  private pingDatabase(): Promise<'up' | 'down'> {
    const now = Date.now();
    if (!this.lastCheck || now - this.lastCheck.at > 2000) {
      this.lastCheck = {
        at: now,
        database: this.prisma.$queryRaw`SELECT 1`.then(
          () => 'up' as const,
          () => 'down' as const,
        ),
      };
    }
    return this.lastCheck.database;
  }

  @Get()
  async check(@Res({ passthrough: true }) response: Pick<Response, 'status'>): Promise<HealthResponse> {
    const database = await this.pingDatabase();
    if (database === 'down') response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: database === 'up' ? 'ok' : 'degraded', database, uptimeSeconds: Math.round(process.uptime()) };
  }
}
