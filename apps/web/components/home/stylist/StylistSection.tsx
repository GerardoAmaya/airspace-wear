'use client';

import type { Locale } from '@airspace/contracts';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { doneTurns, lazyEngine, recordTurn, sharedEngine, useStylistStore } from '@/components/stylist-bot/stylist-store';
import { Link } from '@/i18n/navigation';
import { HOME_ANCHORS } from '@/lib/home';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { DURATION, EASE } from '@/lib/motion/tokens';
import type { CatalogEntry } from './api-engine';
import { createScriptedEngine, type RecommendedProduct, type StylistEngine, type StylistScript } from './engine';
import styles from './HomeStylist.module.css';
import { countTo, fadeIn, LETTERS, revealLines, scramble } from './hud-motion';

// Consola del estilista (cliente). Reproduce cada consulta así:
// 1. El mensaje del visitante entra (letra por letra si vino de una idea).
// 2. Se envía al motor (engine.ts) y la respuesta llega en trozos; una
//    máquina de escribir la muestra palabra por palabra.
// 3. Al terminar llegan las tarjetas con productos reales.
// La región en vivo anuncia solo la respuesta final, nunca cada letra. Con
// movimiento reducido todo aparece de inmediato.

const WAVE_BARS = 34;
const prefersReduced = () => !document.documentElement.classList.contains('motion-ok') || matchMedia('(prefers-reduced-motion: reduce)').matches;

type Phase = 'typing' | 'replying' | 'done';
type StatusKey = 'idle' | 'listening' | 'reading' | 'replying';
type Mode = 'idle' | 'rx' | 'tx';

interface Turn {
  key: number;
  question: string;
  // typed: la pregunta se escribe letra por letra (ideas sugeridas).
  typed: boolean;
  // animated: el texto lo llena la máquina de escribir, no React.
  animated: boolean;
  time: string | null;
  phase: Phase;
  answer: string;
  products: RecommendedProduct[];
  // record: la consulta la hizo el visitante (no la demostración automática)
  // y se anota en la conversación compartida con el panel del robot.
  record: boolean;
}

interface Token {
  word: string;
  highlight: boolean;
  space: boolean;
}

// Divide la respuesta en palabras. Los tramos entre [corchetes] se marcan
// como resaltados y la puntuación queda pegada a su palabra.
function tokenize(answer: string): Token[] {
  const tokens: Token[] = [];
  let pendingSpace = false;
  for (const part of answer.split(/(\[[^\]]+\])/)) {
    if (!part) continue;
    const highlight = part.startsWith('[') && part.endsWith(']');
    const text = highlight ? part.slice(1, -1) : part;
    for (const piece of text.split(/(\s+)/)) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) {
        pendingSpace = true;
        continue;
      }
      tokens.push({ word: piece, highlight, space: tokens.length > 0 && pendingSpace });
      pendingSpace = false;
    }
  }
  return tokens;
}

const plainText = (answer: string) => answer.replace(/[[\]]/g, '');

// Generador pseudoaleatorio determinista: el ritmo de tecleo es "humano"
// pero igual en cada reproducción.
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

// Barra de forma de onda: un único callback del ticker escribe scaleY en
// cada barra (solo escrituras). "level" sube cuando el estilista responde.
function createWave(bars: HTMLElement[], reduced: boolean) {
  const setters = bars.map((bar) => gsap.quickSetter(bar, 'scaleY') as (value: number) => void);
  const envelope = bars.map((_, index) => Math.pow(Math.sin((Math.PI * (index + 0.5)) / bars.length), 0.8));
  const state = { level: 0.08 };
  let elapsed = 0;
  let running = false;
  const render = () => {
    for (let index = 0; index < bars.length; index++) {
      const noise = Math.abs(Math.sin(elapsed * 8.7 + index * 0.83) * Math.cos(elapsed * 3.9 + index * 0.29)) * 0.8 + Math.abs(Math.sin(elapsed * 15.3 + index * 1.7)) * 0.35;
      setters[index](0.06 + state.level * envelope[index] * Math.min(1, noise));
    }
  };
  const tick = (_time: number, deltaTime: number) => {
    elapsed += deltaTime / 1000;
    render();
  };
  if (reduced) {
    // Estado estático: una silueta de onda serena.
    bars.forEach((_, index) => setters[index](0.12 + 0.5 * envelope[index] * Math.abs(Math.sin(index * 0.9))));
    return { speak() {}, start() {}, stop() {} };
  }
  render();
  return {
    speak(level: number) {
      gsap.to(state, { level, duration: level > 0.3 ? 0.5 : 0.9, ease: 'power2.out', overwrite: true });
    },
    start() {
      if (running) return;
      running = true;
      gsap.ticker.add(tick);
    },
    stop() {
      running = false;
      gsap.ticker.remove(tick);
    },
  };
}

