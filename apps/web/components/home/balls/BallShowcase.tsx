'use client';

import type { Locale } from '@airspace/contracts';
import { useFormatter, useTranslations } from 'next-intl';
import { type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCartStore } from '@/components/cart/cart-store';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { SplitText } from '@/lib/motion/split-text';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { HOME_ANCHORS } from '@/lib/home';
import { type Ball, prefetchModel, type Selection } from './ball-data';
import { AXIS_DEGREES } from './ball-axis';
import type { BallControls } from './BallScene';
import { BallSpotlight } from './BallSpotlight';
import { ConveyorBelt } from './ConveyorBelt';
import styles from './HomeBalls.module.css';

// Sección Balones (cliente). Estructura del prototipo (sections/baggage):
//   encabezado   fila de estado (colección, vitrina, conteo) y título
//   escena       detalles · foco 3D · selector, y la banda debajo
//
// Movimiento (sin pin ni scrub, nada depende del scroll):
// - Entradas de una sola vez al aparecer (ScrollTrigger solo como disparador);
//   el estado oculto vive en el CSS y el foco del teclado las completa.
// - La banda corre por tiempo mientras se ve y se detiene fuera de pantalla.
// - Elegir un balón (selector o banda) frena la banda, sube el balón al foco
//   y la vuelve a arrancar. Con movimiento reducido todo queda quieto.
// - Una recarga vuelve al mismo balón (sessionStorage).

const STORAGE_KEY = 'airspace-balls:selected';
const pad = (value: number) => String(value).padStart(2, '0');

