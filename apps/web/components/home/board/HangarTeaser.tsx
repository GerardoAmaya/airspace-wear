'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { type KeyboardEvent, type RefObject, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { HOME_ANCHORS } from '@/lib/home';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { SplitText } from '@/lib/motion/split-text';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { useStageActivity } from '@/lib/three/director';
import type { SceneStatus } from './BoardScene';
import styles from './Hangar.module.css';
import { AUTO_SPEED, hangarLayout, keySpin, type Pose, ringTransform, type Spin, turnOf, useSpinDrag } from './rig';
import { scramble } from './scramble';
import type { BoardProduct } from './types';
import ui from './ui.module.css';

const BoardScene = dynamic(() => import('./BoardScene'), { ssr: false });

// Anillos de la plataforma, en milímetros del mundo (viewBox de 600 x 600 mm).
// "000" queda al frente (hacia la cámara).
const TICKS = Array.from({ length: 72 }, (_, index) => {
  const degree = index * 5;
  const major = degree % 30 === 0;
  const angle = ((degree + 90) * Math.PI) / 180;
  const inner = major ? 214 : 222;
  const outer = major ? 240 : 232;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    degree,
    major,
    // Redondeo a 0,1 mm: el servidor y el navegador calculan senos con
    // distinta precisión y el atributo debe coincidir al hidratar.
    line: { x1: (inner * cos).toFixed(1), y1: (inner * sin).toFixed(1), x2: (outer * cos).toFixed(1), y2: (outer * sin).toFixed(1) },
    text: major ? { x: (272 * cos).toFixed(1), y: (272 * sin).toFixed(1), value: String(degree).padStart(3, '0') } : null,
  };
});

const FEATURES = [
  { key: 'avatar', icon: 'M12 8.5v6.5M12 15l-3.4 5.5M12 15l3.4 5.5M6.5 11.5 12 10l5.5 1.5', circle: true },
  { key: 'shoes', icon: 'M4 8.5h14.5l-3.5-3.5M20 15.5H5.5L9 19', circle: false },
  { key: 'view', icon: 'M12 3.5v9.5M15.2 16.9l-2.6.3 1.7 2', ellipse: true },
] as const;

// Póster de respaldo (segundos sin modelo) e impulso inicial del giro.
const POSTER_AFTER = 4;
const ENTER_BOOST = 9;

// Impulso de entrada: la plataforma ya gira rápido en el primer cuadro visible.
function boostSpin(state: Spin) {
  if (!state.dragging) state.velocity = AUTO_SPEED * ENTER_BOOST;
}

// Media vuelta que el arco de giro rota (en el espacio propio del arco).
const HALF_ARC = 'M250 0 A250 250 0 0 1 -250 0';

