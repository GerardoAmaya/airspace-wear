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
      internalApiKey: null,
      stylist: { enabled: false, model: 'claude-opus-5-5', dailyBudgetUsd: 2 },
      payments: { stripeSecretKey: null, rejectedLiveKey: false, webhookSecret: null, webUrl: 'http://localhost:3000' },
    });
  });

  it('en Vercel usa el PORT asignado y escucha en todas las interfaces', () => {
    const config = parseEnv({ PORT: '8080', VERCEL: '1' });
    expect(config.port).toBe(8080);
    expect(config.host).toBe('0.0.0.0');
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

  it('acepta solo claves de prueba de Stripe y nunca una real', () => {
    expect(parseEnv({ STRIPE_SECRET_KEY: 'sk_test_abc123' }).payments.stripeSecretKey).toBe('sk_test_abc123');
    expect(parseEnv({ STRIPE_SECRET_KEY: 'rk_test_abc123' }).payments.stripeSecretKey).toBe('rk_test_abc123');
    const live = parseEnv({ STRIPE_SECRET_KEY: 'sk_live_abc123' }).payments;
    expect(live.stripeSecretKey).toBeNull();
    expect(live.rejectedLiveKey).toBe(true);
  });

  it('arma las URLs de retorno con WEB_PUBLIC_URL o el primer origen de la web', () => {
    expect(parseEnv({ WEB_ORIGIN: 'https://web.example, https://otra.example' }).payments.webUrl).toBe('https://web.example');
    expect(parseEnv({ WEB_ORIGIN: 'https://web.example', WEB_PUBLIC_URL: 'https://tienda.example/' }).payments.webUrl).toBe('https://tienda.example');
  });
});
