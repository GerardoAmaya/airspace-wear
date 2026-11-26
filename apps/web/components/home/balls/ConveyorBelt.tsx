'use client';

import { useTranslations } from 'next-intl';
import { type MouseEvent, type PointerEvent, type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { gsap } from '@/lib/motion/gsap';
import type { Ball, Selection } from './ball-data';
import { type BeltEngine, createBeltEngine, type PieceElements } from './belt-engine';
import styles from './ConveyorBelt.module.css';

// Banda transportadora con los balones de la colección. Los balones son los
// pósters del tema (fotos del mismo estudio que el foco 3D), no lienzos.
// Es decorativa para lectores de pantalla (aria-hidden): el selector ofrece
// lo mismo con teclado. Un clic en un balón lo elige.

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
  telemetryRef: RefObject<{ speed: number }>;
  onPick(index: number, piece: number): void;
  onHover(index: number): void;
}

export function ConveyorBelt({ balls, selection, live, reducedMotion, claimTarget, telemetryRef, onPick, onHover }: BeltProps) {
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
    if (!belt || !live || reducedMotion) {
      telemetryRef.current.speed = 0;
      return;
    }
    const tick = (time: number, deltaMs: number) => {
      belt.frame(time, deltaMs);
      telemetryRef.current.speed = belt.state.metersPerSecond;
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [live, reducedMotion, telemetryRef]);

  const pieceFrom = (event: { target: EventTarget }) => {
    const hit = (event.target as Element).closest?.('[data-hit]') as HTMLElement | null;
    return hit ? Number(hit.dataset.hit) : -1;
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const piece = pieceFrom(event);
    const belt = engine.current;
    if (piece < 0 || !belt) return;
    if (belt.isClaimed(piece)) belt.nudge(piece, 90);
    else onPick(items[piece].ball, piece);
  };

  const onPointerOver = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    const piece = pieceFrom(event);
    if (piece < 0) return;
    engine.current?.nudge(piece, 45);
    onHover(items[piece].ball);
  };

  return (
    // Decorativa: el selector es el control accesible (mismo efecto con teclado).
    <div ref={root} className={styles.belt} aria-hidden="true" data-reduced={reducedMotion || undefined} onClick={onClick} onPointerOver={onPointerOver}>
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
  );
}
