import { bearerToken } from './session-auth.guard.js';

describe('bearerToken', () => {
  it('extrae el token de una cabecera Bearer', () => {
    expect(bearerToken('Bearer abcdefghijklmnopqrstuvwxyz012345')).toBe('abcdefghijklmnopqrstuvwxyz012345');
  });

  it('rechaza cabeceras ausentes, repetidas, de otro esquema o con tokens raros', () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken(['Bearer abcdefghijklmnopqrstuvwxyz012345'])).toBeNull();
    expect(bearerToken('Basic abcdefghijklmnopqrstuvwxyz012345')).toBeNull();
    expect(bearerToken('Bearer corto')).toBeNull();
    expect(bearerToken('Bearer abc def ghi jkl mno pqr')).toBeNull();
    expect(bearerToken(`Bearer ${'a'.repeat(300)}`)).toBeNull();
  });
});
