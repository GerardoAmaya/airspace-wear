'use client';

import { type Locale, STYLIST_LIMITS } from '@airspace/contracts';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, Fragment, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { createScriptedEngine, type RecommendedProduct, type StylistEngine } from '@/components/home/stylist/engine';
import { Link } from '@/i18n/navigation';
import { EASE } from '@/lib/motion/tokens';
import { readPlacement } from './placement';
import { RobotMini } from './Robot';
import { loadStylistContext, type StylistContext } from './stylist-context';
import { askFromPanel, closeStylist, lazyEngine, resetConversation, sharedEngine, type SharedTurn, useStylistStore } from './stylist-store';
import styles from './StylistPanel.module.css';

// Panel del chat del estilista: se despliega desde el robot en la misma
// página (en escritorio, una tarjeta anclada a su esquina; en teléfonos, una
// hoja que sube desde abajo y cubre casi toda la pantalla). No es modal en
// escritorio: la página sigue a la vista y el scroll no se mueve. Escape lo
// cierra y devuelve el foco al robot.
//
// La conversación es la misma que la de la consola de la home
// (stylist-store): lo que se pregunta aquí aparece allá y al revés.

// API pública para el navegador (el estilista es lo único que la web llama
// desde el cliente: la respuesta llega en streaming). Sin ella, el guion.
const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const NO_TURNS: SharedTurn[] = [];

const NARROW = '(max-width: 640px)';
const subscribeNarrow = (callback: () => void) => {
  const query = matchMedia(NARROW);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};

// Divide la respuesta en tramos normales y nombres de producto ([corchetes]).
// Mientras llega en trozos, un corchete abierto sin cerrar se muestra sin él.
function segments(answer: string, streaming: boolean): { text: string; highlight: boolean }[] {
  let text = answer;
  if (streaming) {
    const open = text.lastIndexOf('[');
    if (open > text.lastIndexOf(']')) text = text.slice(0, open) + text.slice(open + 1);
  }
  return text
    .split(/(\[[^\]]+\])/)
    .filter(Boolean)
    .map((part) => (part.startsWith('[') && part.endsWith(']') ? { text: part.slice(1, -1), highlight: true } : { text: part, highlight: false }));
}

const plainText = (answer: string) => answer.replace(/[[\]]/g, '');

