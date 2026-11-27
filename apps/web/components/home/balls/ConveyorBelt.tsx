'use client';

import { useTranslations } from 'next-intl';
import { type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { gsap } from '@/lib/motion/gsap';
import type { Ball, Selection } from './ball-data';
import { type BeltEngine, createBeltEngine, type PieceElements } from './belt-engine';
import styles from './ConveyorBelt.module.css';

// Banda transportadora con los balones de la colección: es el selector de la
// sección. Los balones son los pósters del tema (fotos del mismo estudio que
// el foco 3D), no lienzos. Un clic en un balón lo elige.
//
// Accesibilidad: la banda visible (con copias repetidas que se mueven) queda
// oculta para lectores de pantalla. En su lugar hay un grupo de botones, uno
// por balón (aria-pressed), con un solo punto de tabulación: las flechas
// eligen el anterior o el siguiente, Inicio y Fin el primero y el último.
// Con el foco del teclado en el grupo, la etiqueta "En foco" muestra el anillo.
//
// Arrastre horizontal (dedo o mouse) como un carrusel: la banda sigue al
// puntero, al soltar sigue por inercia y encaja el balón más cercano en el
// foco, que pasa a ser el elegido (el mismo camino que un clic). Un gesto
// vertical desplaza la página (touch-action: pan-y y bloqueo de eje). La
// marcha propia espera mientras se arrastra y vuelve unos segundos después.
// Con movimiento reducido el arrastre sigue (lo inicia la persona), pero
// encaja sin inercia y la banda no vuelve a andar sola.

// Px de movimiento antes de decidir el eje (por debajo es un toque).
const AXIS_LOCK_PX = 8;
// Segundos quieta tras encajar antes de que vuelva la marcha propia.
const RESUME_DELAY_S = 2.6;
// Ventana para medir la velocidad al soltar (ms).
const VELOCITY_WINDOW_MS = 90;

// Copias de cada balón: con pocos balones se repiten más para llenar la banda.
const copiesFor = (count: number) => Math.max(2, Math.ceil(6 / count));

// Código de barras determinista por etiqueta (barras de 1 a 3 unidades).
function barcode(seed: string) {
  let state = [...seed].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const bars: { x: number; width: number }[] = [];
  let x = 0;
  while (x < 52) {
    const width = 1 + Math.floor(random() * 3);
    bars.push({ x, width });
    x += width + 1 + Math.floor(random() * 2);
  }
  return { bars, width: x - 1 };
}

interface BeltProps {
  balls: Ball[];
  selection: Selection;
  live: boolean;
  reducedMotion: boolean;
  claimTarget: RefObject<HTMLElement | null>;
  // piece: copia tocada en la banda (null desde el teclado: la más cercana al foco).
  onPick(index: number, piece: number | null): void;
  onHover(index: number): void;
}

export function ConveyorBelt({ balls, selection, live, reducedMotion, claimTarget, onPick, onHover }: BeltProps) {
  const t = useTranslations('HomeBalls.belt');
  const items = useMemo(() => {
    const list: { ball: number; round: number }[] = [];
    for (let round = 0, copies = copiesFor(balls.length); round < copies; round++) balls.forEach((_, ball) => list.push({ ball, round }));
    return list;
  }, [balls]);

  const root = useRef<HTMLDivElement>(null);
  const slats = useRef<HTMLDivElement>(null);
  const rollers = useRef<HTMLDivElement>(null);
  const claimMark = useRef<HTMLSpanElement>(null);
  const pool = useRef<HTMLSpanElement>(null);
  const pieceNodes = useRef<(HTMLDivElement | null)[]>([]);
  const engine = useRef<BeltEngine | null>(null);
  const shownSelection = useRef<Selection | null>(null);
  // Gesto en curso (refs: cambian con cada evento del puntero).
  const gesture = useRef<{
    id: number;
    startX: number;
    startY: number;
    lastX: number;
    axis: 'none' | 'x' | 'y';
    caught: boolean;
    samples: { time: number; offset: number }[];
    travel: number;
  } | null>(null);
  const suppressClick = useRef(false);

  // Mide la banda y el punto del foco (solo al cambiar de tamaño).
  const measure = () => {
    const belt = engine.current;
    const target = claimTarget.current;
    if (!belt || !root.current || !belt.layout()) return;
    if (target) {
      const spot = target.getBoundingClientRect();
      belt.setClaim(spot.left + spot.width / 2 - root.current.getBoundingClientRect().left);
    } else {
      belt.setClaim(belt.geometry.width / 2);
    }
  };

  // Motor imperativo: se crea una vez con los nodos ya montados.
  useLayoutEffect(() => {
    const pieces: PieceElements[] = pieceNodes.current.map((node) => {
      const element = node as HTMLDivElement;
      const string = element.querySelector('svg') as SVGSVGElement;
      return {
        node: element,
        sprite: element.querySelector('[data-sprite]') as HTMLElement,
        shadow: element.querySelector('[data-shadow]') as HTMLElement,
        ghost: element.querySelector('[data-ghost]') as HTMLElement,
        string,
        path: string.querySelector('path') as SVGPathElement,
        tag: element.querySelector('[data-tag]') as HTMLElement,
        card: element.querySelector('[data-card]') as HTMLElement,
      };
    });
    const belt = createBeltEngine(
      { root: root.current!, slats: slats.current!, rollers: rollers.current!, claimMark: claimMark.current!, pool: pool.current!, pieces },
      items.map((item) => item.ball),
      reducedMotion,
    );
    engine.current = belt;
    measure();
    // La pieza elegida al montar (su primera copia, índice igual al del
    // balón) queda justo bajo el foco, ya "subida".
    const first = selection.index;
    belt.setOffset(belt.offsetFor(first, belt.geometry.claimX));
    belt.claim(first, false);
    shownSelection.current = selection;

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(root.current!);
    if (claimTarget.current) observer.observe(claimTarget.current);
    return () => {
      observer.disconnect();
      belt.destroy();
      engine.current = null;
    };
    // El motor se crea una sola vez por lista de balones y preferencia de movimiento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, reducedMotion]);

  // Cambio de balón: la banda frena, el balón sube y la banda vuelve a arrancar.
  useEffect(() => {
    const belt = engine.current;
    if (!belt || shownSelection.current === selection) return;
    shownSelection.current = selection;
    const piece = selection.piece !== null && belt.pieceBall(selection.piece) === selection.index ? selection.piece : belt.nearest(selection.index);
    const animate = selection.animate && !reducedMotion && live;
    // Desde el teclado o una recarga (sin pieza tocada) la copia elegida
    // viaja al foco, donde se ve el anillo del teclado.
    if (selection.piece === null) belt.bring(piece, animate);
    belt.claim(piece, animate);
    if (!animate) return;
    belt.setDrive(0, { duration: 0.8, ease: 'power2.out' });
    const restart = gsap.delayedCall(1.4, () => belt.setDrive(1, { duration: 1.8, ease: 'power2.inOut' }));
    return () => {
      restart.kill();
      belt.setDrive(1, { duration: 1.8, ease: 'power2.inOut' });
    };
  }, [selection, reducedMotion, live]);

  // Ciclo por tiempo solo con la banda a la vista y movimiento permitido.
  useEffect(() => {
    const belt = engine.current;
    if (!belt || !live || reducedMotion) return;
    const tick = (time: number, deltaMs: number) => belt.frame(time, deltaMs);
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [live, reducedMotion]);

  const pieceFrom = (event: { target: EventTarget }) => {
    const hit = (event.target as Element).closest?.('[data-hit]') as HTMLElement | null;
    return hit ? Number(hit.dataset.hit) : -1;
  };

  // ---------- Arrastre ----------

  // Al encajar: la pieza del foco pasa a ser la elegida (mismo camino que
  // un clic). Si es otra copia del balón ya elegido, solo cambia la pieza.
  const settle = (piece: number) => {
    const belt = engine.current;
    if (!belt || piece < 0) return;
    const ball = items[piece].ball;
    if (ball === selection.index) belt.claim(piece, !reducedMotion && live);
    else onPick(ball, piece);
    belt.resume(RESUME_DELAY_S);
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const belt = engine.current;
    const current = gesture.current;
    if (!belt || !current) return;
    current.axis = 'x';
    root.current?.setAttribute('data-dragging', '');
    // Captura solo al confirmar el arrastre: un toque sigue siendo un clic.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Puntero ya liberado: el arrastre sigue con los eventos que lleguen.
    }
    if (!current.caught) belt.grab();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const belt = engine.current;
    if (!belt) return;
    // Un gesto nuevo: lo que quedara del anterior (un arrastre sin clic final) no cuenta.
    suppressClick.current = false;
    // Tocar la banda mientras sigue por inercia la detiene (como un carrusel).
    const caught = belt.isGliding();
    if (caught) belt.grab();
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      axis: 'none',
      caught,
      samples: [{ time: event.timeStamp, offset: 0 }],
      travel: 0,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    const belt = engine.current;
    if (!current || !belt || event.pointerId !== current.id || current.axis === 'y') return;
    if (current.axis === 'none') {
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        // Vertical: es de la página (con touch-action: pan-y el navegador desplaza).
        current.axis = 'y';
        return;
      }
      startDrag(event);
    }
    const step = event.clientX - current.lastX;
    current.lastX = event.clientX;
    current.travel += step;
    belt.drag(step);
    current.samples.push({ time: event.timeStamp, offset: current.travel });
    while (current.samples.length > 2 && event.timeStamp - current.samples[0].time > VELOCITY_WINDOW_MS) current.samples.shift();
  };

  const endGesture = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    const belt = engine.current;
    if (!current || event.pointerId !== current.id) return;
    gesture.current = null;
    root.current?.removeAttribute('data-dragging');
    if (!belt) return;
    if (current.axis === 'x') {
      // Velocidad al soltar: del avance en la última ventana corta. Si el
      // puntero llevaba un rato quieto, no hay inercia.
      const first = current.samples[0];
      const elapsed = event.timeStamp - first.time;
      const idle = event.timeStamp - current.samples[current.samples.length - 1].time > VELOCITY_WINDOW_MS;
      const velocity = idle || elapsed <= 0 ? 0 : ((current.travel - first.offset) / elapsed) * 1000;
      suppressClick.current = true;
      belt.glide(velocity, settle);
    } else if (current.caught) {
      // Detuvo la inercia con un toque: encaja desde donde quedó.
      suppressClick.current = true;
      belt.glide(0, settle);
    }
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    // El clic que cierra un arrastre no elige: ya eligió el encaje.
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const piece = pieceFrom(event);
    const belt = engine.current;
    if (piece < 0 || !belt) return;
    if (belt.isClaimed(piece)) belt.nudge(piece, 90);
    else onPick(items[piece].ball, piece);
  };

  const onPointerOver = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || gesture.current) return;
    const piece = pieceFrom(event);
    if (piece < 0) return;
    engine.current?.nudge(piece, 45);
    onHover(items[piece].ball);
  };

  // ---------- Teclado (grupo de botones accesible) ----------

  const picks = useRef<HTMLDivElement>(null);
  const onPicksKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const count = balls.length;
    const current = selection.index;
    const next = { ArrowRight: current + 1, ArrowDown: current + 1, ArrowLeft: current - 1, ArrowUp: current - 1, Home: 0, End: count - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const index = (next + count) % count;
    picks.current?.querySelectorAll<HTMLButtonElement>('button')[index]?.focus();
    onPick(index, null);
  };

  return (
    <div className={styles.wrap}>
      <div ref={picks} className={styles.picks} role="group" aria-label={t('label')} onKeyDown={onPicksKey}>
        {balls.map((ball, index) => (
          <button
            key={ball.slug}
            type="button"
            className="visually-hidden"
            tabIndex={index === selection.index ? 0 : -1}
            aria-pressed={index === selection.index}
            aria-label={t('item', { year: String(ball.year), host: ball.host, shortName: ball.shortName, name: ball.name, edition: ball.edition })}
            onClick={() => onPick(index, null)}
            onFocus={() => onHover(index)}
          />
        ))}
      </div>
      {/* Parte visual: oculta para lectores de pantalla (el grupo de arriba la reemplaza). */}
      <div
        ref={root}
        className={styles.belt}
        aria-hidden="true"
        data-reduced={reducedMotion || undefined}
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        <div className={styles.back} />
        <div className={`${styles.plane} ${styles.base}`} />
        <div ref={slats} className={`${styles.plane} ${styles.slats}`} />
        <div className={`${styles.plane} ${styles.glow}`}>
          <span ref={pool} className={styles.pool} />
        </div>
        <div className={styles.lip} />
        <div className={styles.skirt}>
          <div ref={rollers} className={styles.rollers} />
          <span ref={claimMark} className={styles.claim}>
            <span className={styles.claimMark} />
            <span className={styles.claimLabel}>{t('focus')}</span>
          </span>
        </div>
        <div className={styles.items}>
          {items.map((item, index) => {
            const ball = balls[item.ball];
            const code = barcode(`${ball.host}${ball.year}${item.round}`);
            return (
              <div
                key={`${ball.slug}-${item.round}`}
                ref={(node) => {
                  pieceNodes.current[index] = node;
                }}
                className={styles.item}
              >
                <div className={styles.hit} data-hit={index} />
                <div className={styles.body} data-belt-body="">
                  <div className={styles.hover}>
                    <span className={styles.shadow} data-shadow="" />
                    <span className={styles.ghost} data-ghost="" />
                    <div className={styles.sprite} data-sprite="">
                      <ThemedPoster poster={ball.model.poster} alt="" sizes="240px" />
                    </div>
                  </div>
                </div>
                <svg className={styles.string} data-belt-string="">
                  <path />
                </svg>
                <div className={styles.tag} data-tag="">
                  <div className={styles.drop} data-belt-drop="">
                    <div className={styles.card} data-card="">
                      <div className={`${styles.face} ${styles.front}`}>
                        <span className={styles.hole} />
                        <span className={styles.cup}>{t('cup')}</span>
                        <span className={styles.code} style={{ ['--chars' as string]: Math.max(ball.host.length, 4) }}>
                          {ball.host}
                        </span>
                        <span className={styles.year}>{ball.year}</span>
                        <svg className={styles.bars} viewBox={`0 0 ${code.width} 10`} preserveAspectRatio="none">
                          {code.bars.map((bar) => (
                            <rect key={bar.x} x={bar.x} width={bar.width} height={10} />
                          ))}
                        </svg>
                        <span className={styles.ballName}>{ball.shortName}</span>
                      </div>
                      <div className={`${styles.face} ${styles.backFace}`}>
                        <span className={styles.hole} />
                        <span className={styles.inFocus}>{t('inFocus')}</span>
                        <span className={styles.backYear}>{ball.year}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
