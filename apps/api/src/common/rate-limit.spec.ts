import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppConfig } from '../config/config.module.js';
import { maskIp, RateLimit, RateLimitedException, RateLimitGuard, SkipRateLimit } from './rate-limit.js';

class Controller {
  list() {}
  @RateLimit({ limit: 2, ttlMs: 60_000 })
  chat() {}
  @SkipRateLimit()
  health() {}
}

function context(handler: keyof Controller, ip = '203.0.113.7') {
  const headers: Record<string, string> = {};
  const response = { setHeader: vi.fn() };
  return {
    context: {
      getHandler: () => Controller.prototype[handler],
      getClass: () => Controller,
      switchToHttp: () => ({ getRequest: () => ({ ip, headers, socket: { remoteAddress: ip } }), getResponse: () => response }),
    } as unknown as ExecutionContext,
    response,
  };
}

const guard = () => new RateLimitGuard(new Reflector(), { nodeEnv: 'production', internalApiKey: null } as AppConfig);

describe('RateLimitGuard', () => {
  it('respeta el límite propio de la ruta y responde 429 con Retry-After', () => {
    const subject = guard();
    expect(subject.canActivate(context('chat').context)).toBe(true);
    expect(subject.canActivate(context('chat').context)).toBe(true);
    const third = context('chat');
    expect(() => subject.canActivate(third.context)).toThrow(HttpException);
    expect(third.response.setHeader).toHaveBeenCalledWith('Retry-After', '60');
  });

  it('cuenta por IP y por ruta', () => {
    const subject = guard();
    subject.canActivate(context('chat').context);
    subject.canActivate(context('chat').context);
    expect(subject.canActivate(context('chat', '198.51.100.1').context)).toBe(true);
    expect(subject.canActivate(context('list').context)).toBe(true);
  });

  it('usa 120 por minuto por defecto y omite las rutas marcadas', () => {
    const subject = guard();
    for (let index = 0; index < 120; index++) subject.canActivate(context('list').context);
    expect(() => subject.canActivate(context('list').context)).toThrow(HttpException);
    for (let index = 0; index < 200; index++) expect(subject.canActivate(context('health').context)).toBe(true);
  });
});

describe('ayudas del límite', () => {
  it('RateLimitedException responde 429 { code: rate_limited } con la espera', () => {
    const error = new RateLimitedException(42);
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toEqual({ code: 'rate_limited' });
    expect(error.retryAfterSeconds).toBe(42);
  });

  it('maskIp no deja la IP completa en los registros', () => {
    expect(maskIp('203.0.113.77')).toBe('203.0.113.x');
    expect(maskIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3:x');
  });
});
