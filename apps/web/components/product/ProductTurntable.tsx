'use client';

import type { Hotspot, Model3D } from '@airspace/contracts';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState, ViewTransition } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { AUTO_SPEED, createSpin, keySpin, type Pose, ringSize, ringTransform, turnOf, turnTo, useSpinDrag } from '@/components/three/turntable/rig';
import { paintRings, TurntableRings } from '@/components/three/turntable/TurntableRings';
import { accentProps, type ProductAccent } from '@/lib/accent';
import { gsap } from '@/lib/motion/gsap';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { useStageActivity } from '@/lib/three/director';
import type { TurntableGeometry, TurntableView } from './ProductTurntableScene';
import styles from './ProductTurntable.module.css';
import { useTour } from './tour-store';
import { ELEVATION, faceAngle, productPose, SOLE_ELEVATION } from './turntable-geometry';

// El canvas solo existe en el cliente y se descarga aparte.
const ProductTurntableScene = dynamic(() => import('./ProductTurntableScene'), { ssr: false });

// Póster de respaldo (segundos sin modelo) e impulso inicial del giro.
const POSTER_AFTER = 4;
const ENTER_BOOST = 9;
// Segundos sin interacción tras mostrar un detalle antes de retomar el giro.
const HOTSPOT_HOLD = 6;

