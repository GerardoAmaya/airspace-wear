'use client';

import type { Category, Hotspot, Model3D } from '@airspace/contracts';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState, ViewTransition } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { accentProps, type ProductAccent } from '@/lib/accent';
import { useMotionStore } from '@/lib/motion/store';
import { useStageActivity } from '@/lib/three/director';
import { useInView } from '@/lib/in-view';
import type { SceneControls } from './ProductScene';
import styles from './ProductViewer.module.css';
import { useTour } from './tour-store';

// El canvas solo existe en el cliente y se descarga aparte.
const ProductScene = dynamic(() => import('./ProductScene'), { ssr: false });

const STEP = Math.PI / 12; // 15° por tecla
// Inclinación vertical (radianes, eje horizontal de la pantalla): negativa
// acerca la suela a la cámara (hasta unos 85°), positiva muestra un poco el
// empeine (unos 20°). Se queda donde la deja el usuario.
// Grados a radianes y tope, sin importar three aquí: este componente se
// renderiza en el servidor y entra en el JS inicial (y en el prefetch) de la
// ficha; three llega solo con ProductScene, que se carga aparte.
const degToRad = (degrees: number) => (degrees * Math.PI) / 180;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const TILT_SOLE = -degToRad(85);
const TILT_TOP = degToRad(20);
const DRAG_SPEED = 0.012; // radianes por píxel de arrastre
const POSTER_AFTER = 4; // s de carga antes de mostrar el póster de respaldo