export function StylistPanel() {
  const t = useTranslations('StylistBot');
  const home = useTranslations('HomeStylist');
  const locale = useLocale() as Locale;
  const reduced = !!useReducedMotion();
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    () => matchMedia(NARROW).matches,
    () => false,
  );
  const open = useStylistStore((state) => state.open);
  const turns = useStylistStore((state) => (state.locale === locale ? state.turns : NO_TURNS));
  const busy = useStylistStore((state) => state.busy);
  const [context, setContext] = useState<StylistContext | null>(null);
  const [contextFailed, setContextFailed] = useState(false);
  // Del mismo lado que el robot: se lee al abrir (ajuste durante el render,
  // sin efecto). Este componente solo existe en el cliente.
  const [side, setSide] = useState<'left' | 'right'>('right');
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSide(readPlacement()?.side ?? 'right');
  }
  const dialogRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scripted = useRef<StylistEngine | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Los datos (guion, ideas y catálogo) se piden al abrir, si la precarga no
  // los trajo ya.
  useEffect(() => {
    if (!open || context) return;
    let cancelled = false;
    loadStylistContext(locale).then(
      (value) => {
        if (!cancelled) {
          setContext(value);
          setContextFailed(false);
        }
      },
      () => {
        if (!cancelled) setContextFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, context, locale]);

  // Al abrir, el foco entra al panel. Solo se enfoca el campo con mouse o trackpad: en pantallas táctiles abriría el
  // teclado de golpe y taparía las ideas sugeridas.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (matchMedia('(pointer: fine)').matches) inputRef.current?.focus({ preventScroll: true });
      else dialogRef.current?.focus({ preventScroll: true });
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeStylist({ restoreFocus: true });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // El final de la conversación siempre a la vista mientras llega el texto.
  const last = turns.at(-1);
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns.length, last?.answer, last?.products.length, open]);

  // La región en vivo anuncia solo la respuesta final, nunca cada trozo.
  let announcement = '';
  if (last?.status === 'done') {
    announcement = home('announce.reply', { text: plainText(last.answer) });
    if (last.products.length) announcement += ` ${home('announce.products', { list: last.products.map((product) => `${product.name}, ${product.price}`).join('; ') })}`;
  }

  // El motor de la IA es el mismo de la consola de la home (stylist-store).
  const engineFor = (data: StylistContext) =>
    sharedEngine(locale, () =>
      lazyEngine(async () => {
        const { createApiEngine } = await import('@/components/home/stylist/api-engine');
        return createApiEngine({
          apiUrl: PUBLIC_API_URL,
          catalog: data.catalog,
          fallback: createScriptedEngine(data.script, { latencyMs: reduced ? 0 : 700 }),
          messages: { rateLimited: home('errors.rateLimited'), refused: home('errors.refused'), error: home('errors.generic') },
        });
      }),
    );

  // Las ideas sugeridas responden con el guion (igual que en la home): una
  // visita que solo prueba las ideas no gasta en la IA.
  const scriptedFor = (data: StylistContext) => (scripted.current ??= createScriptedEngine(data.script, { latencyMs: reduced ? 0 : 700 }));

  const withContext = async () => {
    if (context) return context;
    try {
      const value = await loadStylistContext(locale);
      setContext(value);
      return value;
    } catch {
      setContextFailed(true);
      return null;
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = inputRef.current;
    const question = input?.value.trim().slice(0, STYLIST_LIMITS.messageChars) ?? '';
    if (!question || !input) return;
    input.value = '';
    const data = await withContext();
    if (!data) {
      input.value = question;
      return;
    }
    void askFromPanel(locale, question, engineFor(data));
  };

  const onIdea = async (id: string) => {
    const data = await withContext();
    const scenario = data?.script.scenarios.find((item) => item.id === id);
    if (!data || !scenario) return;
    void askFromPanel(locale, scenario.question, scriptedFor(data));
  };

  const onReset = () => {
    resetConversation();
    inputRef.current?.focus({ preventScroll: true });
  };

  // Escritorio: una tarjeta que crece desde la esquina del robot. Teléfono:
  // una hoja que sube. Con movimiento reducido, solo un fundido corto.
  const variants = reduced
    ? { hidden: { opacity: 0 }, shown: { opacity: 1 } }
    : narrow
      ? { hidden: { y: '100%' }, shown: { y: 0 } }
      : { hidden: { opacity: 0, scale: 0.92, y: 16 }, shown: { opacity: 1, scale: 1, y: 0 } };
  const transition = reduced ? { duration: 0.15 } : narrow ? { duration: 0.45, ease: EASE.out.bezier } : { type: 'spring' as const, stiffness: 380, damping: 32 };

  return (
    <AnimatePresence>
      {open ? (
        <Fragment key="stylist-panel">
          {/* En teléfonos, un velo detrás de la hoja: tocarlo la cierra. */}
          <motion.div className={styles.scrim} aria-hidden="true" onClick={() => closeStylist()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div
            ref={dialogRef}
            className={styles.panel}
            data-side={side}
            role="dialog"
            aria-modal={narrow ? true : undefined}
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            data-lenis-prevent=""
            variants={variants}
            initial="hidden"
            animate="shown"
            exit="hidden"
            transition={transition}
          >
            <span className={styles.corners} aria-hidden="true" />
            {/* div y no <header>: dentro del diálogo un <header> sería otro "banner" de la página. */}
            <div className={styles.head}>
              <RobotMini thinking={busy} plate={t('plate')} className={styles.headRobot} />
              <div className={styles.headText}>
                <p className={styles.status}>
                  <span className={styles.dot} aria-hidden="true" />
                  {busy ? t('statusThinking') : t('status')}
                </p>
                <h2 id={titleId} className={styles.title}>
                  {t('title')}
                </h2>
                <p id={descriptionId} className={styles.subtitle}>
                  {t('subtitle')}
                </p>
              </div>
              <div className={styles.headTools}>
                {turns.length ? (
                  <button type="button" className={styles.iconButton} onClick={onReset} aria-label={t('clear')} title={t('clear')}>
                    <ResetIcon />
                  </button>
                ) : null}
                <button type="button" className={styles.iconButton} onClick={() => closeStylist({ restoreFocus: true })} aria-label={t('close')} title={t('close')}>
                  <CloseIcon />
                </button>
              </div>
            </div>

            {/* aria-live="off": la región de abajo anuncia solo la respuesta final. */}
            <div ref={logRef} className={styles.log} role="log" aria-live="off" aria-label={t('logLabel')} tabIndex={0}>
              {turns.length === 0 ? (
                <div className={styles.welcome}>
                  <div className={`${styles.row} ${styles.rowStylist}`}>
                    <RobotMini thinking={false} plate={t('plate')} />
                    <p className={styles.bubbleStylist}>{t('welcome')}</p>
                  </div>
                  <p className={styles.hud} id={`${titleId}-ideas`}>
                    {t('suggestionsTitle')}
                  </p>
                  <div className={styles.ideas} role="group" aria-labelledby={`${titleId}-ideas`}>
                    {context
                      ? context.chips.map((chip) => (
                          <button key={chip.id} type="button" className={styles.idea} onClick={() => void onIdea(chip.id)}>
                            {chip.label}
                          </button>
                        ))
                      : contextFailed
                        ? null
                        : [0, 1, 2].map((index) => <span key={index} className={styles.ideaPlaceholder} aria-hidden="true" />)}
                  </div>
                  {contextFailed ? (
                    <p className={styles.notice} role="status">
                      {t('contextError')}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {turns.map((turn) => (
                <TurnView key={turn.id} turn={turn} plate={t('plate')} reduced={reduced} />
              ))}
            </div>

            <div className={styles.foot}>
              <form className={styles.form} onSubmit={(event) => void onSubmit(event)} autoComplete="off">
                <label className="visually-hidden" htmlFor={`${titleId}-input`}>
                  {t('inputLabel')}
                </label>
                <textarea
                  ref={inputRef}
                  id={`${titleId}-input`}
                  className={styles.input}
                  name="message"
                  rows={1}
                  maxLength={STYLIST_LIMITS.messageChars}
                  placeholder={t('placeholder')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button className={styles.send} type="submit" aria-label={t('send')} disabled={busy}>
                  <SendIcon />
                </button>
              </form>
              <p className={styles.disclaimer}>{t('disclaimer')}</p>
            </div>

            <div className="visually-hidden" role="status" aria-live="polite">
              {announcement}
            </div>
          </motion.div>
        </Fragment>
      ) : null}
    </AnimatePresence>
  );
}

const MESSAGE_SPRING = { type: 'spring', stiffness: 380, damping: 26 } as const;

function TurnView({ turn, plate, reduced }: { turn: SharedTurn; plate: string; reduced: boolean }) {
  const t = useTranslations('StylistBot');
  const enter = reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.15 } } : { initial: { opacity: 0, y: 12, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: MESSAGE_SPRING };
  const thinking = turn.status === 'thinking';
  return (
    <>
      <motion.div className={`${styles.row} ${styles.rowYou}`} style={{ transformOrigin: '100% 100%' }} {...enter}>
        <p className={styles.bubbleYou}>
          <span className="visually-hidden">{t('you')}: </span>
          {turn.question}
        </p>
      </motion.div>
      {thinking ? (
        <div className={`${styles.row} ${styles.rowStylist} ${styles.thinking}`}>
          <RobotMini thinking plate={plate} />
          <span>{t('thinking')}</span>
        </div>
      ) : (
        <motion.div className={`${styles.row} ${styles.rowStylist}`} style={{ transformOrigin: '0% 0%' }} {...enter}>
          <RobotMini thinking={false} plate={plate} />
          <div className={styles.answer}>
            <p className={styles.bubbleStylist}>
              <span className="visually-hidden">{t('stylist')}: </span>
              {segments(turn.answer, turn.status === 'streaming').map((segment, index) =>
                segment.highlight ? (
                  <span key={index} className={styles.highlight}>
                    {segment.text}
                  </span>
                ) : (
                  <Fragment key={index}>{segment.text}</Fragment>
                ),
              )}
            </p>
            {turn.products.length ? (
              <ul className={styles.recs} aria-label={t('listLabel')}>
                {turn.products.map((product, index) => (
                  <ProductCard key={product.slug} product={product} index={index} reduced={reduced} />
                ))}
              </ul>
            ) : null}
          </div>
        </motion.div>
      )}
    </>
  );
}

// Tarjeta de una recomendación: solo navega a la ficha si se toca.
function ProductCard({ product, index, reduced }: { product: RecommendedProduct; index: number; reduced: boolean }) {
  const t = useTranslations('StylistBot');
  return (
    <motion.li
      className={styles.card}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0.15 } : { duration: 0.5, delay: 0.08 * index, ease: EASE.out.bezier }}
    >
      {product.poster ? (
        <div className={styles.poster}>
          <ThemedPoster poster={product.poster} alt="" sizes="120px" />
        </div>
      ) : null}
      <div className={styles.cardBody}>
        <p className={styles.cardMeta}>
          <span>{product.brand}</span>
          <span className={styles.match}>{t('match', { percent: product.match })}</span>
        </p>
        <h3 className={styles.cardName}>{product.name}</h3>
        {product.reason ? <p className={styles.cardReason}>{product.reason}</p> : null}
        <p className={styles.cardFoot}>
          <span className={styles.price}>{product.price}</span>
          <Link href={`/products/${product.slug}`} className={styles.view} aria-label={t('viewLabel', { name: product.name })} onClick={() => closeStylist()}>
            {t('view')}
            <ArrowIcon />
          </Link>
        </p>
      </div>
    </motion.li>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 11.5 11.5 4.5M5.5 4.5h6v6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
