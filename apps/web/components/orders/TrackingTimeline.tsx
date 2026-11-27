'use client';

import { type Tracking, TRACKING_STEP_MS } from '@airspace/contracts';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { LocalTime } from './LocalTime';
import styles from './orders.module.css';

// Línea de tiempo del envío simulado (Pagado, Preparando, Enviado, En camino,
// Entregado) con el estilo HUD del sitio. Los datos vienen calculados de la
// API (un paso cada 5 minutos desde el pago); aquí solo se muestran:
// - al entrar a la vista (una vez), GSAP dibuja la línea tramo a tramo hasta
//   el paso actual y enciende cada punto alcanzado (transform y opacidad);
//   con un paso nuevo, se dibuja solo el tramo nuevo;
// - el paso actual resaltado, con un pulso suave (CSS) mientras está a la
//   vista y ya dibujado; fuera de pantalla se pausa, y con movimiento
//   reducido no hay ni dibujo ni pulso (estado final directo);
// - una barra de progreso hacia el siguiente paso, por tiempo (no por
//   scroll): una transición CSS lineal de transform hasta la hora estimada;
// - al llegar la hora del siguiente paso, se piden los datos otra vez.
export function TrackingTimeline({ tracking, trackingNumber }: { tracking: Tracking; trackingNumber: string | null }) {
  const t = useTranslations('Orders');
  const format = useFormatter();
  const router = useRouter();
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const currentIndex = tracking.steps.findIndex((step) => step.key === tracking.current);
  const delivered = tracking.nextAt === null;
  const next = delivered ? null : tracking.steps[currentIndex + 1];
  // Último tramo ya dibujado (-1: ninguno). Vive en un ref: no es estado de UI.
  const drawnTo = useRef(-1);
  const root = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      const section = root.current;
      if (!section) return;
      const fills = Array.from(section.querySelectorAll<HTMLElement>('[data-fill]'));
      const nodes = Array.from(section.querySelectorAll<HTMLElement>('[data-node]'));
      // Tramos llenos: hasta el paso actual (todos al entregar).
      const target = delivered ? fills.length - 1 : currentIndex - 1;
      const motionOk = document.documentElement.classList.contains('motion-ok');
      const finish = () => {
        drawnTo.current = target;
        section.dataset.drawn = '';
      };
      if (!motionOk) {
        gsap.set(fills, { '--draw': (index: number) => (index <= target ? 1 : 0) });
        finish();
        return;
      }
      const draw = () => {
        const from = drawnTo.current + 1;
        const timeline = gsap.timeline({ onComplete: finish });
        // Los tramos ya dibujados quedan llenos sin animar.
        fills.forEach((fill, index) => {
          if (index < from) gsap.set(fill, { '--draw': index <= target ? 1 : 0 });
        });
        if (from === 0) timeline.fromTo(nodes[0]!, { scale: 0.4 }, { scale: 1, duration: DURATION.ui, ease: EASE.snap.gsap });
        for (let index = from; index <= target; index++) {
          timeline.fromTo(fills[index]!, { '--draw': 0 }, { '--draw': 1, duration: DURATION.ui, ease: EASE.inOut.gsap }, index === from ? undefined : '<0.22');
          const node = nodes[index + 1];
          if (node) timeline.fromTo(node, { scale: 0.4 }, { scale: 1, duration: DURATION.ui, ease: EASE.snap.gsap }, '<0.2');
        }
        if (timeline.duration() === 0) {
          timeline.kill();
          finish();
        }
      };
      // Primera vez: al entrar a la vista (una sola vez, sin scrub). Un paso
      // nuevo con la sección ya dibujada: se dibuja enseguida.
      if (drawnTo.current >= 0) {
        draw();
        return;
      }
      fills.forEach((fill) => gsap.set(fill, { '--draw': 0 }));
      const trigger = ScrollTrigger.create({ trigger: section, start: 'top 85%', end: 'max', once: true, onEnter: draw });
      return () => trigger.kill();
    },
    { scope: root, dependencies: [currentIndex, delivered] },
  );

  // Diferencia entre el reloj del servidor y el del navegador (al montar).
  const [skew] = useState(() => new Date(tracking.computedAt).getTime() - Date.now());
  // Progreso hacia el siguiente paso. El primer valor usa la hora del
  // servidor (el HTML y la hidratación coinciden); se recalcula con la hora
  // del navegador cada vez que la sección entra a la vista. Con datos nuevos
  // (otro paso) el componente se monta de nuevo (key en OrderView).
  const [segment, setSegment] = useState(() => progressOf(tracking, new Date(tracking.computedAt).getTime(), 0));
  useEffect(() => {
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      const visible = Boolean(entry?.isIntersecting);
      setInView(visible);
      if (visible) setSegment((previous) => progressOf(tracking, Date.now() + skew, previous.key + 1));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, tracking, skew]);

  // Al pasar la hora del siguiente paso, datos nuevos del servidor (una vez
  // por paso; si la pestaña está oculta, al volver).
  useEffect(() => {
    if (!tracking.nextAt) return;
    const wait = Math.max(0, new Date(tracking.nextAt).getTime() - (Date.now() + skew)) + 800;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') router.refresh();
      }, wait);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() + skew >= new Date(tracking.nextAt!).getTime()) router.refresh();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tracking.nextAt, skew, router]);

  const barStyle = { '--from': segment.fraction, '--remaining': `${segment.remainingMs}ms` } as CSSProperties;

  return (
    <section
      ref={(node) => {
        root.current = node;
        setElement(node);
      }}
      className={styles.tracking}
      aria-labelledby="tracking-title"
      data-live={inView || undefined}
    >
      <header className={styles.trackingHead}>
        <h2 id="tracking-title" className={styles.sectionTitle}>
          {t('trackingTitle')}
        </h2>
        {trackingNumber && (
          <p className={styles.trackingNumber}>
            <span className={styles.hud}>{t('trackingNumber')}</span>
            <span className={styles.mono}>{trackingNumber}</span>
          </p>
        )}
      </header>

      <ol className={styles.steps} aria-label={t('trackingLabel')}>
        {tracking.steps.map((step, index) => (
          <li key={step.key} className={styles.step} data-state={step.state} aria-current={index === currentIndex && !delivered ? 'step' : undefined}>
            <span className={styles.node} data-node aria-hidden="true" />
            {index < tracking.steps.length - 1 && (
              <span className={styles.link} aria-hidden="true">
                <span className={styles.linkFill} data-fill />
              </span>
            )}
            <span className={styles.stepIndex} aria-hidden="true">
              {format.number(index + 1, { minimumIntegerDigits: 2 })}
            </span>
            <span className={styles.stepLabel}>{t(`stage.${step.key}`)}</span>
            <span className={styles.stepTime}>
              {step.state === 'upcoming' ? (
                t.rich('eta', { time: () => <LocalTime iso={step.at} format="time" /> })
              ) : (
                <LocalTime iso={step.at} format="time" />
              )}
            </span>
            <span className="visually-hidden">{t(`stepState.${step.state}`)}</span>
          </li>
        ))}
      </ol>

      <div className={styles.progressRow}>
        {next && tracking.nextAt ? (
          <>
            <p className={styles.progressText}>
              {t.rich('nextStep', {
                step: t(`stage.${next.key}`),
                time: () => <LocalTime iso={tracking.nextAt!} format="time" />,
              })}
            </p>
            <div className={styles.bar} aria-hidden="true">
              <span key={`${tracking.current}:${segment.key}`} className={styles.barFill} style={barStyle} />
            </div>
          </>
        ) : (
          <p className={styles.progressText} data-done>
            {t('deliveredNote')}
          </p>
        )}
      </div>
    </section>
  );
}

// Fracción recorrida del paso actual y lo que falta (ms). key cambia en
// cada cálculo para reiniciar la animación CSS desde la fracción nueva. El
// primer cálculo usa la hora del servidor: el HTML y la hidratación coinciden.
function progressOf(tracking: Tracking, now: number, key: number): { fraction: number; remainingMs: number; key: number } {
  if (!tracking.nextAt) return { fraction: 1, remainingMs: 0, key };
  const end = new Date(tracking.nextAt).getTime();
  const remainingMs = Math.max(0, end - now);
  const fraction = Math.min(1, Math.max(0, 1 - remainingMs / TRACKING_STEP_MS));
  return { fraction, remainingMs, key };
}
