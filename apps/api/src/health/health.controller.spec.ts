import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@airspace/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

// Prisma simulado: solo importa si la consulta de prueba responde o falla.
async function createController(queryRaw: () => Promise<unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('responde ok cuando la base contesta, con la forma del contrato', async () => {
    const controller = await createController(() => Promise.resolve([{ '?column?': 1 }]));
    const response = { status: vi.fn() };
    const body = await controller.check(response);
    expect(body).toMatchObject({ status: 'ok', database: 'up' });
    expect(healthResponseSchema.safeParse(body).success).toBe(true);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('responde 503 con estado degradado cuando la base no contesta', async () => {
    const controller = await createController(() => Promise.reject(new Error('sin conexión')));
    const response = { status: vi.fn() };
    const body = await controller.check(response);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body).toMatchObject({ status: 'degraded', database: 'down' });
  });
});
