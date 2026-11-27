'use client';

import type { Locale } from '@airspace/contracts';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSessionStore } from '@/lib/auth/session-store';
import { useFirstInteraction } from './first-interaction';
import { loadStylistContext } from './stylist-context';
import { openStylist, useStylistStore } from './stylist-store';

// Estilista flotante, en todas las páginas: el robot abajo a la derecha y el
// panel del chat que se despliega en la misma página (sin navegar ni mover
// el scroll). Este componente es lo único que entra en el JS inicial: el
// robot (con Motion) se carga en reposo, después de la página, y el panel la
// primera vez que se abre o cuando alguien se acerca al robot (precarga).
const loadRobot = () => import('./Robot');
const loadPanel = () => import('./StylistPanel');
const Robot = dynamic(() => loadRobot().then((module) => module.Robot), { ssr: false });
const StylistPanel = dynamic(() => loadPanel().then((module) => module.StylistPanel), { ssr: false });

export function StylistBot() {
  const t = useTranslations('StylistBot');
  const locale = useLocale() as Locale;
  const open = useStylistStore((state) => state.open);
  const thinking = useStylistStore((state) => state.busy);
  const [robotReady, setRobotReady] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  // Los globos automáticos esperan a que la persona haga algo en la página.
  const interacted = useFirstInteraction();
  // Una vez abierto queda montado, para que la salida se anime.
  if (open && !panelMounted) setPanelMounted(true);

  // El robot llega cuando el navegador está libre (como mucho 1,2 s después
  // de montar): no compite con el primer pintado, pero tampoco se hace
  // esperar en teléfonos, donde el navegador casi nunca queda libre.
  useEffect(() => {
    const show = () => void loadRobot().then(() => setRobotReady(true));
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(show, { timeout: 1200 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(show, 400);
    return () => clearTimeout(id);
  }, []);

  // Globo de pedidos: solo si la persona tiene al menos un pedido pagado. Se
  // pregunta una vez, cuando el robot ya llegó y solo con sesión (la sesión
  // la pide el encabezado, lib/auth/session-store.ts): sin sesión no hay
  // pedidos y no se gasta una llamada al servidor.
  const signedIn = useSessionStore((state) => state.user !== null);
  const [hasOrders, setHasOrders] = useState(false);
  useEffect(() => {
    if (!robotReady || !signedIn) return;
    let alive = true;
    fetch('/api/stylist/orders-hint', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { hasOrders: false }))
      .then((body: { hasOrders?: boolean }) => {
        if (alive) setHasOrders(body.hasOrders === true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [robotReady, signedIn]);
  const bubbles = useMemo(() => {
    const base = t.raw('bubbles') as string[];
    return hasOrders && signedIn ? [t('orderBubble'), ...base] : base;
  }, [t, hasOrders, signedIn]);

  // Precarga al acercarse: el código del panel y sus datos.
  const prefetch = useCallback(() => {
    void loadPanel();
    loadStylistContext(locale).catch(() => undefined);
  }, [locale]);

  return (
    <>
      {robotReady ? (
        <Robot
          open={open}
          thinking={thinking}
          onOpen={openStylist}
          onIntent={prefetch}
          label={t('button')}
          bubbles={bubbles}
          interacted={interacted}
          plate={t('plate')}
          closeLabel={t('closeBubble')}
        />
      ) : null}
      {panelMounted ? <StylistPanel /> : null}
    </>
  );
}
