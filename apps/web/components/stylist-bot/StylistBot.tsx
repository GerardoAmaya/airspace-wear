'use client';

import type { Locale } from '@airspace/contracts';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
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
  // Una vez abierto queda montado, para que la salida se anime.
  if (open && !panelMounted) setPanelMounted(true);

  // El robot llega cuando el navegador está libre: no compite con el primer
  // pintado ni con la entrada de la página.
  useEffect(() => {
    const show = () => void loadRobot().then(() => setRobotReady(true));
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(show, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(show, 1500);
    return () => clearTimeout(id);
  }, []);

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
          bubbles={t.raw('bubbles') as string[]}
          plate={t('plate')}
          closeLabel={t('closeBubble')}
        />
      ) : null}
      {panelMounted ? <StylistPanel /> : null}
    </>
  );
}
