import { TRACKING_STEP_MS, trackingSchema } from '@airspace/contracts';
import { computeTracking } from './tracking.js';

const PAID = new Date('2026-11-27T12:00:00.000Z');
const after = (ms: number) => new Date(PAID.getTime() + ms);
const states = (tracking: ReturnType<typeof computeTracking>) => tracking.steps.map((step) => step.state);

describe('computeTracking', () => {
  it('recién pagado: Pagado en curso y el resto por venir', () => {
    const tracking = computeTracking(PAID, PAID);
    expect(trackingSchema.parse(tracking)).toEqual(tracking);
    expect(tracking.current).toBe('paid');
    expect(states(tracking)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(tracking.nextAt).toBe('2026-11-27T12:05:00.000Z');
    expect(tracking.computedAt).toBe(PAID.toISOString());
  });

  it('avanza un paso cada 5 minutos exactos', () => {
    expect(computeTracking(PAID, after(TRACKING_STEP_MS - 1)).current).toBe('paid');
    expect(computeTracking(PAID, after(TRACKING_STEP_MS)).current).toBe('preparing');
    expect(computeTracking(PAID, after(2 * TRACKING_STEP_MS)).current).toBe('shipped');
    const inTransit = computeTracking(PAID, after(3 * TRACKING_STEP_MS + 1000));
    expect(inTransit.current).toBe('in_transit');
    expect(states(inTransit)).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
    expect(inTransit.nextAt).toBe('2026-11-27T12:20:00.000Z');
  });

  it('marca la hora de cada paso alcanzado y la estimada de los que faltan', () => {
    const tracking = computeTracking(PAID, after(TRACKING_STEP_MS + 30_000));
    expect(tracking.steps.map((step) => step.at)).toEqual([
      '2026-11-27T12:00:00.000Z',
      '2026-11-27T12:05:00.000Z',
      '2026-11-27T12:10:00.000Z',
      '2026-11-27T12:15:00.000Z',
      '2026-11-27T12:20:00.000Z',
    ]);
  });

  it('a los 20 minutos queda Entregado, todo hecho y sin siguiente paso', () => {
    for (const ms of [4 * TRACKING_STEP_MS, 365 * 24 * 60 * 60 * 1000]) {
      const tracking = computeTracking(PAID, after(ms));
      expect(tracking.current).toBe('delivered');
      expect(states(tracking)).toEqual(['done', 'done', 'done', 'done', 'done']);
      expect(tracking.nextAt).toBeNull();
    }
  });

  it('un reloj atrasado (antes del pago) se queda en Pagado', () => {
    const tracking = computeTracking(PAID, after(-60_000));
    expect(tracking.current).toBe('paid');
    expect(tracking.nextAt).toBe('2026-11-27T12:05:00.000Z');
  });

  it('admite otro intervalo entre pasos', () => {
    expect(computeTracking(PAID, after(2500), 1000).current).toBe('shipped');
  });
});
