'use client';

import { useEffect, useState } from 'react';
import { gsap } from '@/lib/motion/gsap';

// Motor del tablero split-flap (portado de design/prototype/sections/departures/flap.js).
// Cada carácter vive en una "paleta" que gira en orden por el tambor (A, B,
// C...) hasta detenerse en su letra. Un solo callback del ticker de GSAP mueve
// todas las paletas activas y se apaga cuando todas se detienen.
//
// Las paletas las dibuja React una sola vez (spans vacíos o con el texto final
// del servidor); el motor solo escribe textContent y alterna una clase que
// reinicia la animación CSS del medio superior (transform). Nada de esto pasa
// por el estado de React.

// Orden del tambor. Las letras con tilde van junto a su base.
const DRUM = ' ABCDEFGHIJKLMNÑOPQRSTUÚVWXYZ0123456789-.:$·';
const DRUM_INDEX = new Map([...DRUM].map((char, index) => [char, index]));

export interface Tile {
  ch: HTMLElement;
  flap: HTMLElement;
  flapText: HTMLElement;
  char: string;
  phase: boolean;
  job: Job | null;
}

interface Job {
  tile: Tile;
  sequence: string[];
  index: number;
  next: number;
  interval: number;
}

export interface FlapOptions {
  delay?: number;
  stagger?: number;
  minSteps?: number;
  maxSteps?: number;
  interval?: number;
}

// Selectores de las piezas de una paleta (atributos de datos, no clases de
// CSS Modules, para no depender de los nombres generados).
export const TILE_SELECTOR = '[data-tile]';

// Convierte las paletas de un contenedor en objetos que el motor manipula.
// El carácter inicial es el que ya muestra el DOM (el servidor escribe el final).
export function collectTiles(container: Element): Tile[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TILE_SELECTOR)).map((element) => {
    const ch = element.querySelector<HTMLElement>('[data-tile-ch]')!;
    const flap = element.querySelector<HTMLElement>('[data-tile-flap]')!;
    return { ch, flap, flapText: flap.firstElementChild as HTMLElement, char: ch.textContent || ' ', phase: false, job: null };
  });
}

// Normaliza un texto al ancho del tablero: mayúsculas y relleno con espacios.
export function fitText(text: string, length: number): string {
  return text.toUpperCase().replace(/\s/g, ' ').padEnd(length, ' ').slice(0, length);
}

export interface FlapEngine {
  flapTo(tiles: Tile[], text: string, options?: FlapOptions): void;
  set(tiles: Tile[], text: string): void;
  stop(): void;
  setReducedMotion(reduced: boolean): void;
}

export function createFlapEngine(): FlapEngine {
  let reducedMotion = false;
  const jobs = new Set<Job>();
  let running = false;

  const write = (tile: Tile, char: string, animate: boolean) => {
    const previous = tile.char;
    tile.char = char;
    tile.ch.textContent = char === ' ' ? '' : char;
    if (!animate) return;
    // El medio superior muestra la letra anterior y cae sobre la nueva.
    tile.flapText.textContent = previous === ' ' ? '' : previous;
    tile.phase = !tile.phase;
    tile.flap.dataset.phase = tile.phase ? 'a' : 'b';
  };

  const tick = () => {
    const now = gsap.ticker.time;
    for (const job of jobs) {
      if (now < job.next) continue;
      write(job.tile, job.sequence[job.index], true);
      job.index += 1;
      job.next = now + job.interval;
      if (job.index >= job.sequence.length) {
        jobs.delete(job);
        job.tile.job = null;
      }
    }
    if (!jobs.size) stop();
  };

  function start() {
    if (running) return;
    running = true;
    gsap.ticker.add(tick);
  }

  function stop() {
    if (!running) return;
    running = false;
    gsap.ticker.remove(tick);
  }

  // Secuencia de giro: las `steps` letras del tambor que preceden al destino.
  function sequenceFor(target: string, steps: number): string[] {
    const index = DRUM_INDEX.get(target);
    if (index === undefined) {
      const filler = Array.from({ length: Math.min(steps, 4) }, () => DRUM[1 + Math.floor(Math.random() * 26)]);
      return [...filler, target];
    }
    const sequence: string[] = [];
    for (let step = steps - 1; step >= 0; step -= 1) sequence.push(DRUM[(index - step + DRUM.length) % DRUM.length]);
    return sequence;
  }

  const cancel = (tile: Tile) => {
    if (!tile.job) return;
    jobs.delete(tile.job);
    tile.job = null;
  };

  // Gira un grupo de paletas hasta mostrar `text` (ya ajustado con fitText).
  function flapTo(tiles: Tile[], text: string, { delay = 0, stagger = 0.018, minSteps = 3, maxSteps = 10, interval = 0.05 }: FlapOptions = {}) {
    if (reducedMotion) {
      set(tiles, text);
      return;
    }
    const now = gsap.ticker.time;
    tiles.forEach((tile, index) => {
      const target = text[index] ?? ' ';
      cancel(tile);
      // Las paletas en blanco giran poco: un leve parpadeo, no ruido.
      const blank = target === ' ';
      const steps = blank ? Math.floor(Math.random() * 3) : minSteps + Math.floor(Math.random() * (maxSteps - minSteps + 1));
      if (steps === 0) {
        write(tile, target, tile.char !== target);
        return;
      }
      const job: Job = {
        tile,
        sequence: sequenceFor(target, steps),
        index: 0,
        next: now + delay + index * stagger + Math.random() * 0.04,
        interval: interval * (0.85 + Math.random() * 0.3),
      };
      tile.job = job;
      jobs.add(job);
    });
    if (jobs.size) start();
  }

  // Muestra el texto final sin girar.
  function set(tiles: Tile[], text: string) {
    tiles.forEach((tile, index) => {
      cancel(tile);
      write(tile, text[index] ?? ' ', false);
    });
  }

  return {
    flapTo,
    set,
    stop,
    setReducedMotion: (reduced: boolean) => {
      reducedMotion = reduced;
    },
  };
}

// Un motor por tablero, estable entre renders; se detiene al desmontar.
export function useFlapEngine(reducedMotion: boolean): FlapEngine {
  const [engine] = useState(createFlapEngine);
  useEffect(() => engine.setReducedMotion(reducedMotion), [engine, reducedMotion]);
  useEffect(() => () => engine.stop(), [engine]);
  return engine;
}
