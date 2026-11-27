'use client';

import { useFormatter } from 'next-intl';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

// Fecha u hora en la zona horaria del visitante. El servidor no la conoce:
// en el HTML sale en UTC y, al hidratar, React vuelve a pintar con la zona
// del navegador (sin aviso de hidratación: useSyncExternalStore usa el valor
// del servidor en la primera pasada).
export function LocalTime({ iso, format }: { iso: string; format: 'date' | 'time' | 'dateTime' }) {
  const formatter = useFormatter();
  const timeZone = useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => 'UTC',
  );
  const date = new Date(iso);
  const options =
    format === 'date'
      ? ({ day: 'numeric', month: 'short', year: 'numeric' } as const)
      : format === 'time'
        ? ({ hour: '2-digit', minute: '2-digit' } as const)
        : ({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } as const);
  return <time dateTime={iso}>{formatter.dateTime(date, { ...options, timeZone })}</time>;
}