// Máquina de escribir: recibe el texto en trozos (como el streaming de la
// IA) y lo muestra palabra por palabra. Solo escribe palabras completas y
// nunca corta un nombre resaltado a la mitad.
function createTyper(target: HTMLElement, { add, random, onFirstWord, highlightClass }: { add: (fn: () => void) => void; random: () => number; onFirstWord: () => void; highlightClass: string }) {
  let buffer = '';
  let queued = 0;
  let ended = false;
  let running = false;
  let started = false;
  let onDone: (() => void) | null = null;
  const queue: Token[] = [];

  const step = () => {
    const token = queue.shift();
    if (!token) {
      running = false;
      if (ended) onDone?.();
      return;
    }
    if (!started) {
      started = true;
      onFirstWord();
    }
    if (token.space) target.append(' ');
    const word = document.createElement('span');
    word.textContent = token.word;
    if (token.highlight) word.className = highlightClass;
    target.append(word);
    const last = token.word.at(-1);
    const delay = 0.032 + random() * 0.04 + (last === ',' || last === ':' ? 0.12 : 0) + (last === '.' || last === '!' || last === '?' ? 0.26 : 0);
    add(() => {
      gsap.fromTo(word, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.5, ease: EASE.out.gsap, clearProps: 'transform' });
      gsap.delayedCall(delay, step);
    });
  };

  const enqueue = () => {
    let usable = buffer;
    if (!ended) {
      const cut = usable.search(/\s\S*$/);
      usable = cut >= 0 ? usable.slice(0, cut) : '';
      const open = usable.lastIndexOf('[');
      if (open > usable.lastIndexOf(']')) usable = usable.slice(0, open);
    }
    const tokens = tokenize(usable);
    for (let index = queued; index < tokens.length; index++) queue.push(tokens[index]);
    queued = Math.max(queued, tokens.length);
    if (!running) {
      running = true;
      step();
    }
  };

  return {
    text: () => buffer,
    push(text: string) {
      buffer += text;
      enqueue();
    },
    end(callback: () => void) {
      ended = true;
      onDone = callback;
      enqueue();
    },
  };
}

// Ancho de pantalla angosto (texto de ayuda corto en el campo).
const NARROW = '(max-width: 600px)';
const subscribeNarrow = (callback: () => void) => {
  const query = matchMedia(NARROW);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};

interface Runtime {
  count: number;
  interacted: boolean;
  abort: AbortController | null;
  ctx: gsap.Context | null;
  wave: ReturnType<typeof createWave> | null;
  scripted: StylistEngine | null;
  statusTween: gsap.core.Tween | null;
  stampTween: gsap.core.Tween | null;
  intro: gsap.core.Timeline | null;
}

// API pública para el navegador (el estilista es lo único que la web llama
// desde el cliente: la respuesta llega en streaming). Sin ella, el guion.
const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

