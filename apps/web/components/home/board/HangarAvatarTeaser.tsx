'use client';

import type { AvatarSlot } from '@airspace/contracts';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { type KeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { ringTransform, type StagePose, VIEWS } from '@/components/hangar/rig';
import { Link } from '@/i18n/navigation';
import { accentProps } from '@/lib/accent';
import { FITTING } from '@/lib/avatar/fitting';
import { HOME_ANCHORS } from '@/lib/home';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { SplitText } from '@/lib/motion/split-text';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { useStageActivity } from '@/lib/three/director';
import styles from './Hangar.module.css';
import own from './HangarAvatar.module.css';
import { createSpin, keySpin, turnOf, useSpinDrag } from './rig';
import ui from './ui.module.css';

// El canvas del Hangar (avatar, ropa y zapatos) se descarga aparte y solo
// cuando la sección se acerca a la pantalla.
const AvatarScene = dynamic(() => import('@/components/hangar/AvatarScene'), { ssr: false });

// Look de fábrica del Hangar armado en el servidor (HomeBoard): el par y las
// prendas del catálogo con la URL de cada variante.
export interface TeaserLook {
  pair: {
    slug: string;
    name: string;
    liteUrl: string;
    foot: 'left' | 'right';
    accent: { dark: string; light: string } | null;
  };
  wear: Array<{ slug: string; slot: AvatarSlot; url: string; liteUrl: string }>;
}

// Foto fija del maniquí con el look de fábrica, en pose y a -30° (captura
// de /hangar con movimiento reducido y dos pasos de flecha a la izquierda,
// solo el lienzo y fondo transparente, ver HangarAvatar.module.css). Se ve
// mientras carga, en modo liviano y con movimiento reducido. Si cambia el
// look de fábrica, hay que volver a capturarla.
const STILL = { dark: '/posters/hangar-teaser-dark.webp', light: '/posters/hangar-teaser-light.webp' };
const STILL_SIZE = { width: 620, height: 1000 };

// Margen para empezar a descargar antes de que la sección se vea.
const PRELOAD_MARGIN = '75% 0px';
// Si alguna prenda tarda o falla, el maniquí aparece igual tras este tiempo (s).
const WEAR_GRACE = 5;
// Giro inicial de la plataforma (rad): el mismo de la foto fija.
const START_ANGLE = -Math.PI / 6;
// Diámetro de la plataforma (m): el SVG de anillos mide 600 unidades.
const PLATFORM = 1.2;

// Marcas de la plataforma (mismo dibujo que el adelanto del zapato).
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
    // Redondeo a 0,1: servidor y navegador deben escribir el mismo atributo.
    line: { x1: (inner * cos).toFixed(1), y1: (inner * sin).toFixed(1), x2: (outer * cos).toFixed(1), y2: (outer * sin).toFixed(1) },
    text: major ? { x: (272 * cos).toFixed(1), y: (272 * sin).toFixed(1), value: String(degree).padStart(3, '0') } : null,
  };
});

const FEATURES = [
  { key: 'avatar', icon: 'M12 8.5v6.5M12 15l-3.4 5.5M12 15l3.4 5.5M6.5 11.5 12 10l5.5 1.5', circle: true },
  { key: 'shoes', icon: 'M4 8.5h14.5l-3.5-3.5M20 15.5H5.5L9 19', circle: false },
  { key: 'view', icon: 'M12 3.5v9.5M15.2 16.9l-2.6.3 1.7 2', ellipse: true },
] as const;

// Suscripciones del navegador (sin estado por cuadro).
const subscribeVisibility = (callback: () => void) => {
  document.addEventListener('visibilitychange', callback);
  return () => document.removeEventListener('visibilitychange', callback);
};

