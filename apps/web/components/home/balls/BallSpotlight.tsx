'use client';

import { accentProps } from '@/lib/accent';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { type KeyboardEvent, type PointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { ScrollTrigger } from '@/lib/motion/gsap';
import { useMotionStore } from '@/lib/motion/store';
import { useStageActivity } from '@/lib/three/director';
import { useInView } from '@/lib/in-view';
import type { Ball } from './ball-data';
import type { BallControls } from './BallScene';
import styles from './HomeBalls.module.css';

// El lienzo solo existe en el cliente y se descarga aparte.
const BallScene = dynamic(() => import('./BallScene'), { ssr: false });

const STEP = Math.PI / 12; // 15° por tecla
const POSTER_AFTER = 4; // s de carga a la vista antes de mostrar el póster de respaldo

// Visor 3D del balón elegido: póster mientras carga, giro con arrastre o
// flechas y solo las esquinas HUD del prototipo (sin textos). El lienzo se
// crea la primera vez que el visor es el escenario activo (director de
// render) y deja de dibujar fuera de pantalla o si otro escenario se ve más.
export function BallSpotlight({ ball, spotRef, controlsRef }: { ball: Ball; spotRef: RefObject<HTMLDivElement | null>; controlsRef: RefObject<BallControls> }) {
  const t = useTranslations('HomeBalls.spot');
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const active = useStageActivity(frame);
  const [mounted, setMounted] = useState(false);
  if (active && !mounted) setMounted(true);
  const lite = useMotionStore((state) => state.lite);
  const reducedMotion = useMotionStore((state) => state.reducedMotion);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => {
    setReady(true);
    // El modelo ya está: las medidas de ScrollTrigger se recalculan.
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }, []);

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      spotRef.current = node;
      setFrame(node);
    },
    [spotRef],
  );

  const posterRef = useRef<HTMLDivElement>(null);
  // Camino normal: escenario vacío mientras carga. El póster es un respaldo
  // que aparece solo si el balón tarda más de POSTER_AFTER segundos a la vista.
  const live = useInView(frame);
  const handoff = useRef({ poster: false, decided: false });
  const decidePoster = useCallback(() => {
    handoff.current.decided = true;
    return handoff.current.poster;
  }, []);
  const [posterShown, setPosterShown] = useState(false);
  useEffect(() => {
    if (!live || handoff.current.decided) return;
    const timer = window.setTimeout(() => {
      if (handoff.current.decided) return;
      handoff.current.poster = true;
      setPosterShown(true);
    }, POSTER_AFTER * 1000);
    return () => window.clearTimeout(timer);
  }, [live]);
  const dragStart = useRef<{ x: number; yaw: number } | null>(null);
  // Grados para lectores de pantalla: se actualizan al terminar el gesto.
  const [turn, setTurn] = useState(0);
  const syncTurn = () => setTurn(((Math.round((controlsRef.current.dragYaw * 180) / Math.PI) % 360) + 360) % 360);
  const nudge = () => controlsRef.current.invalidate?.();

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, yaw: controlsRef.current.dragYaw };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    controlsRef.current.dragYaw = dragStart.current.yaw + (event.clientX - dragStart.current.x) * 0.012;
    nudge();
  };
  const onPointerUp = () => {
    if (!dragStart.current) return;
    dragStart.current = null;
    syncTurn();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowRight' ? STEP : event.key === 'ArrowLeft' ? -STEP : null;
    if (event.key === 'Home') controlsRef.current.dragYaw = 0;
    else if (delta === null) return;
    else controlsRef.current.dragYaw += delta;
    event.preventDefault();
    nudge();
    syncTurn();
  };

  const url = lite ? ball.model.liteUrl : ball.model.heroUrl;

  return (
    <div ref={setRefs} className={styles.spot} data-spot="" data-ready={ready || undefined} data-poster={posterShown || undefined} {...accentProps(ball.accent)}>
      <div className={styles.halo} aria-hidden="true" />
      <div ref={posterRef} className={styles.spotPoster} aria-hidden="true">
        <ThemedPoster key={ball.slug} poster={ball.model.poster} alt="" />
      </div>
      <div className={styles.canvas}>{mounted && <BallScene url={url} active={active} lite={lite} reducedMotion={reducedMotion} controlsRef={controlsRef} onReady={onReady} posterRef={posterRef} decidePoster={decidePoster} />}</div>

      <div className={styles.spotHud} aria-hidden="true">
        <span className={`${styles.corner} ${styles.cornerTl}`} />
        <span className={`${styles.corner} ${styles.cornerTr}`} />
        <span className={`${styles.corner} ${styles.cornerBl}`} />
        <span className={`${styles.corner} ${styles.cornerBr}`} />
        <span className={styles.marks} />
      </div>

      <div
        className={styles.grip}
        role="slider"
        tabIndex={0}
        aria-label={t('sliderLabel', { name: ball.name })}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={turn}
        aria-valuetext={t('turnValue', { degrees: turn })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
