'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MAX_QUANTITY, useCartStore } from '@/components/cart/cart-store';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { SplitText } from '@/lib/motion/split-text';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { HOME_ANCHORS } from '@/lib/home';
import { type Ball, prefetchModel, type Selection } from './ball-data';
import type { BallControls } from './BallScene';
import { BallSpotlight } from './BallSpotlight';
import { ConveyorBelt } from './ConveyorBelt';
import styles from './HomeBalls.module.css';

// Sección Balones (cliente). Estructura (versión liviana del prototipo
// sections/baggage):
//   encabezado   título y una frase
//   escena       detalles · foco 3D · pista, y la banda debajo (el selector)
//
// Movimiento (sin pin ni scrub, nada depende del scroll):
// - Entradas de una sola vez al aparecer (ScrollTrigger solo como disparador);
//   el estado oculto vive en el CSS y el foco del teclado las completa.
// - La banda corre por tiempo mientras se ve y se detiene fuera de pantalla.
// - Elegir un balón (banda, clic o teclado) frena la banda, sube el balón al
//   foco y la vuelve a arrancar. Con movimiento reducido todo queda quieto.
// - Una recarga vuelve al mismo balón (sessionStorage).

const STORAGE_KEY = 'airspace-balls:selected';

export function BallShowcase({ balls }: { balls: Ball[] }) {
  const t = useTranslations('HomeBalls');
  const tProduct = useTranslations('Product');
  const format = useFormatter();
  const reducedMotion = useMotionStore((state) => state.reducedMotion);
  const addToCart = useCartStore((state) => state.add);

  const [selection, setSelection] = useState<Selection>({ index: 0, piece: null, animate: false });
  const ball = balls[selection.index];
  const [live, setLive] = useState(false);
  const [added, setAdded] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const section = useRef<HTMLElement>(null);
  const spotRef = useRef<HTMLDivElement | null>(null);
  const controls = useRef<BallControls>({ dragYaw: 0, yaw: 0, invalidate: null });

  // ---------- Datos derivados ----------

  const byYear = useMemo(() => [...balls].sort((a, b) => a.year - b.year), [balls]);
  const oldest = byYear[0];
  const newest = byYear[byYear.length - 1];
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

  // Cada cambio: anuncio para lectores de pantalla y botón del carrito como nuevo.
  useEffect(() => {
    if (!selection.animate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacción a un cambio discreto de balón
    setAdded(false);
    setAnnouncement(t('announce.showing', { name: ball.name, edition: ball.edition }));
  }, [selection, ball.name, ball.edition, t]);

  // ---------- Visibilidad: banda y descarga anticipada ----------

  useEffect(() => {
    const element = section.current?.querySelector('[data-scene]');
    if (!element) return;
    // Margen negativo: un borde que apenas toca la ventana cuenta como
    // "intersecting" y dejaba la banda girando con la sección ya fuera de vista.
    const observer = new IntersectionObserver(([entry]) => setLive(entry.isIntersecting), { rootMargin: '-24px 0px' });
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
          gsap.set(q('[data-enter-head], [data-heading]'), { clearProps: 'opacity,transform' });
        },
      });
      const split = SplitText.create(heading, { type: 'chars', mask: 'chars' });
      headIntro
        .set(heading, { opacity: 1 }, 0)
        .from(split.chars, { yPercent: 110, stagger: 0.045, duration: DURATION.reveal }, 0)
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
    // add() devuelve false si la línea ya tiene el máximo de unidades.
    if (addToCart({ slug: ball.slug, size: ball.size || undefined }) === false) {
      setAnnouncement(tProduct('maxInCart', { max: MAX_QUANTITY }));
      return;
    }
    setAdded(true);
    setAnnouncement(t('announce.added', { name: ball.name }));
  };

  const prefetch = (item: Ball) => prefetchModel(modelUrl(item));
  const twoDigits = (value: number) => format.number(value, { minimumIntegerDigits: 2, useGrouping: false });

  return (
    <section ref={section} id={HOME_ANCHORS.balls} className={styles.section} aria-labelledby="balls-heading" data-live={live || undefined}>
      <div className={styles.bg} aria-hidden="true" />

      <header className={styles.head} data-head="">
        <h2 id="balls-heading" className={styles.heading} data-heading="">
          {t('title')}
        </h2>
        <p className={styles.lead} data-enter-head="">
          {t('lead', { total: balls.length, oldest: oldest.shortName, oldestYear: String(oldest.year), newest: newest.shortName, newestYear: String(newest.year) })}
        </p>
      </header>

      <div className={styles.scene} data-scene="">
        <div className={styles.beam} aria-hidden="true">
          <span className={styles.lamp} />
        </div>

        <div className={styles.details}>
          <p className={styles.hud} data-enter="">
            <span data-swap="">{t('details.piece', { index: twoDigits(selection.index + 1), total: twoDigits(balls.length) })}</span>
          </p>
          <h3 className={styles.name} data-enter="">
            <span data-swap="">{ball.name}</span>
          </h3>
          <p className={styles.edition} data-enter="">
            <span data-swap="">{ball.edition}</span>
          </p>
          <dl className={styles.specs} data-enter="">
            <div className={styles.spec}>
              <dt className={styles.hud}>{t('details.year')}</dt>
              <dd className={styles.specMono} data-swap="">
                {ball.year}
              </dd>
            </div>
            <div className={styles.spec}>
              <dt className={styles.hud}>{t('details.finalIn')}</dt>
              <dd className={styles.specCity} data-swap="">
                {ball.hostCity}
              </dd>
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

        {/* Pista: la banda de abajo es el selector (se toca, se arrastra o se usa con flechas). */}
        <p className={`${styles.hud} ${styles.hint}`} data-enter-side="">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3v9.5M4 8.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={styles.hintMouse}>{t('belt.hintMouse')}</span>
          <span className={styles.hintTouch}>{t('belt.hintTouch')}</span>
        </p>

        <div className={styles.beltArea}>
          <ConveyorBelt
            balls={balls}
            selection={selection}
            live={live}
            reducedMotion={reducedMotion}
            claimTarget={spotRef}
            onPick={(index, piece) => select(index, piece)}
            onHover={(index) => prefetch(balls[index])}
          />
        </div>
      </div>
    </section>
  );
}
