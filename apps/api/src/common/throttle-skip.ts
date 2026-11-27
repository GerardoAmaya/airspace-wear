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
  return isWebServerRequest(context.switchToHttp().getRequest<InternalRequest>(), config);
}

export interface InternalRequest {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

// La petición viene del servidor de la web (misma regla que arriba). Lo usa
// también el estilista, que con esa señal limita por la IP del visitante que
// la web reenvía (CLIENT_IP_HEADER) en vez de por la IP del servidor.
export function isWebServerRequest(request: InternalRequest, config: Pick<AppConfig, 'internalApiKey' | 'nodeEnv'>): boolean {
  const header = request.headers[INTERNAL_KEY_HEADER];
  if (config.internalApiKey && typeof header === 'string' && sameKey(header, config.internalApiKey)) return true;
  return config.nodeEnv === 'development' && LOOPBACK.has(request.socket?.remoteAddress ?? '');
}

// IP del visitante que reenvía el servidor de la web. Solo se cree si
// isWebServerRequest es verdadero (cualquiera podría mandar la cabecera).
export const CLIENT_IP_HEADER = 'x-client-ip';