// Visor 3D de la ficha: póster mientras carga, giro con arrastre o flechas,
// y etiquetas sobre el zapato para el detalle activo.
export function ProductViewer({
  model,
  category,
  hotspots,
  name,
  slug,
  accent,
}: {
  model: Model3D;
  category: Category;
  hotspots: Hotspot[];
  name: string;
  slug: string;
  accent: ProductAccent;
}) {
  const t = useTranslations('Product.viewer');
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const active = useStageActivity(frame);
  const [mounted, setMounted] = useState(false);
  if (active && !mounted) setMounted(true);
  const lite = useMotionStore((state) => state.lite);
  const reducedMotion = useMotionStore((state) => state.reducedMotion);
  const activeKey = useTour((state) => state.active);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const posterRef = useRef<HTMLDivElement>(null);
  // Camino normal: escenario vacío mientras carga. El póster es un respaldo
  // que aparece solo si el modelo tarda más de POSTER_AFTER segundos.
  const handoff = useRef({ poster: false, decided: false });
  const decidePoster = useCallback(() => {
    handoff.current.decided = true;
    return handoff.current.poster;
  }, []);
  const [posterShown, setPosterShown] = useState(false);
  useEffect(() => {
    if (!model.poster) return;
    const timer = window.setTimeout(() => {
      if (handoff.current.decided) return;
      handoff.current.poster = true;
      setPosterShown(true);
    }, POSTER_AFTER * 1000);
    return () => window.clearTimeout(timer);
  }, [model.poster]);
  // El póster flota mientras espera al 3D, solo con el visor a la vista.
  const live = useInView(frame);

  const controls = useRef<SceneControls>({ dragYaw: 0, tilt: 0, lastInteraction: 0 });
  const markers = useRef(new Map<string, HTMLElement>());
  const dragStart = useRef<{ x: number; y: number; yaw: number; tilt: number } | null>(null);
  // Grados mostrados a lectores de pantalla: se actualizan al terminar el gesto.
  const [turn, setTurn] = useState(0);
  const [tilt, setTilt] = useState(0);
  const syncTurn = () => {
    setTurn(((Math.round((controls.current.dragYaw * 180) / Math.PI) % 360) + 360) % 360);
    // Positivo hacia la suela, que es lo que el usuario busca al inclinar.
    setTilt(Math.round((-controls.current.tilt * 180) / Math.PI));
  };
  const setTiltValue = (value: number) => {
    controls.current.tilt = clamp(value, TILT_SOLE, TILT_TOP);
  };
  // Al elegir un detalle la escena vuelve giro e inclinación a cero: el valor
  // para lectores de pantalla también (ajuste durante el render, sin efecto).
  const [shownKey, setShownKey] = useState(activeKey);
  if (shownKey !== activeKey) {
    setShownKey(activeKey);
    if (activeKey) {
      setTurn(0);
      setTilt(0);
    }
  }

  // Arrastre libre en los dos ejes: horizontal gira, vertical inclina (hacia
  // arriba trae la suela). touch-action: none en el área de arrastre hace que
  // un deslizamiento vertical sobre el visor no desplace la página.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { x: event.clientX, y: event.clientY, yaw: controls.current.dragYaw, tilt: controls.current.tilt };
    controls.current.lastInteraction = performance.now();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    controls.current.dragYaw = start.yaw + (event.clientX - start.x) * DRAG_SPEED;
    setTiltValue(start.tilt + (event.clientY - start.y) * DRAG_SPEED);
    controls.current.lastInteraction = performance.now();
  };
  const onPointerUp = () => {
    dragStart.current = null;
    syncTurn();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowRight' ? STEP : event.key === 'ArrowLeft' ? -STEP : null;
    const tiltDelta = event.key === 'ArrowUp' ? -STEP : event.key === 'ArrowDown' ? STEP : null;
    if (event.key === 'Home') controls.current.dragYaw = controls.current.tilt = 0;
    else if (tiltDelta !== null) setTiltValue(controls.current.tilt + tiltDelta);
    else if (delta === null) return;
    else controls.current.dragYaw += delta;
    event.preventDefault();
    controls.current.lastInteraction = performance.now();
    syncTurn();
  };

  return (
    // Destino de la transición desde la tarjeta del catálogo (misma name).
    <ViewTransition name={`product-media-${slug}`} share="morph" default="none">
    <div ref={setFrame} className={styles.viewer} data-ready={ready || undefined} data-poster={posterShown || undefined} data-live={live || undefined} {...accentProps(accent)}>
      <div className={styles.halo} aria-hidden="true" />
      {model.poster && (
        <div ref={posterRef} className={styles.poster} aria-hidden={ready || undefined}>
          <ThemedPoster poster={model.poster} alt={t('posterAlt', { name })} eager />
        </div>
      )}
      <div className={styles.canvas}>
        {mounted && (
          <ProductScene
            model={model}
            category={category}
            lite={lite}
            active={active}
            reducedMotion={reducedMotion}
            hotspots={hotspots}
            activeKey={activeKey}
            controls={controls}
            markers={markers}
            onReady={onReady}
            posterRef={posterRef}
            decidePoster={decidePoster}
          />
        )}
      </div>

      {/* Marcadores: los mueve la escena en cada cuadro. Son decorativos; la
          lista de detalles (ProductTour) da la misma información accesible. */}
      <div className={styles.markers} aria-hidden="true">
        {ready &&
          hotspots.map((hotspot) => (
            <span
              key={hotspot.key}
              ref={(element) => {
                if (element) markers.current.set(hotspot.key, element);
                else markers.current.delete(hotspot.key);
              }}
              className={styles.marker}
              data-active={hotspot.key === activeKey || undefined}
              data-side={hotspot.view.slot.side}
            >
              <span className={styles.dot} />
              <span className={styles.label}>
                <strong>{hotspot.title}</strong>
                <span>{hotspot.text}</span>
              </span>
            </span>
          ))}
      </div>

      <div
        className={styles.grip}
        role="slider"
        tabIndex={0}
        aria-label={t('sliderLabel', { name })}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={turn}
        aria-valuetext={t('turnValue', { degrees: turn, tilt })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
      <p className={styles.hint} aria-hidden="true">
        {ready ? t('dragHint') : t('loading')}
      </p>
    </div>
    </ViewTransition>
  );
}
