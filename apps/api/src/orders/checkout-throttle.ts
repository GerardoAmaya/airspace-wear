import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { ApiError } from '@airspace/contracts';

// Límite de intentos de pago por usuario (ventana fija, en memoria). El
// límite por IP de RateLimitGuard no alcanza: el servidor de la web reenvía
// el pago con la clave interna (que salta ese límite) y desde una sola IP
// para todos. Así cada cuenta tiene su propio tope.
export const CHECKOUT_LIMIT = { limit: 10, ttlMs: 60_000 };
const MAX_KEYS = 10_000;

@Injectable()
export class CheckoutThrottle {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  // Lanza 429 si el usuario ya pasó el tope en la ventana actual.
  hit(userId: string, now = Date.now()): void {
    if (this.windows.size > MAX_KEYS) for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
    let window = this.windows.get(userId);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + CHECKOUT_LIMIT.ttlMs };
      this.windows.set(userId, window);
    }
    window.count += 1;
    if (window.count > CHECKOUT_LIMIT.limit) throw new HttpException({ code: 'rate_limited' } satisfies ApiError, HttpStatus.TOO_MANY_REQUESTS);
  }

  // Solo para pruebas.
  reset(): void {
    this.windows.clear();
  }
}
