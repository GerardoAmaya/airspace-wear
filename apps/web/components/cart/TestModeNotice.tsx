'use client';

import { AnimatePresence, motion, useMotionValue, useSpring } from 'motion/react';
import { useTranslations } from 'next-intl';
import { type PointerEvent, useEffect, useId, useRef, useState } from 'react';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import styles from './TestModeNotice.module.css';

// Datos de la tarjeta de prueba de Stripe (no son texto de interfaz).
const CARD_NUMBER = '4242 4242 4242 4242';
const CARD_EXPIRY = '12/34';
const CARD_CVC = '123';
// Inclinación máxima hacia el puntero, en grados.
const TILT = { x: 8, y: 12 };

type CopyState = 'copied' | 'failed' | null;

// Copia al portapapeles. Sin la API moderna (contexto inseguro o permiso
// negado) prueba con un textarea temporal y execCommand.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      const done = document.execCommand('copy');
      area.remove();
      return done;
    } catch {
      return false;
    }
  }
}

// Aviso del modo de prueba (sin cobros reales) con la tarjeta de prueba de
// Stripe dibujada como una tarjeta de verdad. Va en el carrito (compacto) y
// en las páginas de pedidos. Al tocarla copia el número y gira para mostrar
// "Número copiado" en el reverso; vuelve sola a los 1.6 s.
export function TestModeNotice({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('Checkout');
  return (
    <aside className={styles.notice} data-compact={compact || undefined} aria-label={t('testModeLabel')}>
      <TestCard />
      <div className={styles.copy}>
        <p className={styles.caption}>{t.rich('testMode', { strong: (chunks) => <strong className={styles.captionLead}>{chunks}</strong> })}</p>
        <p className={styles.hint}>{t('testModeHint')}</p>
      </div>
    </aside>
  );
}

function TestCard() {
  const t = useTranslations('Checkout.testCard');
  const brand = useTranslations('Brand');
  const reduced = useMotionStore((state) => state.reducedMotion);
  const [state, setState] = useState<CopyState>(null);
  // Resultado de la última copia: el reverso lo conserva mientras vuelve.
  const [result, setResult] = useState<'copied' | 'failed'>('copied');
  const timer = useRef<number | undefined>(undefined);
  const descriptionId = useId();

  // Inclinación hacia el puntero: valores de Motion (sin estado de React por
  // cuadro), suavizados con un resorte.
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const spring = { stiffness: 220, damping: 22, mass: 0.6 };
  const rotateX = useSpring(tiltX, spring);
  const rotateY = useSpring(tiltY, spring);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    const done = await copyText(CARD_NUMBER);
    setResult(done ? 'copied' : 'failed');
    setState(done ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState(null), DURATION.cinematic * 1000);
  };

  // Solo con mouse (escritorio) y sin movimiento reducido.
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (reduced || event.pointerType !== 'mouse') return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    tiltX.set(-y * TILT.x * 2);
    tiltY.set(x * TILT.y * 2);
  };
  const onPointerLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  const flipped = state !== null && !reduced;
  const flip = { duration: DURATION.reveal, ease: EASE.snap.bezier };
  const fade = { duration: DURATION.micro };
  const message = result === 'failed' ? t('failed') : t('copied');

  return (
    <>
      <motion.button
        type="button"
        className={styles.card}
        aria-label={t('copy')}
        aria-describedby={descriptionId}
        onClick={onClick}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        whileTap={reduced ? undefined : { scale: 0.97 }}
        transition={{ duration: DURATION.micro, ease: EASE.out.bezier }}
      >
        <motion.span className={styles.tilt} style={reduced ? undefined : { rotateX, rotateY }}>
          <motion.span className={styles.flipper} initial={false} animate={{ rotateY: flipped ? 180 : 0 }} transition={flip}>
            {/* Frente: marca, chip, sin contacto, número y datos. */}
            <span className={`${styles.face} ${styles.front}`} aria-hidden="true">
              <span className={styles.top}>
                <span className={styles.wordmark}>
                  {brand('name')} <span className={styles.wordmarkWear}>{brand('suffix')}</span>
                </span>
                <span className={styles.tag}>{t('tag')}</span>
              </span>
              <span className={styles.middle}>
                <svg className={styles.chip} viewBox="0 0 40 30">
                  <rect x="0.75" y="0.75" width="38.5" height="28.5" rx="5" />
                  <path d="M0.75 10h11.5M0.75 20h11.5M27.75 10h11.5M27.75 20h11.5M12.25 0.75v28.5M27.75 0.75v28.5M12.25 15h15.5" />
                </svg>
                <svg className={styles.contactless} viewBox="0 0 24 24">
                  <path d="M7 8.5a5 5 0 0 1 0 7M11 6a8.5 8.5 0 0 1 0 12M15 3.5a12 12 0 0 1 0 17" />
                </svg>
              </span>
              <span className={styles.number}>{CARD_NUMBER}</span>
              <span className={styles.meta}>
                <span className={styles.field}>
                  <span className={styles.fieldLabel}>{t('expiryLabel')}</span> {CARD_EXPIRY}
                </span>
                <span className={styles.field}>
                  <span className={styles.fieldLabel}>{t('cvcLabel')}</span> {CARD_CVC}
                </span>
              </span>
              {/* Movimiento reducido: sin giro, solo aparece la etiqueta. */}
              <AnimatePresence>
                {reduced && state && (
                  <motion.span className={styles.stamp} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
                    {result === 'copied' && <Check />}
                    {message}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            {/* Reverso: banda magnética y el aviso de copiado. */}
            <span className={`${styles.face} ${styles.back}`} aria-hidden="true">
              <span className={styles.stripe} />
              <span className={styles.backBody}>
                {result === 'failed' ? <span className={styles.backNumber}>{CARD_NUMBER}</span> : <Check />}
                <span className={styles.backText}>{message}</span>
              </span>
            </span>
          </motion.span>
        </motion.span>
      </motion.button>
      <span id={descriptionId} className="visually-hidden">
        {t('description', { number: CARD_NUMBER })}
      </span>
      {/* Región viva sin role="status": el carrito ya tiene el suyo. */}
      <span className="visually-hidden" aria-live="polite" aria-atomic="true" data-copy-status="">
        {state === 'copied' ? t('announceCopied') : state === 'failed' ? t('announceFailed', { number: CARD_NUMBER }) : ''}
      </span>
    </>
  );
}

function Check() {
  return (
    <svg className={styles.check} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" />
      <path d="M7 12.5l3.2 3.2L17 9" />
    </svg>
  );
}
