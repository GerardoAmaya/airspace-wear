import { type Tracking, TRACKING_STEP_MS, type TrackingStep, TRACKING_STEPS } from '@airspace/contracts';

// Seguimiento simulado del envío (docs/plan-paso-5.md, decisión 4): no hay
// transportista ni proceso aparte. El avance sale solo del tiempo desde el
// pago: Pagado al pagar y un paso más cada stepMs (5 minutos) hasta
// Entregado. Función pura: misma entrada, misma salida (fácil de probar).
//
// - done: paso alcanzado; at es la hora en que se alcanzó.
// - current: paso en curso; at es la hora en que se alcanzó.
// - upcoming: paso por venir; at es la hora estimada.
// Al llegar a Entregado todos quedan en done y nextAt es null.
export function computeTracking(paidAt: Date, now: Date, stepMs: number = TRACKING_STEP_MS): Tracking {
  const last = TRACKING_STEPS.length - 1;
  // Un reloj atrasado (now antes del pago) se queda en el primer paso.
  const elapsed = Math.max(0, now.getTime() - paidAt.getTime());
  const reached = Math.min(last, Math.floor(elapsed / stepMs));
  const delivered = reached === last;
  const at = (index: number) => new Date(paidAt.getTime() + index * stepMs).toISOString();
  const steps = TRACKING_STEPS.map(
    (key, index): TrackingStep => ({
      key,
      state: index < reached || delivered ? 'done' : index === reached ? 'current' : 'upcoming',
      at: at(index),
    }),
  );
  return {
    steps,
    current: TRACKING_STEPS[reached]!,
    nextAt: delivered ? null : at(reached + 1),
    computedAt: now.toISOString(),
  };
}
