import type { ExecutionContext } from '@nestjs/common';
import type { AppConfig } from '../config/config.module.js';
import { shouldSkipThrottle } from './throttle-skip.js';

const KEY = 'k'.repeat(32);

function context(headers: Record<string, string>, remoteAddress: string) {
  return { switchToHttp: () => ({ getRequest: () => ({ headers, socket: { remoteAddress } }) }) } as unknown as ExecutionContext;
}
const config = (nodeEnv: AppConfig['nodeEnv'], internalApiKey: string | null) => ({ nodeEnv, internalApiKey }) as AppConfig;

describe('shouldSkipThrottle', () => {
  it('salta el límite con la clave interna correcta', () => {
    expect(shouldSkipThrottle(context({ 'x-internal-key': KEY }, '10.0.0.5'), config('production', KEY))).toBe(true);
  });

  it('no lo salta con una clave incorrecta o sin clave configurada', () => {
    expect(shouldSkipThrottle(context({ 'x-internal-key': 'x'.repeat(32) }, '10.0.0.5'), config('production', KEY))).toBe(false);
    expect(shouldSkipThrottle(context({ 'x-internal-key': KEY }, '10.0.0.5'), config('production', null))).toBe(false);
  });

  it('en desarrollo salta el límite solo desde la misma máquina', () => {
    expect(shouldSkipThrottle(context({}, '127.0.0.1'), config('development', null))).toBe(true);
    expect(shouldSkipThrottle(context({}, '192.168.1.20'), config('development', null))).toBe(false);
  });

  it('en Vercel la misma máquina nunca basta, aunque NODE_ENV falte', () => {
    vi.stubEnv('VERCEL', '1');
    try {
      expect(shouldSkipThrottle(context({}, '127.0.0.1'), config('development', null))).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('en producción y en pruebas la misma máquina no basta', () => {
    expect(shouldSkipThrottle(context({}, '127.0.0.1'), config('production', null))).toBe(false);
    expect(shouldSkipThrottle(context({}, '::1'), config('test', null))).toBe(false);
  });
});