// Adelanto del Hangar 360°: plataforma giratoria con el par elegido en el
// tablero. Gira sola (en pausa fuera de pantalla y nunca con movimiento
// reducido), con arrastre y con las flechas. Su canvas solo dibuja cuando el
// director de render lo elige.
export function HangarTeaser({ product, spin, lite, reducedMotion }: { product: BoardProduct; spin: RefObject<Spin>; lite: boolean; reducedMotion: boolean }) {
  const t = useTranslations('HomeBoard.hangar');
  const ids = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rootRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const active = useStageActivity(stage);
  const [mounted, setMounted] = useState(false);
  if (active && !mounted) setMounted(true);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SceneStatus>('loading');
  const [landed, setLanded] = useState(false);
  // Póster de respaldo: solo si el modelo tarda más de POSTER_AFTER segundos
  // desde que se pidió (lienzo montado). El camino normal no lo muestra.
  const [posterShown, setPosterShown] = useState(false);
  useEffect(() => {
    if (!mounted || ready) return;
    const timer = window.setTimeout(() => setPosterShown(true), POSTER_AFTER * 1000);
    return () => window.clearTimeout(timer);
  }, [mounted, ready]);
  // Listo = dos cuadros del modelo ya dibujados (BoardScene). El zapato
  // aparece ya girando: la plataforma arranca con un impulso que se frena
  // hasta el giro de crucero (curva de salida, la aplica stepSpin), nunca
  // desde cero. Con movimiento reducido no gira.
  const onReady = useCallback(() => setReady(true), []);
  const boosted = useRef(false);
  useEffect(() => {
    if (!ready || boosted.current) return;
    boosted.current = true;
    if (!reducedMotion) boostSpin(spin.current);
  }, [ready, reducedMotion, spin]);
  useSpinDrag(stage, spin, reducedMotion);

  const rings = useRef<HTMLDivElement>(null);
  const ticks = useRef<SVGGElement>(null);
  const arcLower = useRef<SVGPathElement>(null);
  const arcUpper = useRef<SVGPathElement>(null);
  const scan = useRef<HTMLDivElement>(null);
  const beam = useRef<HTMLSpanElement>(null);
  const rot = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const baseK = useRef(1);
  const shown = useRef({ degrees: -1, ticks: '' });

  // Lectura de giro: ROT, barra, arco y valor del control deslizante. Solo
  // escribe en el DOM cuando cambia (nunca estado de React por cuadro).
  const showRotation = useCallback(
    (angle: number) => {
      const { turn, degrees } = turnOf(angle);
      if (bar.current) bar.current.style.transform = `scaleX(${turn.toFixed(4)})`;
      const sweep = turn * 360;
      arcLower.current?.setAttribute('transform', `rotate(${(Math.min(sweep, 180) - 180).toFixed(2)})`);
      arcUpper.current?.setAttribute('transform', `rotate(${(Math.max(sweep, 180) - 180).toFixed(2)})`);
      const tickTransform = `rotate(${((-angle * 180) / Math.PI).toFixed(2)})`;
      if (tickTransform !== shown.current.ticks) {
        shown.current.ticks = tickTransform;
        ticks.current?.setAttribute('transform', tickTransform);
      }
      if (degrees === shown.current.degrees) return;
      shown.current.degrees = degrees;
      const padded = String(degrees).padStart(3, '0');
      if (rot.current) rot.current.textContent = t('rotation', { degrees: padded });
      stage?.setAttribute('aria-valuenow', String(degrees));
      stage?.setAttribute('aria-valuetext', t('sliderValue', { degrees }));
    },
    [stage, t],
  );

  // Anillos y escáner en la pose de reposo; se rehacen con el tamaño.
  useLayoutEffect(() => {
    if (!stage) return;
    const layout = () => {
      const size = { width: stage.clientWidth, height: stage.clientHeight };
      if (!size.width || !size.height) return;
      const { pose, ring, scan: box } = hangarLayout(size);
      baseK.current = pose.k;
      if (rings.current) {
        Object.assign(rings.current.style, { width: `${ring}px`, height: `${ring}px`, left: `${-ring / 2}px`, top: `${-ring / 2}px` });
        rings.current.style.transform = ringTransform(pose, size, pose.k);
      }
      if (scan.current) Object.assign(scan.current.style, { width: `${box.width}px`, height: `${box.height}px`, left: `${box.left}px`, top: `${box.top}px` });
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);

  // Cada cuadro de la plataforma: anillos con la cámara y lectura de giro.
  const onFrame = useCallback(
    (pose: Pose, size: { width: number; height: number }, angle: number) => {
      if (rings.current) rings.current.style.transform = ringTransform(pose, size, baseK.current);
      showRotation(angle);
    },
    [showRotation],
  );

  useEffect(() => showRotation(spin.current.angle), [showRotation, spin]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!keySpin(spin.current, event.key, reducedMotion)) return;
    event.preventDefault();
    // Sin canvas dibujando, la lectura sigue al tween de todos modos.
    spin.current.keyTween?.eventCallback('onUpdate', () => showRotation(spin.current.angle));
  };

  // Escáner en bucle: solo con el zapato posado y la plataforma dibujando.
  const scanLoop = useRef<gsap.core.Timeline | null>(null);
  useGSAP(
    () => {
      if (!beam.current || reducedMotion) return;
      scanLoop.current = gsap
        .timeline({ repeat: -1, repeatDelay: 1.1, paused: true })
        .fromTo(beam.current, { yPercent: 100, opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'none' })
        .to(beam.current, { yPercent: 0, duration: 2, ease: EASE.inOut.gsap }, 0)
        .to(beam.current, { opacity: 0, duration: 0.45, ease: 'none' }, '-=0.3');
    },
    { scope: rootRef, dependencies: [reducedMotion], revertOnUpdate: true },
  );
  useEffect(() => {
    scanLoop.current?.paused(!(active && landed && ready));
  }, [active, landed, ready]);

  // Entrada por tiempo y una sola vez: título por letras, textos y HUD; los
  // anillos aparecen un poco después. Estado inicial en CSS (opacity y transform).
  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      if (!document.documentElement.classList.contains('motion-ok')) {
        root.dataset.enter = 'done';
        return;
      }
      const title = root.querySelector<HTMLElement>('[data-h-title]')!;
      const fades = Array.from(root.querySelectorAll<HTMLElement>('[data-h-reveal]'));
      const ringArt = root.querySelector<SVGElement>('[data-ring-art]');
      const tickItems = Array.from(ticks.current?.children ?? []);
      let timeline: gsap.core.Timeline | null = null;
      let split: SplitText | null = null;
      const done = () => {
        root.dataset.enter = 'done';
        gsap.set([...fades, title, ringArt, ...tickItems].filter(Boolean), { clearProps: 'opacity,transform' });
        split?.revert();
      };
      const play = () => {
        if (root.dataset.enter !== 'idle') return;
        split = SplitText.create(title, { type: 'lines,chars', mask: 'lines' });
        timeline = gsap
          .timeline({ onComplete: done })
          .fromTo(split.chars, { yPercent: 110 }, { yPercent: 0, duration: DURATION.reveal, ease: EASE.out.gsap, stagger: 0.035 }, 0)
          .fromTo(fades, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: DURATION.reveal, ease: EASE.out.gsap, stagger: 0.07 }, 0.15)
          .fromTo(tickItems, { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.006, ease: 'none' }, 0.3);
        if (ringArt) timeline.fromTo(ringArt, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: DURATION.cinematic, ease: EASE.out.gsap }, 0.3);
        root.dataset.enter = 'run';
      };
      // El salto de ancla enfoca la sección misma: eso no cuenta como foco de contenido.
      const finish = (event: FocusEvent) => {
        if (event.target === root) return;
        if (timeline) timeline.progress(1);
        else if (root.dataset.enter === 'idle') done();
      };
      const trigger = ScrollTrigger.create({ trigger: root, start: 'top 60%', end: 'max', once: true, onEnter: play });
      root.addEventListener('focusin', finish);
      return () => {
        trigger.kill();
        root.removeEventListener('focusin', finish);
        timeline?.kill();
        split?.revert();
      };
    },
    { scope: rootRef },
  );

  // El nombre del par en la plataforma se decodifica al cambiar.
  const nameRef = useRef<HTMLSpanElement>(null);
  const firstName = useRef(true);
  useEffect(() => {
    if (firstName.current) {
      firstName.current = false;
      return;
    }
    if (nameRef.current && document.documentElement.classList.contains('motion-ok')) scramble(nameRef.current, product.name, { duration: 0.7 });
  }, [product.name]);

  const model = product.model;
  const request = model ? { url: lite ? model.liteUrl : model.heroUrl, foot: model.foot } : null;
  const loading = !ready || status === 'loading';

  return (
    <section ref={rootRef} id={HOME_ANCHORS.hangar} className={styles.hangar} aria-labelledby="hangar-title" data-enter="idle" tabIndex={-1}>
      <div className={`${styles.floor} ${ui.hudGrid}`} aria-hidden="true" />
      <div className={`${styles.layout} ${ui.container}`}>
        <div className={styles.copy}>
          <div className={styles.kicker} data-h-reveal="">
            <p className={`${ui.hudLabel} ${ui.hudPrimary}`}>{t('kicker')}</p>
            <span className={`${ui.chip} ${styles.chip}`}>
              <span className={styles.chipDot} aria-hidden="true" />
              {t('soon')}
            </span>
          </div>
          <h2 id="hangar-title" className={`${ui.display} ${styles.title}`} data-h-title="">
            {/* El espacio separa las palabras cuando el salto se oculta (móvil). */}
            {t('titleTop')}{' '}
            <br />
            {t('titleBottom')}
          </h2>
          <p className={styles.lead} data-h-reveal="">
            {t('lead')}
          </p>
          <ul className={styles.features} aria-label={t('featuresLabel')}>
            {FEATURES.map((feature, index) => (
              <li key={feature.key} className={styles.feature} data-h-reveal="">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {'circle' in feature && feature.circle && <circle cx="12" cy="5.5" r="2.5" />}
                  {'ellipse' in feature && feature.ellipse && <ellipse cx="12" cy="13" rx="9" ry="4.2" />}
                  <path d={feature.icon} />
                </svg>
                <span className={`${ui.hudLabel} ${styles.featureIndex}`} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={styles.featureTitle}>{t(`features.${feature.key}.title`)}</span>
                <span className={styles.featureText}>{t(`features.${feature.key}.text`)}</span>
              </li>
            ))}
          </ul>
          <div className={styles.actions} data-h-reveal="">
            <button className={`${ui.btn} ${ui.btnGhost} ${styles.cta}`} type="button" disabled aria-describedby={`${ids}-note`}>
              {t('cta')} <span className={styles.ctaChip}>{t('soon')}</span>
            </button>
            <p className={`${ui.hudLabel} ${styles.note}`} id={`${ids}-note`}>
              {t('ctaNote')}
            </p>
          </div>
        </div>

        <div className={styles.slot}>
          <div
            ref={setStage}
            className={styles.stage}
            tabIndex={0}
            role="slider"
            aria-label={t('sliderLabel')}
            aria-valuemin={0}
            aria-valuemax={359}
            aria-valuenow={0}
            aria-valuetext={t('sliderValue', { degrees: 0 })}
            data-ready={ready || undefined}
            data-poster={posterShown || undefined}
            data-loading={loading || undefined}
            data-landed={(ready && landed) || undefined}
            onKeyDown={onKeyDown}
          >
            <span className={`${ui.halo} ${styles.halo}`} aria-hidden="true" />
            <div ref={rings} className={styles.rings} aria-hidden="true">
              <svg viewBox="-300 -300 600 600" focusable="false" data-ring-art="">
                <defs>
                  <radialGradient id={`${ids}-disc`}>
                    <stop offset="0" className={`${styles.discStop} ${styles.discStopCenter}`} />
                    <stop offset="1" className={styles.discStop} />
                  </radialGradient>
                  <clipPath id={`${ids}-lower`}>
                    <rect x="-300" y="0" width="600" height="300" />
                  </clipPath>
                  <clipPath id={`${ids}-upper`}>
                    <rect x="-300" y="-300" width="600" height="300" />
                  </clipPath>
                </defs>
                <circle className={styles.disc} r="206" fill={`url(#${ids}-disc)`} />
                <circle className={`${styles.ring} ${styles.ringOuter}`} r="288" />
                <circle className={styles.ring} r="250" />
                <circle className={`${styles.ring} ${styles.ringEdge}`} r="206" />
                <circle className={`${styles.ring} ${styles.ringInner}`} r="150" />
                {/* Arco de giro: dos medias vueltas recortadas que solo rotan (transform). */}
                <g transform="rotate(90) scale(1 -1)">
                  <g clipPath={`url(#${ids}-lower)`}>
                    <path ref={arcLower} className={styles.arc} d={HALF_ARC} transform="rotate(-180)" />
                  </g>
                  <g clipPath={`url(#${ids}-upper)`}>
                    <path ref={arcUpper} className={styles.arc} d={HALF_ARC} transform="rotate(0)" />
                  </g>
                </g>
                <g ref={ticks}>
                  {TICKS.map((tick) => (
                    <g key={tick.degree}>
                      <line className={tick.major ? `${styles.tick} ${styles.tickMajor}` : styles.tick} {...tick.line} />
                      {tick.text && (
                        <text x={tick.text.x} y={tick.text.y} dy="0.35em">
                          {tick.text.value}
                        </text>
                      )}
                    </g>
                  ))}
                </g>
                <path className={styles.index} d="M0 241 L-8 255 L8 255 Z" />
                <path className={styles.cross} d="M-24 0H24M0 -24V24" />
              </svg>
            </div>
            {model?.poster && (
              <div className={styles.poster} aria-hidden="true">
                <ThemedPoster poster={model.poster} alt={t('posterAlt', { name: product.name })} />
              </div>
            )}
            <div className={styles.canvas}>
              {mounted && request && (
                <BoardScene
                  host="hangar"
                  active={active}
                  request={request}
                  lite={lite}
                  reducedMotion={reducedMotion}
                  spin={spin}
                  onStatus={setStatus}
                  onReady={onReady}
                  onLanded={setLanded}
                  onFrame={onFrame}
                />
              )}
            </div>
            <div ref={scan} className={styles.scan} aria-hidden="true">
              <span ref={beam} className={styles.beam} />
            </div>
            <span className={`${ui.hudLabel} ${styles.wait}`} aria-hidden="true">
              {t('waiting')}
            </span>
          </div>
          <div className={`${styles.hud} ${styles.hudTop}`} data-h-reveal="">
            <span className={ui.hudLabel}>{loading ? t('loading') : t('onPlatform')}</span>
            <span className={styles.model}>
              <span className="visually-hidden">{product.name}</span>
              <span ref={nameRef} key={product.slug} aria-hidden="true">
                {product.name}
              </span>
            </span>
          </div>
          <div className={`${styles.hud} ${styles.hudSide}`} data-h-reveal="" aria-hidden="true">
            <span className={ui.hudLabel}>{t('elevation')}</span>
            <span className={ui.hudLabel}>{t('scanner')}</span>
          </div>
          <div className={`${styles.hud} ${styles.hudBottom}`} data-h-reveal="">
            <span ref={rot} className={styles.rot} aria-hidden="true">
              {t('rotation', { degrees: '000' })}
            </span>
            <span className={styles.progress} aria-hidden="true">
              <span ref={bar} />
            </span>
            <span className={`${ui.hudLabel} ${styles.hint}`} aria-hidden="true">
              {t('platform')}
              <span className={styles.hintMouse}>
                {' · '}
                {/* Mismo texto que la vista previa del tablero. */}
                <HintText kind="drag" />
              </span>
              <span className={styles.hintTouch}>
                {' · '}
                <HintText kind="touch" />
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function HintText({ kind }: { kind: 'drag' | 'touch' }) {
  const t = useTranslations('HomeBoard.preview');
  return <>{kind === 'drag' ? t('dragHint') : t('touchHint')}</>;
}
