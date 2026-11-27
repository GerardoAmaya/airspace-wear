import { apiErrorSchema, STYLIST_LIMITS } from '@airspace/contracts';
import request from 'supertest';
import { CLIENT_IP_HEADER, INTERNAL_KEY_HEADER } from '../src/common/throttle-skip.js';
import { APP_CONFIG, type AppConfig } from '../src/config/config.module.js';
import { parseEnv } from '../src/config/env.js';
import { createTestApp, type TestApp } from './support/app.js';

// Revisión de seguridad (docs/security.md): cabeceras, CORS, errores sin
// detalles, límites de tamaño y que las cabeceras internas no se puedan
// falsificar desde fuera.

const INTERNAL_KEY = 'e2e-security-internal-key-0000000000';

describe('Seguridad de la API (e2e)', () => {
  let app: TestApp;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const config: AppConfig = { ...parseEnv({ ...process.env, NODE_ENV: 'test' }), internalApiKey: INTERNAL_KEY };
    app = await createTestApp((builder) => builder.overrideProvider(APP_CONFIG).useValue(config));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('cabeceras', () => {
    it('lleva las cabeceras de seguridad de una API JSON y no dice qué servidor es', async () => {
      const response = await request(server()).get('/v1/brands').expect(200);
      expect(response.headers['content-security-policy']).toBe("default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'");
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('CORS: solo el origen de la web, sin credenciales', async () => {
      const allowed = await request(server()).options('/v1/products').set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'POST').expect(204);
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(allowed.headers['access-control-allow-credentials']).toBeUndefined();
      const foreign = await request(server()).get('/v1/brands').set('Origin', 'https://evil.example.com').expect(200);
      expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('errores y cuerpos', () => {
    it('un JSON roto responde 400 { code } sin trazas ni mensajes internos', async () => {
      const response = await request(server()).post('/v1/stylist/chat').set('Content-Type', 'application/json').send('{"locale":').expect(400);
      expect(response.body).toEqual({ code: 'invalid_request' });
      expect(JSON.stringify(response.body)).not.toMatch(/at |node_modules|SyntaxError/);
    });

    it('un cuerpo de más de 100 kB responde 413', async () => {
      const response = await request(server())
        .post('/v1/stylist/chat')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ locale: 'es', messages: [{ role: 'user', content: 'x'.repeat(120_000) }] }))
        .expect(413);
      expect(apiErrorSchema.parse(response.body).code).toBe('invalid_request');
    });

    it('el estilista rechaza un historial de más de totalChars aunque cada mensaje sea válido', async () => {
      const answer = 'a'.repeat(4000);
      const messages = Array.from({ length: 7 }, () => [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: answer },
      ]).flat();
      messages.push({ role: 'user', content: '¿Qué me recomiendas?' });
      expect(messages.reduce((sum, message) => sum + message.content.length, 0)).toBeGreaterThan(STYLIST_LIMITS.totalChars);
      const response = await request(server()).post('/v1/stylist/chat').set(INTERNAL_KEY_HEADER, INTERNAL_KEY).send({ locale: 'es', messages }).expect(400);
      expect(apiErrorSchema.parse(response.body).code).toBe('invalid_request');
    });

    it('métodos y rutas desconocidas responden JSON', async () => {
      await request(server()).delete('/v1/orders').expect(404);
      const response = await request(server()).get('/.env').expect(404);
      expect(response.body).toEqual({ code: 'not_found' });
    });
  });

  describe('cabeceras internas falsificadas', () => {
    it('una clave interna falsa, X-Forwarded-For o x-client-ip no saltan el límite por IP', async () => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 11; attempt++) {
        const response = await request(server())
          .post('/v1/checkout')
          .set(INTERNAL_KEY_HEADER, `${INTERNAL_KEY.slice(0, -1)}x`)
          .set('X-Forwarded-For', `198.51.100.${attempt}`)
          .set(CLIENT_IP_HEADER, `203.0.113.${attempt}`)
          .send({});
        statuses.push(response.status);
      }
      // Sin sesión: 401 hasta el tope de 10 por minuto por IP; luego 429.
      expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    });

    it('un token de sesión con formato raro no llega a la base', async () => {
      for (const header of ['Bearer ', "Bearer ' OR 1=1 --xxxxxxxxxxxx", `Bearer ${'a'.repeat(300)}`, 'Basic dXNlcjpwYXNz']) {
        const response = await request(server()).get('/v1/me').set('Authorization', header).expect(401);
        expect(response.body).toEqual({ code: 'unauthorized' });
      }
    });
  });
});
