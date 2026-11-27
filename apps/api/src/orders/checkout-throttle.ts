import { Injectable } from '@nestjs/common';
import { RateLimitedException, type RateLimitOptions, secondsUntil } from '../common/rate-limit.js';

// Límites por usuario: intentos de pago y lecturas de pedidos (ventana fija, en memoria). El
// límite por IP de RateLimitGuard no alcanza: el servidor de la web reenvía
// el pago con la clave interna (que salta ese límite) y desde una sola IP
// para todos. Así cada cuenta tiene su propio tope.
export const CHECKOUT_LIMIT: RateLimitOptions = { limit: 10, ttlMs: 60_000 };
// Lecturas de pedidos (lista, detalle) por usuario: la web también las pide
// con la clave interna, así que el límite por IP no las cubre. Una persona
// abre unas pocas por minuto; 60 deja margen para recargas.
export const ORDERS_READ_LIMIT: RateLimitOptions = { limit: 60, ttlMs: 60_000 };
const MAX_KEYS = 10_000;

@Injectable()
export class CheckoutThrottle {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  // Lanza 429 (con Retry-After) si el usuario ya pasó el tope de pagos.
  hit(userId: string, now = Date.now()): void {
    this.count(`checkout:${userId}`, CHECKOUT_LIMIT, now);
  }

  // Igual para las lecturas de pedidos (contador aparte del de pagos).
  hitRead(userId: string, now = Date.now()): void {
    this.count(`read:${userId}`, ORDERS_READ_LIMIT, now);
  }

  private count(key: string, rule: RateLimitOptions, now: number): void {
    if (this.windows.size > MAX_KEYS) for (const [stored, window] of this.windows) if (window.resetAt <= now) this.windows.delete(stored);
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + rule.ttlMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    if (window.count > rule.limit) throw new RateLimitedException(secondsUntil(window.resetAt, now));
  }

  // Solo para pruebas.
  reset(): void {
    this.windows.clear();
  }
}
