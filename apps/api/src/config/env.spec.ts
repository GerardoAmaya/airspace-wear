import { LOCAL_DATABASE_URL, parseEnv } from './env.js';

describe('parseEnv', () => {
  it('usa valores locales por defecto fuera de producción', () => {
    expect(parseEnv({})).toEqual({
      nodeEnv: 'development',
      port: 4000,
      host: '127.0.0.1',
      trustProxy: 0,
      webOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      databaseUrl: LOCAL_DATABASE_URL,
      stylist: { enabled: false, model: 'claude-opus-5-5', dailyBudgetUsd: 2 },
    });
  });

  it('exige DATABASE_URL en producción sin mostrar valores', () => {
    expect(() => parseEnv({ NODE_ENV: 'production', WEB_ORIGIN: 'https://example.com' })).toThrow(/DATABASE_URL/);
  });

  it('activa el estilista solo si hay clave de Anthropic y no está apagado', () => {
    expect(parseEnv({ ANTHROPIC_API_KEY: 'x' }).stylist.enabled).toBe(true);
    expect(parseEnv({ ANTHROPIC_API_KEY: 'x', STYLIST_ENABLED: 'false' }).stylist.enabled).toBe(false);
    expect(parseEnv({}).stylist.enabled).toBe(false);
  });

  it('normaliza WEB_ORIGIN al origen, sin barra final', () => {
    expect(parseEnv({ WEB_ORIGIN: 'https://airspace.example/, https://www.airspace.example' }).webOrigins).toEqual(['https://airspace.example', 'https://www.airspace.example']);
  });

  it('rechaza un puerto que no es número', () => {
    expect(() => parseEnv({ API_PORT: 'abc' })).toThrow(/API_PORT/);
  });
});
