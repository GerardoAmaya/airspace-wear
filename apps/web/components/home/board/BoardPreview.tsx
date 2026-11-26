'use client';

import { accentProps } from '@/lib/accent';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { useStageActivity } from '@/lib/three/director';
import { useInView } from '@/lib/in-view';
import styles from './Board.module.css';
import type { SceneStatus } from './BoardScene';
import { type Spin, useSpinDrag } from './rig';
import type { BoardProduct } from './types';
import ui from './ui.module.css';

// El canvas solo existe en el cliente y se descarga aparte.
const BoardScene = dynamic(() => import('./BoardScene'), { ssr: false });

const POSTER_AFTER = 4; // s de carga a la vista antes de mostrar el póster de respaldo

// Vista 3D del tablero: póster del tema hasta que llega el modelo, giro con
// arrastre (la selección no cambia aquí) y rótulos HUD en las esquinas.
export function BoardPreview({ product, spin, lite, reducedMotion }: { product: BoardProduct; spin: RefObject<Spin>; lite: boolean; reducedMotion: boolean }) {
  const t = useTranslations('HomeBoard');
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const active = useStageActivity(frame);
  const [mounted, setMounted] = useState(false);
  if (active && !mounted) setMounted(true);
  const [ready, setReady] = useState(false);
  const [sceneStatus, setSceneStatus] = useState<SceneStatus>('loading');
  const onReady = useCallback(() => setReady(true), []);
  const posterRef = useRef<HTMLDivElement>(null);
  // Camino normal: escenario vacío mientras carga. El póster es un respaldo
  // que aparece solo si el modelo tarda más de POSTER_AFTER segundos desde
  // que la vista previa se ve; flota mientras espera, solo a la vista.
  const live = useInView(frame);
  const handoff = useRef({ poster: false, decided: false });
  const decidePoster = useCallback(() => {
    handoff.current.decided = true;
    return handoff.current.poster;
  }, []);
  const [posterShown, setPosterShown] = useState(false);
  const hasPoster = !!product.model?.poster;
  useEffect(() => {
    if (!live || !hasPoster || handoff.current.decided) return;
    const timer = window.setTimeout(() => {
      if (handoff.current.decided) return;
      handoff.current.poster = true;
      setPosterShown(true);
    }, POSTER_AFTER * 1000);
    return () => window.clearTimeout(timer);
  }, [live, hasPoster]);
  useSpinDrag(frame, spin, reducedMotion);

  // Anuncios de carga: solo al empezar y al terminar una carga pedida por el
  // usuario (no la primera); el rótulo visible es aria-hidden.
  const [loadingNote, setLoadingNote] = useState('');
  const announced = useRef(false);
  const onStatus = useCallback(
    (next: SceneStatus) => {
      setSceneStatus(next);
      if (!ready) return;
      if (next === 'loading' && !announced.current) {
        announced.current = true;
        setLoadingNote(t('details.loadingModel', { name: product.name }));
      } else if (next !== 'loading' && announced.current) {
        announced.current = false;
        setLoadingNote(next === 'error' ? t('details.modelError') : t('details.modelReady', { name: product.name }));
      }
    },
    [ready, t, product.name],
  );
  const model = product.model;
  const request = model ? { url: lite ? model.liteUrl : model.heroUrl, foot: model.foot } : null;
  const status = model ? sceneStatus : 'error';
  // "Cargando" hasta que el modelo se ve de verdad (no solo descargado).
  const label = status === 'error' ? t('preview.error') : status === 'loading' || !ready ? t('preview.loading') : null;

  return (
      <div ref={setFrame} className={`${styles.slot} ${ui.hudFrame}`} {...accentProps(product.accent)} data-slot-enter="" data-loading={(ready && status === 'loading') || undefined} data-ready={ready || undefined} data-poster={posterShown || undefined} data-live={live || undefined}>
        <span className={`${styles.slotGrid} ${ui.hudGrid}`} aria-hidden="true" />
        <span className={styles.slotMarks} aria-hidden="true" />
        <span className={`${ui.halo} ${styles.halo}`} aria-hidden="true" />
        {model?.poster && (
          <div ref={posterRef} className={styles.poster} aria-hidden={ready || undefined}>
            <ThemedPoster poster={model.poster} alt={t('preview.posterAlt', { name: product.name })} />
          </div>
        )}
        <div className={styles.canvas}>
          {mounted && request && (
            <BoardScene host="board" active={active} request={request} lite={lite} reducedMotion={reducedMotion} spin={spin} onStatus={onStatus} onReady={onReady} posterRef={posterRef} decidePoster={decidePoster} />
          )}
        </div>
        <span className={styles.loader} aria-hidden="true" />
        <span className={`${ui.hudLabel} ${styles.slotLabel} ${styles.tl}`} aria-hidden="true">
          {t('preview.label')}
        </span>
        <span className={`${ui.hudLabel} ${styles.slotLabel} ${styles.tr}`} aria-hidden="true">
          {t('preview.reference', { reference: product.reference })}
        </span>
        <span className={`${ui.hudLabel} ${styles.slotLabel} ${styles.bl} ${label ? '' : ui.hudPrimary} ${status === 'error' ? ui.hudAlert : ''}`} aria-hidden="true">
          {label ?? (
            <>
              <span className={styles.hintMouse}>{t('preview.dragHint')}</span>
              <span className={styles.hintTouch}>{t('preview.touchHint')}</span>
            </>
          )}
        </span>
        <span className={`${ui.hudLabel} ${styles.slotLabel} ${styles.br}`} aria-hidden="true">
          {product.sizeRange ? `${product.sizeRange.system} ${product.sizeRange.min}-${product.sizeRange.max}` : ''}
        </span>
        <span className={ui.hudCorners} aria-hidden="true" />
        <p className="visually-hidden" role="status">
          {loadingNote}
        </p>
      </div>
  );
}
