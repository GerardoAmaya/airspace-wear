import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiError } from '@airspace/contracts';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { CLIENT_IP_HEADER, type InternalRequest, isWebServerRequest } from '../common/throttle-skip.js';

// Límite del estilista cuando la pregunta llega a través del servidor de la
// web (app/api/stylist/chat). Ese servidor manda la clave interna, que salta
// el límite por IP de RateLimitGuard, y llama desde una sola IP para todos.
// Por eso aquí se cuenta por la IP del visitante que la web reenvía: el mismo
// tope de 10 mensajes por minuto que tienen las llamadas directas.
export const STYLIST_LIMIT = { limit: 10, ttlMs: 60_000 };
const MAX_KEYS = 10_000;
// Una IP (v4 o v6) cabe de sobra; algo más largo no se usa como clave.
const CLIENT_IP = /^[0-9A-Fa-f:.]{2,64}$/;

@Injectable()
export class StylistThrottle {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  // Lanza 429 si el visitante ya pasó el tope. Las llamadas directas (sin la
  // clave interna) ya las limitó RateLimitGuard por IP: no se cuentan dos veces.
  check(request: InternalRequest, now = Date.now()): void {
    if (!isWebServerRequest(request, this.config)) return;
    const header = request.headers[CLIENT_IP_HEADER];
    const ip = typeof header === 'string' && CLIENT_IP.test(header.trim()) ? header.trim() : 'web';
    if (this.windows.size > MAX_KEYS) for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
    let window = this.windows.get(ip);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + STYLIST_LIMIT.ttlMs };
      this.windows.set(ip, window);
    }
    window.count += 1;
    if (window.count > STYLIST_LIMIT.limit) throw new HttpException({ code: 'rate_limited' } satisfies ApiError, HttpStatus.TOO_MANY_REQUESTS);
  }

  // Solo para pruebas.
  reset(): void {
    this.windows.clear();
  }
}
