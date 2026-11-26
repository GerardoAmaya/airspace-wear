'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { HOME_ANCHORS } from '@/lib/home';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { DURATION, EASE } from '@/lib/motion/tokens';
import styles from './HomeClub.module.css';
import { DIGITS, fadeIn, LETTERS, revealLines, scramble } from './hud-motion';

// "Únete al club": tarjeta de miembro con talón desprendible para escanear
// al pagar (portada de design/prototype/sections/boarding, sin el pie: el
// sitio ya tiene SiteFooter). Al aparecer, la tarjeta llega y se asienta, el
// código de barras se dibuja y los valores se decodifican desde su propio
// texto, que siempre está en el HTML. Las acciones son de demostración: no
// hay cuentas ni se guarda ningún dato.

// Generador pseudoaleatorio determinista (mismo código de barras siempre,
// igual en el servidor y en el cliente).
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text: string) {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619);
  return hash >>> 0;
}

// Barras de 1 a 4 unidades con huecos irregulares y barras guía en los
// extremos. Cada barra es una <line> para poder "dibujarla" con scaleY.
function barcodeBars(seed: string, units = 150) {
  const random = createRandom(hashString(seed));
  const bars: { x: number; width: number }[] = [];
  const guard = (x: number) => {
    bars.push({ x, width: 1 }, { x: x + 2, width: 1 });
    return x + 4;
  };
  let x = guard(0);
  while (x < units - 6) {
    const width = [1, 1, 1, 2, 2, 3, 4][Math.floor(random() * 7)];
    bars.push({ x, width });
    x += width + 1 + Math.floor(random() * 2.2);
  }
  guard(units - 3);
  return bars;
}

const BARCODE_UNITS = 150;
const BARCODE_HEIGHT = 40;