export function StylistSection({
  script,
  chips,
  modelCount,
  catalog,
}: {
  script: StylistScript;
  chips: { id: string; label: string }[];
  modelCount: number;
  catalog: Record<string, CatalogEntry>;
}) {
  const t = useTranslations('HomeStylist');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    () => matchMedia(NARROW).matches,
    () => false,
  );

  const sectionRef = useRef<HTMLElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const stampRef = useRef<HTMLSpanElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const youRef = useRef<HTMLDivElement>(null);
  const typedRef = useRef<HTMLSpanElement>(null);
  const sentRef = useRef<HTMLSpanElement>(null);
  const replyRef = useRef<HTMLDivElement>(null);
  const replyTextRef = useRef<HTMLParagraphElement>(null);
  const thinkingRef = useRef<HTMLSpanElement>(null);
  const recsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const runtime = useRef<Runtime>({ count: 1, interacted: false, abort: null, ctx: null, wave: null, scripted: null, statusTween: null, stampTween: null, intro: null });

  // Primer intercambio ya resuelto en el HTML: legible sin JS y con
  // movimiento reducido. Con movimiento, la entrada lo vuelve a reproducir.
  // Si en esta visita ya se habló con el estilista (desde el panel del robot
  // en otra página), la consola muestra la última consulta en vez del guion.
  const first = script.scenarios[0];
  const [turn, setTurn] = useState<Turn | null>(() => {
    const last = doneTurns(locale).at(-1);
    if (last) return { key: 1, question: last.question, typed: false, animated: false, time: null, phase: 'done', answer: last.answer, products: last.products, record: false };
    return first ? { key: 1, question: first.question, typed: false, animated: false, time: null, phase: 'done', answer: first.answer, products: first.products, record: false } : null;
  });
  const [active, setActive] = useState<string | null>(first?.id ?? null);
  const [announcement, setAnnouncement] = useState('');

  // ---------- Estado de la consola (escrito en el DOM, sin re-render) ----------

  // Números de dos cifras (01, 02...) con el formateador del idioma, no a mano.
  const pad = (value: number) => format.number(value, { minimumIntegerDigits: 2, useGrouping: false });
  const clock = () => format.dateTime(new Date(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });

  const setMode = (mode: Mode) => {
    if (consoleRef.current) consoleRef.current.dataset.mode = mode;
  };

  const setStatus = (key: StatusKey) => {
    const element = statusRef.current;
    if (!element) return;
    const text = t(`status.${key}`);
    runtime.current.statusTween?.kill();
    if (prefersReduced() || element.textContent === text) {
      element.textContent = text;
      return;
    }
    runtime.current.statusTween = scramble(element, text, { duration: 0.5, chars: LETTERS });
  };

  const setStamp = (text: string) => {
    const element = stampRef.current;
    if (!element) return;
    runtime.current.stampTween?.kill();
    if (prefersReduced()) {
      element.textContent = text;
      return;
    }
    runtime.current.stampTween = scramble(element, text, { duration: 0.6, chars: '0123456789' });
  };

  const announce = (answer: string, products: RecommendedProduct[]) => {
    let message = t('announce.reply', { text: plainText(answer) });
    if (products.length) message += ` ${t('announce.products', { list: products.map((product) => `${product.name}, ${product.price}`).join('; ') })}`;
    setAnnouncement(message);
  };

  // IA real (fase 5) con el guion como respaldo si no está disponible. El
  // motor de la API (con los esquemas zod que validan el stream) se carga al
  // primer mensaje, no con la home.
  // El motor es el mismo que usa el panel del robot (stylist-store): la IA
  // recuerda lo que se habló en cualquiera de los dos.
  const engine = () =>
    sharedEngine(locale, () =>
      lazyEngine(async () => {
        const { createApiEngine } = await import('./api-engine');
        return createApiEngine({
          apiUrl: PUBLIC_API_URL,
          catalog,
          fallback: createScriptedEngine(script, { latencyMs: prefersReduced() ? 0 : 700 }),
          messages: { rateLimited: t('errors.rateLimited'), refused: t('errors.refused'), error: t('errors.generic') },
        });
      }),
    );

  // Las ideas sugeridas (y la demostración automática) responden con el guion:
  // así una visita sin preguntas propias no gasta en la IA. Solo lo que el
  // visitante escribe va a la IA real.
  const scripted = () => (runtime.current.scripted ??= createScriptedEngine(script, { latencyMs: prefersReduced() ? 0 : 700 }));
  const engineFor = (fromIdea: boolean) => (fromIdea ? scripted() : engine());

  // ---------- Una consulta ----------

  const ask = (question: string, typed: boolean, record = true) => {
    const rt = runtime.current;
    rt.abort?.abort();
    rt.ctx?.kill();
    const controller = new AbortController();
    rt.abort = controller;
    rt.count += 1;
    const key = rt.count;
    const time = clock();
    setAnnouncement('');
    setStamp(`${t('console.stamp', { number: pad(key) })} · ${time}`);

    if (prefersReduced()) {
      // Sin animación: se espera la respuesta completa y se muestra de una vez.
      void (async () => {
        let answer = '';
        const products: RecommendedProduct[] = [];
        for await (const event of engineFor(typed).ask(question, { locale, signal: controller.signal })) {
          if (event.type === 'text') answer += event.text;
          else if (event.type === 'products') products.push(...event.products);
        }
        if (controller.signal.aborted) return;
        if (record) recordTurn(locale, { question, answer, products });
        setTurn({ key, question, typed: false, animated: false, time, phase: 'done', answer, products, record });
        setMode('idle');
        setStatus('idle');
        announce(answer, products);
      })();
      return;
    }

    const ctx = gsap.context(() => {});
    rt.ctx = ctx;
    rt.wave?.speak(0.08);
    const start = () => {
      if (!controller.signal.aborted) setTurn({ key, question, typed, animated: true, time, phase: 'typing', answer: '', products: [], record });
    };
    // Despeja la consulta anterior antes de mostrar la nueva.
    const previous = threadRef.current ? Array.from(threadRef.current.children) : [];
    if (previous.length) ctx.add(() => gsap.to(previous, { opacity: 0, y: -14, duration: 0.32, ease: 'power2.in', stagger: 0.04, onComplete: start }));
    else start();
  };

  const playScenario = (index: number, record = true) => {
    const scenario = script.scenarios[index];
    if (!scenario) return;
    setActive(scenario.id);
    ask(scenario.question, true, record);
  };

  // Fase 1: el mensaje del visitante entra y, si vino de una idea, se escribe
  // letra por letra con un ritmo irregular.
  const playQuestion = (current: Turn) => {
    const rt = runtime.current;
    const you = youRef.current;
    const typedEl = typedRef.current;
    if (!you || !typedEl) return;
    if (logRef.current) logRef.current.scrollTop = 0;
    setMode('rx');
    setStatus(current.typed ? 'listening' : 'reading');
    const random = createRandom(current.question.length * 7919 + current.key);
    const timeline = gsap.timeline({ defaults: { ease: EASE.out.gsap } });
    timeline.fromTo(you, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6 });
    if (current.typed) {
      typedEl.textContent = '';
      timeline.addLabel('typing', '+=0.15');
      let offset = 0;
      for (let index = 1; index <= current.question.length; index++) {
        const character = current.question[index - 1];
        offset += 0.022 + random() * 0.03 + (character === ' ' ? 0.02 : 0) + (/[,.]/.test(character) ? 0.12 : 0);
        timeline.call(() => void (typedEl.textContent = current.question.slice(0, index)), undefined, `typing+=${offset}`);
      }
      timeline.addLabel('sent', `typing+=${offset + 0.25}`);
    } else {
      timeline.addLabel('sent', '+=0.1');
    }
    timeline.call(() => {
      if (rt.abort?.signal.aborted) return;
      setTurn((previous) => (previous?.key === current.key ? { ...previous, phase: 'replying' } : previous));
    }, undefined, 'sent');
  };

  // Fase 2: el estilista "piensa" y responde en streaming.
  const playReply = (current: Turn) => {
    const rt = runtime.current;
    const ctx = rt.ctx;
    const signal = rt.abort?.signal;
    const textEl = replyTextRef.current;
    if (!ctx || !signal || !textEl) return;
    setMode('tx');
    setStatus('replying');
    rt.wave?.speak(1);
    if (sentRef.current) gsap.fromTo(sentRef.current, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.4, ease: EASE.out.gsap });
    if (replyRef.current) gsap.fromTo(replyRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, delay: 0.25, ease: EASE.out.gsap });

    const typer = createTyper(textEl, {
      add: (fn) => {
        if (!signal.aborted) ctx.add(fn);
      },
      random: createRandom(current.question.length * 104729 + current.key),
      highlightClass: styles.highlight,
      onFirstWord: () => {
        if (thinkingRef.current) thinkingRef.current.style.display = 'none';
      },
    });
    const products: RecommendedProduct[] = [];
    const finish = () => {
      if (signal.aborted) return;
      const answer = typer.text();
      if (current.record) recordTurn(locale, { question: current.question, answer, products });
      rt.wave?.speak(0.08);
      announce(answer, products);
      if (!products.length) {
        setMode('idle');
        setStatus('idle');
      }
      setTurn((previous) => (previous?.key === current.key ? { ...previous, phase: 'done', answer, products } : previous));
    };
    void (async () => {
      try {
        for await (const event of engineFor(current.typed).ask(current.question, { locale, signal })) {
          if (signal.aborted) return;
          if (event.type === 'text') typer.push(event.text);
          else if (event.type === 'products') products.push(...event.products);
          else typer.end(finish);
        }
      } catch {
        // Consulta interrumpida por otra: no hay nada que hacer.
      }
    })();
  };

  // Fase 3: las tarjetas entran, el medidor se llena y el porcentaje cuenta.
  const playCards = (current: Turn) => {
    const recs = recsRef.current;
    if (!recs || !current.products.length) return;
    const cards = Array.from(recs.children);
    const timeline = gsap.timeline({
      onComplete: () => {
        setMode('idle');
        setStatus('idle');
      },
    });
    timeline.fromTo(cards, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: DURATION.reveal, stagger: 0.12, ease: EASE.out.gsap }, 0);
    recs.querySelectorAll<HTMLElement>('[data-meter]').forEach((fill, index) => {
      timeline.fromTo(fill, { scaleX: 0 }, { scaleX: current.products[index].match / 100, duration: 1.4, ease: EASE.inOut.gsap }, index * 0.12);
    });
    recs.querySelectorAll<HTMLElement>('[data-match]').forEach((element, index) => {
      timeline.add(countTo(element, Number(element.dataset.match), { duration: 1.2 }), 0.2 + index * 0.12);
    });
  };

  // Cada cambio de fase de una consulta animada arranca su parte (antes de
  // pintar, así los estados iniciales nunca parpadean).
  useLayoutEffect(() => {
    const ctx = runtime.current.ctx;
    if (!turn?.animated || !ctx) return;
    if (turn.phase === 'typing') ctx.add(() => playQuestion(turn));
    else if (turn.phase === 'replying') ctx.add(() => playReply(turn));
    else ctx.add(() => playCards(turn));
    // Solo reacciona a la consulta y a su fase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn]);

  // ---------- Entrada, bucles y guion automático ----------

  useGSAP(
    (_context, contextSafe) => {
      const section = sectionRef.current;
      const consoleEl = consoleRef.current;
      if (!section || !consoleEl || !contextSafe) return;
      const rt = runtime.current;
      const motion = !prefersReduced();
      const bars = waveRef.current ? (Array.from(waveRef.current.children) as HTMLElement[]) : [];
      rt.wave = createWave(bars, !motion);

      // Los bucles (onda, radar, cursor, puntos) solo corren en pantalla.
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          section.dataset.live = '';
          rt.wave?.start();
        } else {
          delete section.dataset.live;
          rt.wave?.stop();
        }
      });
      observer.observe(section);

      let cancelled = false;
      let focusedEarly = false;
      const onFocusIn = (event: FocusEvent) => {
        const target = event.target as Element | null;
        if (target?.closest('[data-chip], form')) rt.interacted = true;
        if (!rt.intro) focusedEarly = true;
        else if (rt.intro.progress() < 1) rt.intro.progress(1);
      };

      // Con una conversación ya empezada (en el panel del robot), la consola
      // la continúa: ni se borra ni arranca la demostración automática.
      const resumed = doneTurns(locale).length > 0;
      if (resumed) rt.interacted = true;
      if (motion) {
        // El primer intercambio se reproduce en vivo al entrar.
        if (!resumed) {
          rt.count = 0;
          setTurn(null);
          setActive(null);
          if (stampRef.current) stampRef.current.textContent = `${t('console.stamp', { number: pad(0) })} · --:--`;
        }
        section.addEventListener('focusin', onFocusIn);

        void document.fonts.ready.then(
          contextSafe(() => {
            if (cancelled) return;
            const select = gsap.utils.selector(section);
            const title = select('[data-title]')[0] as HTMLElement;
            const online = select('[data-online]')[0] as HTMLElement;
            const counter = select('[data-count]')[0] as HTMLElement;
            const counterState = { value: 0 };
            const intro = gsap.timeline({
              paused: true,
              defaults: { ease: EASE.out.gsap, duration: DURATION.reveal },
              onComplete: () => {
                section.dataset.motion = 'done';
              },
            });
            intro
              .add(fadeIn(select('[data-kicker]'), { x: -16 }), 0)
              .add(revealLines(title, { stagger: 0.09, duration: 1.1 }), 0.05)
              .add(fadeIn(select('[data-lead]'), { y: 14 }), 0.3)
              .add(fadeIn(select('[data-readout]'), { y: 14, stagger: 0.08 }), 0.5)
              .add(fadeIn(consoleEl, { y: 56, duration: DURATION.cinematic }), 0.1)
              .add(gsap.fromTo(select('[data-radar]'), { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: DURATION.cinematic, immediateRender: false }), 0)
              .add(fadeIn(select('[data-head-item]'), { y: 10, duration: 0.6, stagger: 0.07 }), 0.55)
              .add(gsap.fromTo(select('[data-ruler]'), { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: EASE.inOut.gsap }), 0.6)
              .add(fadeIn(select('[data-controls]'), { y: 12, duration: 0.7 }), 0.8)
              .add(scramble(online, online.textContent ?? '', { duration: 0.9, chars: LETTERS }), 0.7)
              .add(
                gsap.to(counterState, {
                  value: modelCount,
                  duration: 1,
                  ease: 'power2.out',
                  immediateRender: false,
                  onStart: () => void (counter.textContent = pad(0)),
                  onUpdate: () => void (counter.textContent = pad(Math.round(counterState.value))),
                }),
                0.6,
              )
              // El guion arranca solo, salvo que el visitante ya haya tocado la consola.
              .call(() => {
                if (!rt.interacted) playScenario(0, false);
              }, undefined, 1.15);
            rt.intro = intro;
            ScrollTrigger.create({ trigger: consoleEl, start: 'top 78%', end: 'max', once: true, onEnter: () => intro.play() });
            if (focusedEarly) intro.progress(1);
          }),
        );
      }

      return () => {
        cancelled = true;
        observer.disconnect();
        section.removeEventListener('focusin', onFocusIn);
        rt.wave?.stop();
        rt.abort?.abort();
        rt.ctx?.kill();
        rt.statusTween?.kill();
        rt.stampTween?.kill();
        rt.intro = null;
      };
    },
    { scope: sectionRef },
  );

  // Lo que se pregunta en el panel del robot también aparece aquí, ya
  // resuelto (sin repetir la animación): es la misma conversación.
  useEffect(
    () =>
      useStylistStore.subscribe((state, previous) => {
        const last = state.turns.at(-1);
        if (!last || last.source !== 'panel' || last.status !== 'done') return;
        const before = previous.turns.find((item) => item.id === last.id);
        if (before?.status === 'done') return;
        const rt = runtime.current;
        rt.abort?.abort();
        rt.ctx?.kill();
        rt.ctx = null;
        rt.interacted = true;
        rt.count += 1;
        const time = clock();
        setStamp(`${t('console.stamp', { number: pad(rt.count) })} · ${time}`);
        setMode('idle');
        setStatus('idle');
        rt.wave?.speak(0.08);
        setActive(null);
        setTurn({ key: rt.count, question: last.question, typed: false, animated: false, time, phase: 'done', answer: last.answer, products: last.products, record: false });
      }),
    // Las funciones de arriba solo escriben en el DOM y en refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---------- Interacción ----------

  const onChip = (index: number) => {
    runtime.current.interacted = true;
    playScenario(index);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = inputRef.current;
    const question = input?.value.trim() ?? '';
    if (!question) {
      input?.focus();
      return;
    }
    runtime.current.interacted = true;
    if (input) input.value = '';
    setActive(null);
    ask(question, false);
  };

  // ---------- Marcado ----------

  const renderAnswer = (answer: string) =>
    tokenize(answer).map((token, index) => (
      <Fragment key={index}>
        {token.space ? ' ' : null}
        <span className={token.highlight ? styles.highlight : undefined}>{token.word}</span>
      </Fragment>
    ));

  // tabIndex -1: un salto de ancla (#estilista, #club) enfoca la sección; si el
  // HTML ya lo trae, no hay desajuste al hidratar.
  return (
    <section ref={sectionRef} id={HOME_ANCHORS.stylist} className={styles.section} aria-labelledby="stylist-title" data-motion="pending" tabIndex={-1}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.layout}>
        <div className={styles.intro}>
          <p className={`${styles.hud} ${styles.hudPrimary} ${styles.kicker}`} data-kicker="" data-enter="">
            <span className={styles.dot} aria-hidden="true" />
            {t('kicker')}
          </p>
          <h2 id="stylist-title" className={styles.title} data-title="" data-enter="">
            {t('title')}
          </h2>
          <p className={styles.lead} data-lead="" data-enter="">
            {t('lead')}
          </p>
          <dl className={styles.readouts}>
            <div className={styles.readout} data-readout="" data-enter="">
              <dt className={styles.hud}>{t('readouts.catalog')}</dt>
              <dd>
                <span data-count="">{pad(modelCount)}</span>
                <span className={styles.unit}>{t('readouts.catalogUnit')}</span>
              </dd>
            </div>
            <div className={styles.readout} data-readout="" data-enter="">
              <dt className={styles.hud}>{t('readouts.languages')}</dt>
              <dd>{t.rich('readouts.languagesValue', { unit: (chunks) => <span className={styles.unit}>{chunks}</span> })}</dd>
            </div>
            <div className={styles.readout} data-readout="" data-enter="">
              <dt className={styles.hud}>{t('readouts.response')}</dt>
              <dd>{t('readouts.responseValue')}</dd>
            </div>
          </dl>
        </div>

        <div className={styles.stage}>
          <div className={styles.radar} aria-hidden="true" data-radar="" data-enter="">
            <svg className={styles.radarRings} viewBox="0 0 1000 1000">
              <circle cx="500" cy="500" r="498" />
              <circle cx="500" cy="500" r="390" />
              <circle cx="500" cy="500" r="282" />
              <circle cx="500" cy="500" r="174" />
              <path d="M500 0V1000M0 500H1000" />
            </svg>
            <div className={styles.radarSweep} />
          </div>

          <div ref={consoleRef} className={styles.console} data-mode="idle" data-enter="">
            <span className={styles.corners} aria-hidden="true" />
            <header className={styles.head}>
              <p className={styles.headId} data-head-item="" data-enter="">
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.hud}>{t('console.name')}</span>
              </p>
              <p className={styles.online} data-head-item="" data-enter="" data-online="">
                {t('console.online')}
              </p>
              <div ref={waveRef} className={styles.wave} data-head-item="" data-enter="" aria-hidden="true">
                {Array.from({ length: WAVE_BARS }, (_, index) => (
                  <span key={index} className={styles.waveBar} />
                ))}
              </div>
              <p className={styles.mode} data-head-item="" data-enter="" aria-hidden="true">
                <span className={styles.modeYou}>{t('console.modeYou')}</span>
                <span className={styles.modeAi}>{t('console.modeAi')}</span>
              </p>
              <p className={styles.lang} data-head-item="" data-enter="">
                <GlobeIcon />
                {t('console.language')}
              </p>
            </header>

            <div className={styles.status}>
              <span className={`${styles.hud} ${styles.statusLabel}`}>{t('console.statusLabel')}</span>
              <span ref={statusRef} className={`${styles.hud} ${styles.hudPrimary} ${styles.statusValue}`}>
                {t('status.idle')}
              </span>
              <span className={styles.ruler} data-ruler="" aria-hidden="true" />
              <span ref={stampRef} className={`${styles.hud} ${styles.stamp}`}>
                {t('console.stamp', { number: pad(1) })}
              </span>
            </div>

            {/* aria-live="off": la región en vivo de abajo anuncia solo la respuesta final. */}
            <div ref={logRef} className={styles.log} role="log" aria-live="off" aria-label={t('console.logLabel')} tabIndex={0} data-lenis-prevent="">
              <div ref={threadRef} className={styles.thread}>
                {turn ? (
                  <>
                    <div key={`q${turn.key}`} ref={youRef} className={`${styles.msg} ${styles.msgYou}`}>
                      <p className={styles.meta}>
                        <span>{t('message.you')}</span>
                        {turn.time ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <time>{turn.time}</time>
                          </>
                        ) : null}
                        {turn.phase !== 'typing' ? (
                          <span ref={sentRef} className={styles.sent}>
                            {t('message.sent')}
                          </span>
                        ) : null}
                      </p>
                      <p className={styles.bubble}>
                        <span ref={typedRef}>{turn.typed ? null : turn.question}</span>
                        {turn.phase === 'typing' ? <span className={styles.caret} aria-hidden="true" /> : null}
                      </p>
                    </div>
                    {turn.phase !== 'typing' ? (
                      <div key={`a${turn.key}`} ref={replyRef} className={`${styles.msg} ${styles.msgStylist}`}>
                        <p className={styles.meta}>
                          <span className={styles.metaName}>{t('message.stylist')}</span>
                          {turn.time ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <time>{turn.time}</time>
                            </>
                          ) : null}
                        </p>
                        <div className={styles.reply}>
                          {turn.phase === 'replying' ? (
                            <span ref={thinkingRef} className={styles.thinking} aria-hidden="true">
                              <i />
                              <i />
                              <i />
                            </span>
                          ) : null}
                          {/* En una consulta animada las palabras las escribe la máquina de escribir. */}
                          <p ref={replyTextRef} className={styles.replyText}>
                            {turn.animated ? null : renderAnswer(turn.answer)}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {turn.phase === 'done' && turn.products.length ? (
                      <div key={`r${turn.key}`} ref={recsRef} className={styles.recs} role="list" aria-label={t('card.listLabel')}>
                        {turn.products.map((product, index) => (
                          <RecommendationCard key={product.slug} product={product} index={index} />
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            <div className={styles.controls} data-controls="" data-enter="">
              <div className={styles.routes}>
                <p className={`${styles.hud} ${styles.routesLabel}`} id="stylist-suggestions">
                  {t('controls.suggestions')}
                </p>
                <div className={styles.chips} role="group" aria-labelledby="stylist-suggestions">
                  {chips.map((chip, index) => (
                    <button key={chip.id} type="button" className={styles.chip} data-chip="" aria-pressed={active === chip.id} onClick={() => onChip(index)}>
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
              <form className={styles.form} onSubmit={onSubmit} autoComplete="off">
                <label className="visually-hidden" htmlFor="stylist-input">
                  {t('controls.inputLabel')}
                </label>
                <span className={styles.prompt} aria-hidden="true">
                  &gt;_
                </span>
                <input
                  ref={inputRef}
                  className={styles.input}
                  id="stylist-input"
                  name="message"
                  type="text"
                  maxLength={160}
                  placeholder={narrow ? t('controls.placeholderShort') : t('controls.placeholder')}
                  onFocus={() => {
                    runtime.current.interacted = true;
                  }}
                />
                <button className={styles.send} type="submit" aria-label={t('controls.send')}>
                  <SendIcon />
                </button>
              </form>
            </div>

            <div className="visually-hidden" role="status" aria-live="polite">
              {announcement}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// "Ver en 3D" abre la ficha del producto (giro, detalles, suela y AR).
function RecommendationCard({ product, index }: { product: RecommendedProduct; index: number }) {
  const t = useTranslations('HomeStylist');
  return (
    <article className={styles.card} role="listitem">
      <header className={styles.cardHead}>
        <span className={styles.hud}>
          {t('card.recommendation', { index: index + 1 })}
          <span className={styles.cardBrand}> · {product.brand}</span>
        </span>
        <span className={`${styles.hud} ${styles.hudPrimary} ${styles.match}`}>
          {t.rich('card.match', { percent: product.match, value: (chunks) => <span data-match={product.match}>{chunks}</span> })}
        </span>
      </header>
      <span className={styles.meter} aria-hidden="true">
        <span className={styles.meterFill} data-meter="" style={{ transform: `scaleX(${product.match / 100})` }} />
      </span>
      <div className={styles.cardBody}>
        {product.poster ? (
          <div className={styles.poster}>
            <ThemedPoster poster={product.poster} alt="" />
          </div>
        ) : null}
        <div>
          <h3 className={styles.cardName}>{product.name}</h3>
          <p className={styles.cardReason}>{product.reason}</p>
        </div>
      </div>
      <ul className={styles.tags} aria-label={t('card.tags')}>
        {product.tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
      <footer className={styles.cardFoot}>
        <span className={styles.price}>{product.price}</span>
        <Link href={`/products/${product.slug}`} className={styles.view3d} aria-label={t('card.view3dLabel', { name: product.name })}>
          {t('card.view3d')}
          <ArrowIcon />
        </Link>
      </footer>
    </article>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3Z" />
      </g>
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
