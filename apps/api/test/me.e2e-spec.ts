import { apiErrorSchema, meResponseSchema } from '@airspace/contracts';
import request from 'supertest';
import { createTestApp, prismaOf, type TestApp } from './support/app.js';

// GET /v1/me con sesiones sembradas directo en airspace_test (sin Google):
// la web reenvía el token de la cookie de Better Auth en Authorization.
const USER = { id: 'e2e-user-me', name: 'Ada Prueba', email: 'ada.prueba@example.com', image: 'https://example.com/ada.png' };
const VALID = 'e2eValidSessionToken0000000000AA';
const EXPIRED = 'e2eExpiredSessionToken000000000A';
const HOUR = 60 * 60 * 1000;

describe('GET /v1/me (e2e)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
    const prisma = prismaOf(app);
    await prisma.user.deleteMany({ where: { id: USER.id } });
    await prisma.user.create({
      data: {
        ...USER,
        emailVerified: true,
        sessions: {
          create: [
            { id: 'e2e-session-valid', token: VALID, expiresAt: new Date(Date.now() + HOUR) },
            { id: 'e2e-session-expired', token: EXPIRED, expiresAt: new Date(Date.now() - HOUR) },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    // Borrar el usuario borra sus sesiones (ON DELETE CASCADE).
    await prismaOf(app).user.deleteMany({ where: { id: USER.id } });
    await app.close();
  });

  const expectUnauthorized = (response: request.Response) => {
    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(response.body)).toEqual({ code: 'unauthorized' });
    expect(response.headers['cache-control']).toBe('no-store');
  };

  it('devuelve el usuario con una sesión válida', async () => {
    const response = await request(app.getHttpServer()).get('/v1/me').set('Authorization', `Bearer ${VALID}`).expect(200);
    expect(meResponseSchema.parse(response.body)).toEqual(USER);
    // Solo los cuatro campos públicos: nada de sesión, tokens ni fechas.
    expect(Object.keys(response.body).sort()).toEqual(['email', 'id', 'image', 'name']);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('responde 401 sin cabecera Authorization', async () => {
    expectUnauthorized(await request(app.getHttpServer()).get('/v1/me'));
  });

  it('responde 401 con un token que no existe', async () => {
    expectUnauthorized(await request(app.getHttpServer()).get('/v1/me').set('Authorization', 'Bearer e2eUnknownSessionToken000000000'));
  });

  it('responde 401 con una sesión vencida', async () => {
    expectUnauthorized(await request(app.getHttpServer()).get('/v1/me').set('Authorization', `Bearer ${EXPIRED}`));
  });

  it('responde 401 con un esquema que no es Bearer o un token mal formado', async () => {
    expectUnauthorized(await request(app.getHttpServer()).get('/v1/me').set('Authorization', `Basic ${VALID}`));
    expectUnauthorized(await request(app.getHttpServer()).get('/v1/me').set('Authorization', 'Bearer corto'));
    expectUnauthorized(await request(app.getHttpServer()).get('/v1/me').set('Authorization', `Bearer ${VALID}' OR '1'='1`));
  });

  it('no acepta la cookie de la web (la API no la recibe ni la usa)', async () => {
    expectUnauthorized(await request(app.getHttpServer()).get('/v1/me').set('Cookie', `better-auth.session_token=${VALID}.firma`));
  });

  it('deja de aceptar el token cuando la sesión se cierra', async () => {
    const prisma = prismaOf(app);
    await prisma.session.create({ data: { id: 'e2e-session-closed', token: 'e2eClosedSessionToken00000000000', expiresAt: new Date(Date.now() + HOUR), userId: USER.id } });
    await request(app.getHttpServer()).get('/v1/me').set('Authorization', 'Bearer e2eClosedSessionToken00000000000').expect(200);
    await prisma.session.delete({ where: { id: 'e2e-session-closed' } });
    expectUnauthorized(await request(app.getHttpServer()).get('/v1/me').set('Authorization', 'Bearer e2eClosedSessionToken00000000000'));
  });
});