export function ClubSection() {
  const t = useTranslations('HomeClub');
  const brand = useTranslations('Brand');
  const format = useFormatter();
  const sectionRef = useRef<HTMLElement>(null);
  const sinceRef = useRef<HTMLElement>(null);
  const [note, setNote] = useState('');
  const [joined, setJoined] = useState(false);
  const bars = barcodeBars(`${t('stub.numberValue')}-CLUB`, BARCODE_UNITS);

  const onSignup = () => setNote(t('actions.signupNote'));
  const onWaitlist = () => {
    const next = !joined;
    setJoined(next);
    setNote(next ? t('actions.waitlistNote') : t('actions.waitlistLeft'));
  };

  useGSAP(
    (_context, contextSafe) => {
      const section = sectionRef.current;
      if (!section || !contextSafe) return;

      // "Desde": la fecha de hoy, como si la tarjeta se emitiera ahora. Se
      // calcula en el cliente (el HTML trae "Hoy" para no fijar la fecha del
      // prerender).
      if (sinceRef.current) {
        sinceRef.current.textContent = format
          .dateTime(new Date(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
          .replace(/\./g, '')
          .replace(/ de /g, ' ');
      }

      // El punto de la etiqueta solo late mientras la sección está en pantalla.
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) section.dataset.live = '';
        else delete section.dataset.live;
      });
      observer.observe(section);

      const motion = document.documentElement.classList.contains('motion-ok') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!motion) {
        return () => observer.disconnect();
      }

      const select = gsap.utils.selector(section);
      const pass = select('[data-pass]')[0] as HTMLElement;
      const stub = select('[data-stub]')[0] as HTMLElement;
      const groups: gsap.core.Timeline[] = [];
      const cleanups: (() => void)[] = [];
      let cancelled = false;

      // Cada grupo es una entrada de una sola vez. Si el foco del teclado
      // llega antes que el scroll, la entrada se completa al instante.
      const revealGroup = (container: HTMLElement, timeline: gsap.core.Timeline, start: string) => {
        groups.push(timeline);
        ScrollTrigger.create({ trigger: container, start, end: 'max', once: true, onEnter: () => void timeline.play() });
        const finish = () => {
          if (timeline.progress() < 1) timeline.progress(1);
        };
        container.addEventListener('focusin', finish);
        cleanups.push(() => container.removeEventListener('focusin', finish));
        timeline.eventCallback('onComplete', () => {
          if (groups.every((group) => group.progress() === 1)) section.dataset.motion = 'done';
        });
      };

      void document.fonts.ready.then(
        contextSafe(() => {
          if (cancelled) return;

          // Entrada del texto.
          const intro = gsap.timeline({ paused: true, defaults: { ease: EASE.out.gsap, duration: DURATION.reveal } });
          intro
            .add(fadeIn(select('[data-kicker]'), { x: -16 }), 0)
            .add(revealLines(select('[data-title]')[0] as HTMLElement, { stagger: 0.08, duration: 1.1 }), 0.05)
            .add(fadeIn(select('[data-lead]'), { y: 14 }), 0.25);
          revealGroup(select('[data-intro]')[0] as HTMLElement, intro, 'top 82%');

          // La tarjeta llega deslizándose e inclinada y se asienta; luego el
          // talón se sacude, se traza la línea del club, se dibuja el código
          // de barras y los valores se decodifican. El talón, la línea y las
          // barras toman su estado inicial ya (la tarjeta aún está oculta).
          const card = gsap.timeline({ paused: true, defaults: { ease: EASE.out.gsap } });
          card
            .fromTo(
              pass,
              { opacity: 0, y: 120, rotation: -3.5, rotationX: 16, transformPerspective: 1400, transformOrigin: '50% 100%' },
              { opacity: 1, y: 0, rotation: 0, rotationX: 0, duration: 1.5, ease: 'power4.out', immediateRender: false },
              0,
            )
            .fromTo(stub, { rotation: 3, x: 6, transformOrigin: '0% 100%' }, { rotation: 0, x: 0, duration: 1.6, ease: 'elastic.out(1, 0.45)' }, 0.55)
            .add(fadeIn(select('[data-band-item]'), { y: 8, duration: 0.6, stagger: 0.05 }), 0.35)
            .add(gsap.fromTo(select('[data-pass-code]'), { opacity: 0, yPercent: 40 }, { opacity: 1, yPercent: 0, stagger: 0.1, duration: 1, ease: EASE.out.gsap, immediateRender: false }), 0.4)
            .add(fadeIn(select('[data-perk]'), { duration: 0.6 }), 1.1)
            .add(fadeIn(select('[data-action]'), { y: 12, duration: 0.8, stagger: 0.08 }), 0.8)
            .add(fadeIn(select('[data-barcode-code]'), { duration: 0.6 }), 1.2)
            .add(gsap.fromTo(select('[data-path-line]'), { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 1.6, ease: EASE.inOut.gsap }), 0.5)
            .add(
              gsap.fromTo(select('[data-bar]'), { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 0.5, stagger: 0.008, ease: EASE.out.gsap }),
              0.65,
            );
          select('[data-decode]').forEach((element: HTMLElement, index: number) => {
            card.add(scramble(element, element.textContent?.trim() ?? '', { duration: 0.9, chars: LETTERS + DIGITS }), 0.55 + index * 0.05);
          });
          revealGroup(select('[data-pass-stage]')[0] as HTMLElement, card, 'top 78%');

          // Talón a punto de rasgarse: solo con puntero fino y diseño horizontal.
          const canHover = matchMedia('(hover: hover) and (pointer: fine)');
          const horizontal = matchMedia('(min-width: 861px)');
          const onEnter = contextSafe(() => {
            if (!canHover.matches || !horizontal.matches || card.isActive()) return;
            gsap.to(stub, { rotation: 3.2, x: 6, y: -2, transformOrigin: '0% 100%', duration: 0.7, ease: EASE.out.gsap, overwrite: 'auto' });
          });
          const onLeave = contextSafe(() => {
            if (!canHover.matches || !horizontal.matches) return;
            gsap.to(stub, { rotation: 0, x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.5)', overwrite: 'auto' });
          });
          pass.addEventListener('pointerenter', onEnter);
          pass.addEventListener('pointerleave', onLeave);
          cleanups.push(() => {
            pass.removeEventListener('pointerenter', onEnter);
            pass.removeEventListener('pointerleave', onLeave);
          });
        }),
      );

      return () => {
        cancelled = true;
        observer.disconnect();
        cleanups.forEach((cleanup) => cleanup());
      };
    },
    { scope: sectionRef },
  );

  // tabIndex -1: un salto de ancla (#estilista, #club) enfoca la sección; si el
  // HTML ya lo trae, no hay desajuste al hidratar.
  return (
    <section ref={sectionRef} id={HOME_ANCHORS.club} className={styles.section} aria-labelledby="club-title" data-motion="pending" tabIndex={-1}>
      <div className={styles.intro} data-intro="">
        <div className={styles.introHead}>
          <p className={styles.kicker} data-kicker="" data-enter="">
            <span className={styles.dot} aria-hidden="true" />
            {t('kicker')}
          </p>
          <h2 id="club-title" className={styles.title} data-title="" data-enter="">
            {t('title')}
          </h2>
        </div>
        <p className={styles.lead} data-lead="" data-enter="">
          {t('lead')}
        </p>
      </div>

      <div className={styles.stage} data-pass-stage="">
        <article className={styles.pass} data-pass="" data-enter="" aria-labelledby="club-card-title">
          <div className={styles.main}>
            <div className={styles.band}>
              <span className={styles.bandBrand} aria-hidden="true" data-band-item="" data-enter="">
                {brand('name')}
                <span>{brand('suffix')}</span>
              </span>
              <h3 className={styles.bandTitle} id="club-card-title" data-band-item="" data-enter="">
                {t('cardTitle')}
              </h3>
            </div>

            <div className={styles.body}>
              <div className={styles.club}>
                <div className={styles.clubName}>
                  <span className={styles.label}>{t('clubLabel')}</span>
                  <span className={styles.clubTitle} data-pass-code="" data-enter="">
                    {t('clubName')}
                  </span>
                  <svg className={styles.clubLine} viewBox="0 0 400 8" preserveAspectRatio="none" aria-hidden="true">
                    <line className={styles.clubTrack} x1="0" y1="4" x2="392" y2="4" />
                    <line className={styles.clubStroke} data-path-line="" x1="0" y1="4" x2="392" y2="4" />
                    <circle cx="395" cy="4" r="3" />
                  </svg>
                  <span className={styles.perk} data-perk="" data-enter="">
                    {t('perk')}
                  </span>
                </div>
                <div className={styles.season}>
                  <span className={styles.label}>{t('seasonLabel')}</span>
                  <span className={styles.seasonNumber} data-pass-code="" data-enter="">
                    {t('season')}
                  </span>
                </div>
              </div>

              <dl className={styles.fields}>
                <div className={styles.field}>
                  <dt className={styles.label}>{t('fields.member')}</dt>
                  <dd className={styles.value} data-decode="">
                    {t('fields.memberValue')}
                  </dd>
                </div>
                <div className={styles.field}>
                  <dt className={styles.label}>{t('fields.since')}</dt>
                  <dd ref={sinceRef} className={styles.value} data-decode="">
                    {t('fields.sinceFallback')}
                  </dd>
                </div>
                <div className={styles.field}>
                  <dt className={styles.label}>{t('fields.size')}</dt>
                  <dd className={styles.value} data-decode="">
                    {t('fields.sizeValue')}
                  </dd>
                </div>
              </dl>

              <div className={styles.actions}>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} data-action="" data-enter="" onClick={onSignup}>
                  {t('actions.signup')}
                  <ArrowIcon />
                </button>
                <button type="button" className={`${styles.btn} ${styles.btnGhost}`} data-action="" data-enter="" aria-pressed={joined} onClick={onWaitlist}>
                  {joined ? <CheckIcon /> : null}
                  {joined ? t('actions.waitlistJoined') : t('actions.waitlist')}
                </button>
                <p className={styles.note} role="status" aria-live="polite">
                  {note}
                </p>
              </div>
            </div>
          </div>

          <div className={styles.stub} data-stub="">
            <div className={`${styles.band} ${styles.bandStub}`}>
              <span className={styles.bandTitle} data-band-item="" data-enter="">
                {t('stub.title')}
              </span>
            </div>
            <div className={styles.stubBody}>
              <dl className={styles.stubFields}>
                <div className={styles.field}>
                  <dt className={styles.label}>{t('stub.number')}</dt>
                  <dd className={`${styles.value} ${styles.code}`} data-decode="">
                    {t('stub.numberValue')}
                  </dd>
                </div>
              </dl>
              <p className={styles.stubNote}>{t('stub.note')}</p>
              <div className={styles.barcode}>
                <svg className={styles.barcodeSvg} viewBox={`0 0 ${BARCODE_UNITS} ${BARCODE_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
                  <g stroke="currentColor">
                    {bars.map((bar) => (
                      <line key={bar.x} data-bar="" x1={bar.x + bar.width / 2} y1="0" x2={bar.x + bar.width / 2} y2={BARCODE_HEIGHT} strokeWidth={bar.width} />
                    ))}
                  </g>
                </svg>
                <p className={styles.barcodeCode} aria-hidden="true" data-barcode-code="" data-enter="">
                  {t('stub.code')}
                </p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h9M8.5 4 12.5 8l-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3 8.5 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
