// Motor del tablero split-flap: cada carácter vive en una "paleta" que gira
// en orden por el tambor (A, B, C...) hasta detenerse en su letra, como un
// tablero Solari. Un solo callback del ticker de GSAP mueve todas las paletas
// activas y se apaga cuando todas se detienen.
//
// Cada paleta escribe solo textContent y alterna una clase que reinicia la
// animación CSS del medio superior (transform), sin leer el layout.

// Orden del tambor. Las letras con tilde van junto a su base.
const DRUM = ' ABCDEFGHIJKLMNÑOPQRSTUÚVWXYZ0123456789-.:$·';
const DRUM_INDEX = new Map([...DRUM].map((char, index) => [char, index]));

// Crea el marcado de n paletas vacías.
export function tilesMarkup(count, className = '') {
  const tile = `<span class="dep-tile ${className}"><span class="dep-ch"></span><span class="dep-flap"><span></span></span></span>`;
  return tile.repeat(count);
}

// Convierte las paletas de un contenedor en objetos que el motor manipula.
export function collectTiles(container) {
  return [...container.querySelectorAll('.dep-tile')].map((element) => ({
    element,
    ch: element.querySelector('.dep-ch'),
    flap: element.querySelector('.dep-flap'),
    flapText: element.querySelector('.dep-flap > span'),
    char: ' ',
    phase: false,
    job: null,
  }));
}

// Normaliza un texto al ancho del tablero: mayúsculas y relleno con espacios.
export function fitText(text, length) {
  return text.toUpperCase().replace(/\s/g, ' ').padEnd(length, ' ').slice(0, length);
}

export function createFlapEngine({ gsap, reducedMotion }) {
  const jobs = new Set();
  let running = false;

  const write = (tile, char, animate) => {
    const previous = tile.char;
    tile.char = char;
    tile.ch.textContent = char === ' ' ? '' : char;
    if (!animate) return;
    // El medio superior muestra la letra anterior y cae sobre la nueva.
    tile.flapText.textContent = previous === ' ' ? '' : previous;
    tile.phase = !tile.phase;
    tile.flap.classList.toggle('is-a', tile.phase);
    tile.flap.classList.toggle('is-b', !tile.phase);
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
  function sequenceFor(target, steps) {
    const index = DRUM_INDEX.get(target);
    if (index === undefined) {
      const filler = Array.from({ length: Math.min(steps, 4) }, () => DRUM[1 + Math.floor(Math.random() * 26)]);
      return [...filler, target];
    }
    const sequence = [];
    for (let step = steps - 1; step >= 0; step -= 1) {
      sequence.push(DRUM[(index - step + DRUM.length) % DRUM.length]);
    }
    return sequence;
  }

  /**
   * Gira un grupo de paletas hasta mostrar `text`.
   * @param {object[]} tiles paletas de collectTiles()
   * @param {string} text texto ya ajustado al ancho (fitText)
   * @param {object} options delay (s), stagger (s por paleta), minSteps / maxSteps
   *   (giros por paleta), interval (s por giro), onlyChanged (salta las que ya coinciden)
   */
  function flapTo(tiles, text, { delay = 0, stagger = 0.018, minSteps = 3, maxSteps = 10, interval = 0.05, onlyChanged = false } = {}) {
    if (reducedMotion) {
      tiles.forEach((tile, index) => write(tile, text[index] ?? ' ', false));
      return;
    }
    const now = gsap.ticker.time;
    tiles.forEach((tile, index) => {
      const target = text[index] ?? ' ';
      if (tile.job) {
        jobs.delete(tile.job);
        tile.job = null;
      }
      if (onlyChanged && tile.char === target) return;
      // Las paletas en blanco giran poco: un leve parpadeo, no ruido.
      const blank = target === ' ';
      const steps = blank
        ? Math.floor(Math.random() * 3)
        : minSteps + Math.floor(Math.random() * (maxSteps - minSteps + 1));
      if (steps === 0) {
        write(tile, target, tile.char !== target);
        return;
      }
      const job = {
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
  function set(tiles, text) {
    tiles.forEach((tile, index) => {
      if (tile.job) {
        jobs.delete(tile.job);
        tile.job = null;
      }
      write(tile, text[index] ?? ' ', false);
    });
  }

  return { flapTo, set, stop };
}