// Visor 3D de la ficha con la plataforma giratoria del Hangar 360°: el
// producto gira solo (en pausa fuera de pantalla, con la pestaña oculta y
// siempre quieto con movimiento reducido), se arrastra en horizontal con
// inercia y se gira con las flechas. Elegir un detalle en la lista gira la
// plataforma hasta dejarlo a tres cuartos de la cámara.
export function ProductTurntable({ model, hotspots, name, slug, accent }: { model: Model3D; hotspots: Hotspot[]; name: string; slug: string; accent: ProductAccent }) {
  const t = useTranslations('Product.viewer');
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const active = useStageActivity(stage);
  const [mounted, setMounted] = useState(false);
  if (active && !mounted) setMounted(true);
  const lite = useMotionStore((state) => state.lite);
  const reducedMotion = useMotionStore((state) => state.reducedMotion);
  const activeKey = useTour((state) => state.active);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const [geometry, setGeometry] = useState<TurntableGeometry | null>(null);

  // Giro y cámara: refs que escriben la escena, el arrastre y GSAP.
  const spin = useRef(createSpin());
  const view = useRef<TurntableView>({ elevation: ELEVATION });
  const markers = useRef(new Map<string, HTMLElement>());

  // Póster de respaldo: solo si el modelo tarda más de POSTER_AFTER segundos
  // desde que se pidió (lienzo montado). El camino normal no lo muestra.
  const [posterShown, setPosterShown] = useState(false);
  useEffect(() => {
    if (!mounted || ready || !model.poster) return;
    const timer = window.setTimeout(() => setPosterShown(true), POSTER_AFTER * 1000);
    return () => window.clearTimeout(timer);
  }, [mounted, ready, model.poster]);

  // Listo = dos cuadros del modelo ya dibujados. El producto aparece ya
  // girando: la plataforma arranca con un impulso que se frena hasta el giro
  // de crucero (stepSpin), nunca desde cero. Con movimiento reducido no gira.
  const boosted = useRef(false);
  useEffect(() => {
    if (!ready || boosted.current) return;
    boosted.current = true;
    const state = spin.current;
    if (!reducedMotion && !state.dragging && !state.tween?.isActive()) state.velocity = AUTO_SPEED * ENTER_BOOST;
  }, [ready, reducedMotion, spin]);

  useSpinDrag(stage, spin, reducedMotion);

  const ringBox = useRef<HTMLDivElement>(null);
  const ticks = useRef<SVGGElement>(null);
  const arcLower = useRef<SVGPathElement>(null);
  const arcUpper = useRef<SVGPathElement>(null);
  const shownTicks = useRef({ ticks: '' });
  const rot = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const baseK = useRef(1);
  const shownDegrees = useRef(-1);

  // Lectura de giro: anillos, ROT, barra y valor del control deslizante.
  // Solo escribe en el DOM cuando cambia (nunca estado de React por cuadro).
  const showRotation = useCallback(
    (angle: number) => {
      paintRings({ ticks, arcLower, arcUpper, shown: shownTicks }, angle);
      const { turn, degrees } = turnOf(angle);
      if (bar.current) bar.current.style.transform = `scaleX(${turn.toFixed(4)})`;
      if (degrees === shownDegrees.current) return;
      shownDegrees.current = degrees;
      if (rot.current) rot.current.textContent = t('rotation', { degrees: String(degrees).padStart(3, '0') });
      stage?.setAttribute('aria-valuenow', String(degrees));
      stage?.setAttribute('aria-valuetext', t('turntableValue', { degrees }));
    },
    [stage, t],
  );
  useEffect(() => showRotation(spin.current.angle), [showRotation, spin]);

  // Anillos en la pose de reposo; se rehacen con el tamaño del visor.
  useLayoutEffect(() => {
    if (!stage) return;
    const layout = () => {
      const size = { width: stage.clientWidth, height: stage.clientHeight };
      if (!size.width || !size.height || !ringBox.current) return;
      const pose = productPose(size.width, size.height, view.current.elevation);
      baseK.current = pose.k;
      const ring = ringSize(pose.k);
      Object.assign(ringBox.current.style, { width: `${ring}px`, height: `${ring}px`, left: `${-ring / 2}px`, top: `${-ring / 2}px` });
      ringBox.current.style.transform = ringTransform(pose, size, pose.k);
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);

  // Cada cuadro de la plataforma: anillos con la cámara y lectura de giro.
  const onFrame = useCallback(
    (pose: Pose, size: { width: number; height: number }, angle: number) => {
      if (ringBox.current) ringBox.current.style.transform = ringTransform(pose, size, baseK.current);
      showRotation(angle);
    },
    [showRotation],
  );

  // Sin canvas dibujando (visor fuera de pantalla), la lectura sigue al tween.
  const follow = useCallback(() => showRotation(spin.current.angle), [showRotation, spin]);

  // Detalle elegido en la lista: la plataforma gira (GSAP, por tiempo) hasta
  // dejarlo a tres cuartos de la cámara y el giro automático espera unos
  // segundos. Un detalle de la planta baja además la cámara casi al piso
  // (se ve el canto de la suela, sin inclinar el zapato). La vista general
  // vuelve a la elevación normal y retoma el giro de inmediato.
  const previousKey = useRef<string | null>(null);
  useEffect(() => {
    if (!geometry) return;
    const previous = previousKey.current;
    previousKey.current = activeKey;
    if (previous === activeKey) return;
    const frame = geometry.frames.find((item) => item.key === activeKey);
    const state = spin.current;
    const duration = reducedMotion ? 0 : DURATION.cinematic * 0.75;
    gsap.to(view.current, { elevation: frame?.sole ? SOLE_ELEVATION : ELEVATION, duration, ease: EASE.inOut.gsap, overwrite: true });
    if (frame) turnTo(state, faceAngle(frame, geometry.baseYaw, state.angle), { duration, hold: HOTSPOT_HOLD, onUpdate: follow });
    else state.resumeAt = 0;
  }, [activeKey, geometry, reducedMotion, spin, follow]);
  useEffect(() => {
    const state = spin.current;
    const camera = view.current;
    return () => {
      state.tween?.kill();
      gsap.killTweensOf(camera);
    };
  }, [spin]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!keySpin(spin.current, event.key, reducedMotion)) return;
    event.preventDefault();
    spin.current.tween?.eventCallback('onUpdate', follow);
  };

  return (
    // Destino de la transición desde la tarjeta del catálogo (misma name).
    <ViewTransition name={`product-media-${slug}`} share="morph" default="none">
      <div className={styles.viewer} {...accentProps(accent)}>
        <div
          ref={setStage}
          className={styles.stage}
          tabIndex={0}
          role="slider"
          aria-label={t('sliderLabel', { name })}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={0}
          aria-valuetext={t('turntableValue', { degrees: 0 })}
          data-ready={ready || undefined}
          data-poster={posterShown || undefined}
          onKeyDown={onKeyDown}
        >
          <span className={styles.halo} aria-hidden="true" />
          <div ref={ringBox} className={styles.rings} aria-hidden="true">
            <TurntableRings ticks={ticks} arcLower={arcLower} arcUpper={arcUpper} />
          </div>
          {model.poster && (
            <div className={styles.poster} aria-hidden="true">
              <ThemedPoster poster={model.poster} alt={t('posterAlt', { name })} eager />
            </div>
          )}
          <div className={styles.canvas}>
            {mounted && (
              <ProductTurntableScene
                model={model}
                lite={lite}
                active={active}
                reducedMotion={reducedMotion}
                spin={spin}
                view={view}
                hotspots={hotspots}
                activeKey={activeKey}
                markers={markers}
                onReady={onReady}
                onGeometry={setGeometry}
                onFrame={onFrame}
              />
            )}
          </div>

          {/* Marcadores: los mueve la escena en cada cuadro y solo se ven con
              el detalle de cara a la cámara. Son decorativos; la lista de
              detalles (ProductTour) da la misma información accesible. */}
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
                  data-hotspot={hotspot.key}
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
        </div>

        <span className={`${styles.hudLabel} ${styles.hudTop}`} aria-hidden="true">
          {ready ? t('platform') : t('loading')}
        </span>
        <div className={styles.hudBottom} aria-hidden="true">
          <span ref={rot} className={styles.rot}>
            {t('rotation', { degrees: '000' })}
          </span>
          <span className={styles.progress}>
            <span ref={bar} />
          </span>
          <span className={`${styles.hudLabel} ${styles.hint}`}>
            <span className={styles.hintMouse}>{t('dragHint')}</span>
            <span className={styles.hintTouch}>{t('touchHint')}</span>
          </span>
        </div>
      </div>
    </ViewTransition>
  );
}
