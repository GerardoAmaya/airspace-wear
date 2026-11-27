import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Inject, Injectable, Logger, SetMetadata } from '@nestjs/common';
import type { ApiError } from '@airspace/contracts';
import { Reflector } from '@nestjs/core';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { shouldSkipThrottle } from './throttle-skip.js';

// Límite de peticiones propio (reemplaza a @nestjs/throttler, que es CommonJS
// y hace require() de @nestjs/common 12, solo ESM: el cargador de funciones de
// Vercel no lo admite). Ventana fija por IP y ruta, en memoria: en Vercel cada
// instancia lleva su cuenta, suficiente para frenar abusos de un portafolio.

export interface RateLimitOptions {
  limit: number;
  ttlMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = { limit: 120, ttlMs: 60_000 };
const RATE_LIMIT_KEY = 'airspace:rate-limit';
const SKIP_RATE_LIMIT_KEY = 'airspace:skip-rate-limit';
// Tope de claves guardadas: al pasarlo se limpian las ventanas vencidas.
const MAX_KEYS = 10_000;

// Límite propio de una ruta o controlador (por ejemplo, el estilista).
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
// Rutas sin límite (el chequeo de estado).
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);

// 429 { code: 'rate_limited' } con la espera en segundos: ApiExceptionFilter
// la pone en Retry-After. Lo usan también los límites por usuario o por
// visitante (pago, lecturas de pedidos, estilista).
export class RateLimitedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super({ code: 'rate_limited' } satisfies ApiError, HttpStatus.TOO_MANY_REQUESTS);
  }
}

// Segundos que faltan para que se abra la ventana (al menos 1).
export const secondsUntil = (resetAt: number, now: number) => Math.max(1, Math.ceil((resetAt - now) / 1000));

// IP para los registros: sin el último bloque (v4) o con solo los primeros
// grupos (v6). Basta para ver un abuso sin guardar la IP completa.
export function maskIp(ip: string): string {
  if (ip.includes('.')) return ip.replace(/\.\d+$/, '.x');
  return `${ip.split(':').slice(0, 3).join(':')}:x`;
}

interface Window {
  count: number;
  resetAt: number;
}

interface RateLimitRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
}

interface RateLimitResponse {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger('RateLimit');
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, targets)) return true;
    if (shouldSkipThrottle(context, this.config)) return true;

    const { limit, ttlMs } = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, targets) ?? DEFAULT_RATE_LIMIT;
    const http = context.switchToHttp();
    const request = http.getRequest<RateLimitRequest>();
    // request.ip respeta "trust proxy" (TRUST_PROXY), así detrás de Vercel es la IP real.
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const key = `${ip}|${context.getClass().name}.${context.getHandler().name}`;

    const now = Date.now();
    if (this.windows.size > MAX_KEYS) this.prune(now);
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + ttlMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    if (window.count <= limit) return true;

    http.getResponse<RateLimitResponse>().setHeader('Retry-After', String(Math.ceil((window.resetAt - now) / 1000)));
    throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}
