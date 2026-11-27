'use client';

import { type RefObject, useId } from 'react';
import { TAU } from './rig';
import styles from './Turntable.module.css';

// Anillos HUD de la plataforma (SVG en milímetros del mundo, viewBox de
// 600 x 600 mm): marcas cada 5°, rótulos 000 a 330, borde con el acento del
// producto y un arco que avanza con el giro. "000" queda al frente (hacia la
// cámara). Portado del adelanto del Hangar 360° de la home.

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
    // Redondeo a 0,1 mm: el servidor y el navegador calculan senos con
    // distinta precisión y el atributo debe coincidir al hidratar.
    line: { x1: (inner * cos).toFixed(1), y1: (inner * sin).toFixed(1), x2: (outer * cos).toFixed(1), y2: (outer * sin).toFixed(1) },
    text: major ? { x: (272 * cos).toFixed(1), y: (272 * sin).toFixed(1), value: String(degree).padStart(3, '0') } : null,
  };
});

// Media vuelta que el arco de giro rota (en el espacio propio del arco).
const HALF_ARC = 'M250 0 A250 250 0 0 1 -250 0';

export interface RingRefs {
  ticks: RefObject<SVGGElement | null>;
  arcLower: RefObject<SVGPathElement | null>;
  arcUpper: RefObject<SVGPathElement | null>;
  // Último valor escrito: el DOM solo se toca cuando cambia.
  shown: RefObject<{ ticks: string }>;
}

// Escribe el giro en los anillos (marcas y arco). Se llama por cuadro desde
// la escena, así que solo toca atributos (nunca estado de React).
export function paintRings(refs: RingRefs, angle: number) {
  const turn = (((angle % TAU) + TAU) % TAU) / TAU;
  const sweep = turn * 360;
  refs.arcLower.current?.setAttribute('transform', `rotate(${(Math.min(sweep, 180) - 180).toFixed(2)})`);
  refs.arcUpper.current?.setAttribute('transform', `rotate(${(Math.max(sweep, 180) - 180).toFixed(2)})`);
  const tickTransform = `rotate(${((-angle * 180) / Math.PI).toFixed(2)})`;
  if (tickTransform !== refs.shown.current.ticks) {
    refs.shown.current.ticks = tickTransform;
    refs.ticks.current?.setAttribute('transform', tickTransform);
  }
}

// Las refs llegan sueltas (no dentro de un objeto) para que React las asigne
// en el commit sin leerlas durante el render.
export function TurntableRings({ ticks, arcLower, arcUpper }: Pick<RingRefs, 'ticks' | 'arcLower' | 'arcUpper'>) {
  const ids = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="-300 -300 600 600" focusable="false" className={styles.art}>
      <defs>
        <radialGradient id={`${ids}-disc`}>
          <stop offset="0" className={`${styles.discStop} ${styles.discStopCenter}`} />
          <stop offset="1" className={styles.discStop} />
        </radialGradient>
        <clipPath id={`${ids}-lower`}>
          <rect x="-300" y="0" width="600" height="300" />
        </clipPath>
        <clipPath id={`${ids}-upper`}>
          <rect x="-300" y="-300" width="600" height="300" />
        </clipPath>
      </defs>
      <circle className={styles.disc} r="206" fill={`url(#${ids}-disc)`} />
      <circle className={`${styles.ring} ${styles.ringOuter}`} r="288" />
      <circle className={styles.ring} r="250" />
      <circle className={`${styles.ring} ${styles.ringEdge}`} r="206" />
      <circle className={`${styles.ring} ${styles.ringInner}`} r="150" />
      {/* Arco de giro: dos medias vueltas recortadas que solo rotan (transform). */}
      <g transform="rotate(90) scale(1 -1)">
        <g clipPath={`url(#${ids}-lower)`}>
          <path ref={arcLower} className={styles.arc} d={HALF_ARC} transform="rotate(-180)" />
        </g>
        <g clipPath={`url(#${ids}-upper)`}>
          <path ref={arcUpper} className={styles.arc} d={HALF_ARC} transform="rotate(0)" />
        </g>
      </g>
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
      <path className={styles.cross} d="M-24 0H24M0 -24V24" />
    </svg>
  );
}