// Adelanto del Hangar 360° con el maniquí: camina en su lugar con el look de
// fábrica (gorra, hoodie Nike Air negro, pants y el par) sobre la plataforma, que gira
// despacio. Es un bucle por tiempo mientras se ve (nunca ligado al scroll) y
// el canvas solo dibuja si el director de render lo elige y la pestaña está
// visible. La plataforma se gira con arrastre (inercia; en táctil solo el
// gesto horizontal, el vertical sigue desplazando la página) y con las
// flechas; el giro lento vuelve solo unos segundos después de soltar. El
// botón de la columna abre el Hangar (la plataforma no es un enlace: un clic
// al soltar un arrastre lo abriría sin querer).
export function HangarAvatarTeaser({ look, lite, reducedMotion }: { look: TeaserLook; lite: boolean; reducedMotion: boolean }) {
  const t = useTranslations('HomeBoard.hangar');
  const ids = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rootRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const tabVisible = useSyncExternalStore(subscribeVisibility, () => document.visibilityState === 'visible', () => true);
  const active = useStageActivity(stage) && tabVisible;

  // Cerca de la pantalla: recién ahí se descargan el canvas y los modelos.
  const [near, setNear] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || near) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setNear(true), { rootMargin: PRELOAD_MARGIN });
    observer.observe(root);
    return () => observer.disconnect();
  }, [near]);

  // Modo liviano y movimiento reducido: solo la foto fija (sin 3D).
  const still = lite || reducedMotion;
  const live = near && !still;
  // Solo el modo liviano (equipos de gama baja) baja la resolución y usa las
  // prendas livianas. Los teléfonos normales dibujan como el Hangar (DPR 1,5 y
  // prendas con texturas completas): con DPR 1 en una pantalla de 3x el avatar
  // y los estampados se veían borrosos.
  // El par va siempre en su -lite.glb: de cuerpo entero mide unos 50 px y
  // el hero (texturas de 2048 px) pesaría más del doble sin verse distinto.
  const shoe = useMemo(() => ({ slug: look.pair.slug, url: look.pair.liteUrl, foot: look.pair.foot }), [look.pair]);
  const wear = useMemo(() => look.wear.map((item) => ({ slug: item.slug, slot: item.slot, url: lite ? item.liteUrl : item.url })), [look.wear, lite]);

  // Listo: avatar y par dibujados y las prendas a la vista (o pasó el margen).
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const [worn, setWorn] = useState(0);
  const onWear = useCallback((slugs: string[]) => setWorn(slugs.length), []);
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    if (!ready || graceOver) return;
    const timer = window.setTimeout(() => setGraceOver(true), WEAR_GRACE * 1000);
    return () => window.clearTimeout(timer);
  }, [ready, graceOver]);
  const shown = live && ready && (worn >= wear.length || graceOver);

  const [spin] = useState(() => ({ current: { ...createSpin(), angle: START_ANGLE } }));
  // Arrastre con inercia (el mismo del Hangar y del adelanto del zapato).
  // Sin 3D (foto fija) no hay nada que girar.
  useSpinDrag(live ? stage : null, spin, reducedMotion);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!live || !keySpin(spin.current, event.key, reducedMotion)) return;
    event.preventDefault();
  };

  const rings = useRef<HTMLDivElement>(null);
  const ticks = useRef<SVGGElement>(null);
  const baseK = useRef(1);
  const shownTicks = useRef('');
  const shownDegrees = useRef(-1);

  // Anillos en la vista de cuerpo entero; se rehacen con el tamaño.
  useLayoutEffect(() => {
    if (!stage) return;
    const layout = () => {
      const size = { width: stage.clientWidth, height: stage.clientHeight };
      if (!size.width || !size.height || !rings.current) return;
      const pose = VIEWS.full(size.width, size.height);
      baseK.current = pose.k;
      const ring = PLATFORM * pose.k;
      Object.assign(rings.current.style, { width: `${ring}px`, height: `${ring}px`, left: `${-ring / 2}px`, top: `${-ring / 2}px` });
      rings.current.style.transform = ringTransform(pose, size, pose.k);
      ticks.current?.setAttribute('transform', `rotate(${((-spin.current.angle * 180) / Math.PI).toFixed(2)})`);
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage, spin]);

  // Cada cuadro: anillos con la cámara y marcas con el giro (directo al DOM).
  // El valor del control deslizante solo se escribe al cambiar de grado.
  const onFrame = useCallback(
    (pose: StagePose, size: { width: number; height: number }, angle: number) => {
      if (rings.current) rings.current.style.transform = ringTransform(pose, size, baseK.current);
      const transform = `rotate(${((-angle * 180) / Math.PI).toFixed(2)})`;
      if (transform !== shownTicks.current) {
        shownTicks.current = transform;
        ticks.current?.setAttribute('transform', transform);
      }
      const { degrees } = turnOf(angle);
      if (degrees === shownDegrees.current) return;
      shownDegrees.current = degrees;
      stage?.setAttribute('aria-valuenow', String(degrees));
      stage?.setAttribute('aria-valuetext', t('sliderValue', { degrees }));
    },
    [stage, t],
  );

  // Entrada por tiempo y una sola vez (igual que el adelanto del zapato):
  // título por letras, textos y HUD; los anillos un poco después.
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

  const loading = live && !shown;
  const startDegrees = turnOf(START_ANGLE).degrees;
  const hint = useTranslations('HomeBoard.preview');
  // Con la foto fija la plataforma es solo imagen; con 3D, un control deslizante.
  const slider = still
    ? {}
    : {
        tabIndex: 0,
        role: 'slider',
        'aria-label': t('avatar.sliderLabel'),
        'aria-valuemin': 0,
        'aria-valuemax': 359,
        'aria-valuenow': startDegrees,
        'aria-valuetext': t('sliderValue', { degrees: startDegrees }),
        onKeyDown,
      };

  return (
    <section ref={rootRef} id={HOME_ANCHORS.hangar} className={styles.hangar} aria-labelledby="hangar-title" data-enter="idle" data-teaser="avatar" tabIndex={-1}>
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
            <Link href="/hangar" className={`${ui.btn} ${ui.btnPrimary} ${styles.cta}`} aria-describedby={`${ids}-note`}>
              {t('cta')}
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <p className={`${ui.hudLabel} ${styles.note}`} id={`${ids}-note`}>
              {t('ctaNote')}
            </p>
          </div>
        </div>

        {/* El acento del par tiñe anillos y halo (Hangar.module.css); sin acento, lima. */}
        <div className={styles.slot} {...accentProps(look.pair.accent)}>
          <div
            ref={setStage}
            className={`${styles.stage} ${own.stage}`}
            data-ready={shown || undefined}
            data-loading={loading || undefined}
            data-still={still || undefined}
            {...slider}
          >
            <span className={`${ui.halo} ${styles.halo}`} aria-hidden="true" />
            <div ref={rings} className={styles.rings} aria-hidden="true">
              <svg viewBox="-300 -300 600 600" focusable="false" data-ring-art="">
                <defs>
                  <radialGradient id={`${ids}-disc`}>
                    <stop offset="0" className={`${styles.discStop} ${styles.discStopCenter}`} />
                    <stop offset="1" className={styles.discStop} />
                  </radialGradient>
                </defs>
                <circle className={styles.disc} r="206" fill={`url(#${ids}-disc)`} />
                <circle className={`${styles.ring} ${styles.ringOuter}`} r="288" />
                <circle className={styles.ring} r="250" />
                <circle className={`${styles.ring} ${styles.ringEdge}`} r="206" />
                <circle className={`${styles.ring} ${styles.ringInner}`} r="150" />
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
              </svg>
            </div>
            {/* Foto fija: mientras carga, en modo liviano y con movimiento reducido. */}
            <div className={own.still} aria-hidden="true">
              <ThemedPoster poster={STILL} alt="" width={STILL_SIZE.width} height={STILL_SIZE.height} className={own.stillImage} />
            </div>
            <div className={`${styles.canvas} ${own.canvas}`}>
              {live && (
                <AvatarScene
                  active={active}
                  lite={lite}
                  reducedMotion={false}
                  shoe={shoe}
                  clip="walk"
                  fitting={FITTING}
                  view="full"
                  spin={spin}
                  autoRotate
                  outfit={null}
                  wear={wear}
                  onWear={onWear}
                  onReady={onReady}
                  onFrame={onFrame}
                />
              )}
            </div>
          </div>
          <div className={`${styles.hud} ${styles.hudTop}`} data-h-reveal="">
            <span className={ui.hudLabel}>{t('avatar.wearing')}</span>
            <span className={styles.model}>{look.pair.name}</span>
          </div>
          <div className={`${styles.hud} ${styles.hudBottom}`} data-h-reveal="" aria-hidden="true">
            <span className={`${ui.hudLabel} ${own.hint}`}>
              {/* En el teléfono solo queda la pista del gesto (el botón va justo abajo). */}
              <span className={own.hintLead}>{t('avatar.hint')}</span>
              {!still && (
                <>
                  <span className={styles.hintMouse}>
                    <span className={own.hintSep}>{' · '}</span>
                    {hint('dragHint')}
                  </span>
                  <span className={styles.hintTouch}>
                    <span className={own.hintSep}>{' · '}</span>
                    {hint('touchHint')}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
