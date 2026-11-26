import { timingSafeEqual } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import type { AppConfig } from '../config/config.module.js';

// Cabecera con la que el servidor de la web se identifica ante la API.
export const INTERNAL_KEY_HEADER = 'x-internal-key';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function sameKey(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// El límite de peticiones es para visitantes, no para el servidor de la web:
// al regenerar la home pide cada producto por separado (unas 50 llamadas por
// idioma) desde una sola IP y llegaba al 429. Se salta el límite si:
// - la petición trae la clave interna correcta (producción), o
// - en desarrollo, viene de la misma máquina (127.0.0.1).
// En las pruebas (NODE_ENV=test) el límite se mantiene siempre.
export function shouldSkipThrottle(context: ExecutionContext, config: AppConfig): boolean {
  const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }>();
  const header = request.headers[INTERNAL_KEY_HEADER];
  if (config.internalApiKey && typeof header === 'string' && sameKey(header, config.internalApiKey)) return true;
  return config.nodeEnv === 'development' && LOOPBACK.has(request.socket?.remoteAddress ?? '');
}