export function BallShowcase({ balls, locale }: { balls: Ball[]; locale: Locale }) {
  const t = useTranslations('HomeBalls');
  const format = useFormatter();
  const reducedMotion = useMotionStore((state) => state.reducedMotion);
  const addToCart = useCartStore((state) => state.add);

  const [selection, setSelection] = useState<Selection>({ index: 0, piece: null, animate: false });
  const ball = balls[selection.index];
  const [live, setLive] = useState(false);
  const [showing, setShowing] = useState(false);
  const [added, setAdded] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const section = useRef<HTMLElement>(null);
  const spotRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef<HTMLElement>(null);
  const speedRef = useRef<HTMLElement>(null);
  const controls = useRef<BallControls>({ dragYaw: 0, yaw: 0, invalidate: null });
  const telemetry = useRef({ speed: 0 });

  // ---------- Datos derivados ----------

  const years = balls.map((item) => item.year);
  const byYear = useMemo(() => [...balls].sort((a, b) => a.year - b.year), [balls]);
  const oldest = byYear[0];
  const newest = byYear[byYear.length - 1];
  const brands = [...new Set(balls.map((item) => item.brand))].join(' · ');
  const sizes = [...new Set(balls.map((item) => item.size).filter(Boolean))];
  const lite = () => document.documentElement.classList.contains('lite');
  const modelUrl = (item: Ball) => (lite() ? item.model.liteUrl : item.model.heroUrl);

  // ---------- Selección ----------

  const select = useCallback(
    (index: number, piece: number | null = null) => {
      setSelection((current) => (current.index === index ? current : { index, piece, animate: true }));
    },
    [],
  );

  // Recarga: vuelve al balón que estaba elegido, al instante (antes de pintar).
  useLayoutEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }
    const index = saved ? balls.findIndex((item) => item.slug === saved) : -1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restauración única antes de pintar
    if (index > 0) setSelection({ index, piece: null, animate: false });
  }, [balls]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, ball.slug);
    } catch {
      // Sin almacenamiento: la recarga vuelve al primero.
    }
  }, [ball.slug]);

  // Cada cambio: anuncio para lectores de pantalla, botón del carrito como
  // nuevo, estado "Mostrando" mientras la banda frena y el selector visible.
  useEffect(() => {
    if (!selection.animate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacción a un cambio discreto de balón
    setAdded(false);
    setAnnouncement(t('announce.showing', { name: ball.name, edition: ball.edition }));
    const list = listRef.current;
    const button = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (list && button && list.scrollWidth > list.clientWidth + 1) {
      list.scrollTo({ left: Math.max(0, button.offsetLeft - list.offsetLeft - parseFloat(getComputedStyle(list).paddingLeft)), behavior: reducedMotion ? 'auto' : 'smooth' });
    }
    if (reducedMotion) return;
    setShowing(true);
    const done = gsap.delayedCall(1.6, () => setShowing(false));
    return () => {
      done.kill();
    };
  }, [selection, ball.name, ball.edition, reducedMotion, t]);

  // ---------- Visibilidad: banda, lecturas y descarga anticipada ----------

  useEffect(() => {
    const element = section.current?.querySelector('[data-scene]');
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setLive(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // El primer modelo se pide con tiempo, una pantalla antes de llegar.
  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        prefetchModel(modelUrl(balls[0]));
        observer.disconnect();
      },
      { rootMargin: '100% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balls]);

  // Lecturas del panel (giro y velocidad): se escriben directo al DOM unas
  // diez veces por segundo, solo con la escena a la vista.
  useEffect(() => {
    if (!live || reducedMotion) return;
    const degrees = new Intl.NumberFormat(locale, { style: 'unit', unit: 'degree', unitDisplay: 'narrow', minimumIntegerDigits: 3, maximumFractionDigits: 0 });
    const speed = new Intl.NumberFormat(locale, { style: 'unit', unit: 'meter-per-second', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let last = 0;
    const tick = (time: number) => {
      if (time - last < 0.1) return;
      last = time;
      const yaw = ((((controls.current.yaw * 180) / Math.PI) % 360) + 360) % 360;
      if (rotRef.current) rotRef.current.textContent = degrees.format(Math.round(yaw) % 360);
      if (speedRef.current) speedRef.current.textContent = speed.format(telemetry.current.speed);
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [live, reducedMotion, locale]);

  // ---------- Entradas (una sola vez) ----------

  useGSAP(
    () => {
      const root = section.current;
      if (!root) return;
      root.dataset.ready = '';
      const enter = (name: 'headIn' | 'sceneIn') => {
        root.dataset[name] = '';
      };
      if (!document.documentElement.classList.contains('motion-ok')) {
        enter('headIn');
        enter('sceneIn');
        return;
      }
      const q = gsap.utils.selector(root);
      const head = q('[data-head]')[0] as HTMLElement;
      const scene = q('[data-scene]')[0] as HTMLElement;
      const heading = q('[data-heading]')[0] as HTMLElement;

      const headIntro = gsap.timeline({
        paused: true,
        defaults: { ease: EASE.out.gsap, duration: DURATION.reveal },
        onComplete: () => {
          enter('headIn');
          gsap.set(q('[data-rule], [data-enter-head], [data-heading]'), { clearProps: 'opacity,transform' });
        },
      });
      const split = SplitText.create(heading, { type: 'chars', mask: 'chars' });
      headIntro
        .set(heading, { opacity: 1 }, 0)
        .from(split.chars, { yPercent: 110, stagger: 0.045, duration: DURATION.reveal }, 0)
        .to(q('[data-rule]'), { scaleX: 1, duration: DURATION.cinematic, ease: EASE.inOut.gsap }, 0)
        .to(q('[data-enter-head]'), { opacity: 1, y: 0, stagger: 0.08 }, 0.25);

      const sceneIntro = gsap.timeline({
        paused: true,
        defaults: { ease: EASE.out.gsap, duration: DURATION.reveal },
        onComplete: () => {
          enter('sceneIn');
          gsap.set(q('[data-spot], [data-enter], [data-enter-side], [data-belt-body], [data-belt-drop], [data-belt-string]'), { clearProps: 'opacity,transform' });
        },
      });
      sceneIntro
        .to(q('[data-spot]'), { opacity: 1, scale: 1, duration: DURATION.cinematic }, 0)
        .to(q('[data-enter]'), { opacity: 1, y: 0, stagger: 0.06 }, 0.15)
        .to(q('[data-enter-side]'), { opacity: 1, y: 0, stagger: 0.1 }, 0.3)
        .to(q('[data-belt-body]'), { opacity: 1, y: 0, stagger: 0.07, duration: 1.1 }, 0.1)
        .fromTo(q('[data-belt-drop]'), { rotationX: -100, opacity: 0 }, { rotationX: 0, opacity: 1, stagger: 0.07, duration: 1, ease: 'back.out(1.6)', immediateRender: false }, 0.45)
        .to(q('[data-belt-string]'), { opacity: 1, stagger: 0.07, duration: 0.6 }, 0.5);

      // end: 'max' hace que una recarga más abajo también las complete.
      ScrollTrigger.create({ trigger: head, start: 'top 85%', end: 'max', once: true, onEnter: () => headIntro.play() });
      ScrollTrigger.create({ trigger: scene, start: 'top 75%', end: 'max', once: true, onEnter: () => sceneIntro.play() });

      // Teclado o lector de pantalla antes de la entrada: se completa al instante.
      const finishHead = () => headIntro.progress() < 1 && headIntro.progress(1);
      const finishScene = () => sceneIntro.progress() < 1 && sceneIntro.progress(1);
      head.addEventListener('focusin', finishHead);
      scene.addEventListener('focusin', finishScene);
      return () => {
        head.removeEventListener('focusin', finishHead);
        scene.removeEventListener('focusin', finishScene);
      };
    },
    { scope: section },
  );

  // Cambio de balón: los datos nuevos entran con un fundido corto (por tiempo).
  useGSAP(
    () => {
      if (!selection.animate || reducedMotion) return;
      gsap.fromTo(gsap.utils.toArray<HTMLElement>('[data-swap]', section.current), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: DURATION.reveal, ease: EASE.out.gsap, stagger: 0.04, overwrite: true });
    },
    { scope: section, dependencies: [selection] },
  );

  // ---------- Carrito ----------

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 2600);
    return () => window.clearTimeout(timer);
  }, [added]);

  const onAdd = () => {
    addToCart({ slug: ball.slug, size: ball.size || undefined });
    setAdded(true);
    setAnnouncement(t('announce.added', { name: ball.name }));
  };

  // ---------- Selector ----------

  const onPickerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[event.key];
    if (!step) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = (index + step + buttons.length) % buttons.length;
    buttons[next].focus();
    select(next);
  };

  const prefetch = (item: Ball) => prefetchModel(modelUrl(item));
  const status = reducedMotion ? t('status.paused') : showing ? t('status.showing') : t('status.moving');
  const hostYear = (item: Ball) => t('hostYear', { host: item.host, year: String(item.year) });

  return (
    <section ref={section} id={HOME_ANCHORS.balls} className={styles.section} aria-labelledby="balls-heading" data-live={live || undefined}>
      <div className={styles.bg} aria-hidden="true" />

      <header className={styles.head} data-head="">
        <div className={styles.top}>
          <p className={styles.topId}>
            <span className={`${styles.hud} ${styles.hudPrimary}`}>{t('kicker')}</span>
            {sizes.length === 1 && <span className={`${styles.hud} ${styles.topSub}`}>{t('brandSize', { brand: brands, size: sizes[0] })}</span>}
          </p>
          <span className={styles.rule} data-rule="" aria-hidden="true" />
          <div className={styles.topStatus}>
            <p className={styles.status} data-enter-head="">
              <span className={styles.statusDot} aria-hidden="true" />
              <span className={`${styles.hud} ${styles.statusText}`}>
                <span className={styles.statusBand}>{t('status.label')}</span>
                <span className={styles.statusState}>{status}</span>
              </span>
            </p>
            <p className={`${styles.hud} ${styles.count}`} data-enter-head="">
              {t.rich('count', {
                count: format.number(balls.length, { minimumIntegerDigits: 2 }),
                total: balls.length,
                from: String(Math.min(...years)),
                to: String(Math.max(...years)),
                value: (chunks) => <span className={styles.countValue}>{chunks}</span>,
              })}
            </p>
          </div>
        </div>
        <div className={styles.title}>
          <h2 id="balls-heading" className={styles.heading} data-heading="">
            {t('title')}
          </h2>
          <p className={styles.lead} data-enter-head="">
            {t('lead', { total: balls.length, oldest: oldest.shortName, oldestYear: String(oldest.year), newest: newest.shortName, newestYear: String(newest.year) })}
          </p>
        </div>
      </header>

      <div className={styles.scene} data-scene="">
        <div className={styles.beam} aria-hidden="true">
          <span className={styles.lamp} />
        </div>

        <div className={styles.details}>
          <div className={styles.detailsTop} data-enter="">
            <p className={styles.hud} data-swap="">
              {t('details.piece', { index: pad(selection.index + 1), total: pad(balls.length) })}
            </p>
            <span className={styles.chip} data-swap="">
              {hostYear(ball)}
            </span>
          </div>
          <h3 className={styles.name} data-enter="">
            <span data-swap="">{ball.name}</span>
          </h3>
          <p className={styles.edition} data-enter="">
            <span data-swap="">{ball.edition}</span>
          </p>
          <p className={styles.tagline} data-enter="">
            <span data-swap="">{ball.tagline}</span>
          </p>
          <dl className={styles.specs} data-enter="">
            <div className={styles.spec}>
              <dt className={styles.hud}>{t('details.finalIn')}</dt>
              <dd className={styles.specCity} data-swap="">
                {ball.hostCity}
              </dd>
            </div>
            <div className={styles.spec}>
              <dt className={styles.hud}>{t('details.year')}</dt>
              <dd className={styles.specMono} data-swap="">
                {ball.year}
              </dd>
            </div>
            <div className={styles.spec}>
              <dt className={styles.hud}>{t('details.panels')}</dt>
              <dd className={styles.specMono} data-swap="">
                {ball.panels === null ? t('details.unknown') : format.number(ball.panels)}
              </dd>
            </div>
            <div className={styles.spec}>
              <dt className={styles.hud}>{t('details.finish')}</dt>
              <dd data-swap="">{ball.finish ?? t('details.unknown')}</dd>
            </div>
          </dl>
          <div className={styles.buy} data-enter="">
            <div className={styles.fare}>
              <span className={styles.hud}>{t('details.price')}</span>
              <span className={styles.price} data-swap="">
                {ball.price}
              </span>
            </div>
            <button type="button" className={styles.cta} data-done={added || undefined} onClick={onAdd}>
              <span>{added ? t('details.added') : t('details.addToCart')}</span>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <p className="visually-hidden" role="status" aria-live="polite">
            {announcement}
          </p>
        </div>

        <BallSpotlight ball={ball} spotRef={spotRef} controlsRef={controls} />

        <aside className={styles.side} aria-labelledby="balls-picker-label">
          <dl className={styles.readouts} data-enter-side="" aria-hidden="true">
            <div className={`${styles.readout} ${styles.readoutRot}`}>
              <dt className={styles.hud}>{t('readouts.spin')}</dt>
              <dd className={styles.readoutValue} ref={rotRef}>
                {format.number(0, { style: 'unit', unit: 'degree', unitDisplay: 'narrow', minimumIntegerDigits: 3 })}
              </dd>
            </div>
            <div className={styles.readout}>
              <dt className={styles.hud}>{t('readouts.speed')}</dt>
              <dd className={`${styles.readoutValue} ${styles.readoutSmall}`} ref={speedRef}>
                {format.number(0, { style: 'unit', unit: 'meter-per-second', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </dd>
            </div>
            <div className={styles.readout}>
              <dt className={styles.hud}>{t('readouts.axis')}</dt>
              <dd className={`${styles.readoutValue} ${styles.readoutSmall}`}>{format.number(AXIS_DEGREES, { style: 'unit', unit: 'degree', unitDisplay: 'narrow' })}</dd>
            </div>
          </dl>
          <div className={styles.picker} data-enter-side="">
            <p className={`${styles.hud} ${styles.pickerLabel}`} id="balls-picker-label">
              {t('picker.label')}
            </p>
            <div ref={listRef} className={styles.pickerList} role="group" aria-labelledby="balls-picker-label" onKeyDown={onPickerKey}>
              {balls.map((item, index) => (
                <button
                  key={item.slug}
                  type="button"
                  className={styles.pick}
                  aria-pressed={index === selection.index}
                  aria-label={t('picker.item', { year: String(item.year), host: item.host, shortName: item.shortName, name: item.name, edition: item.edition })}
                  onClick={() => select(index)}
                  onPointerEnter={() => prefetch(item)}
                  onFocus={() => prefetch(item)}
                >
                  <span className={styles.pickYear} aria-hidden="true">
                    {item.year}
                  </span>
                  <span className={styles.pickHost} aria-hidden="true">
                    {item.host}
                  </span>
                  <span className={styles.pickName} aria-hidden="true">
                    {item.shortName}
                  </span>
                  <span className={styles.pickDot} aria-hidden="true" />
                </button>
              ))}
            </div>
            <p className={`${styles.hud} ${styles.pickerHint}`}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 3v9.5M4 8.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t('picker.hint')}
            </p>
          </div>
        </aside>

        <div className={styles.beltArea}>
          <ConveyorBelt
            balls={balls}
            selection={selection}
            live={live}
            reducedMotion={reducedMotion}
            claimTarget={spotRef}
            telemetryRef={telemetry}
            onPick={(index, piece) => select(index, piece)}
            onHover={(index) => prefetch(balls[index])}
          />
        </div>
      </div>
    </section>
  );
}
