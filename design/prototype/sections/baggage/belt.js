// Banda transportadora de la sección "baggage": geometría, movimiento y piezas.
//
// La banda es un plano CSS 3D (perspective + rotateX) con tablillas que se
// desplazan dentro del plano. Las piezas (balones con su etiqueta) viajan
// sobre la línea media del plano: a esa profundidad la escala de perspectiva
// es constante, así que basta con trasladarlas en X a la misma velocidad que
// ven las tablillas a esa altura.
//
// El movimiento es por tiempo (no depende del scroll): la sección llama a
// frame() solo mientras la banda está a la vista. La velocidad se controla
// con setDrive() (la banda frena para cada reclamo y vuelve a arrancar).
//
// Toda la geometría se calcula en layout() (solo en cada refresh) y se
// escribe como variables CSS. Cada cuadro solo escribe transform y una
// variable de giro de los rodillos; no hay lecturas de layout por cuadro.

const BALL_M = 0.22; // diámetro real del balón (m)
const TILT_DEG = 64; // inclinación del plano de la banda
const TILT = (TILT_DEG * Math.PI) / 180;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mod = (value, length) => ((value % length) + length) % length;

// Código de barras determinista por etiqueta (barras de 1 a 3 unidades).
function barcode(seed) {
  let state = [...seed].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const bars = [];
  let x = 0;
  while (x < 52) {
    const width = 1 + Math.floor(random() * 3);
    bars.push(`<rect x="${x}" width="${width}" height="10"/>`);
    x += width + 1 + Math.floor(random() * 2);
  }
  return `<svg class="bag-tag__bars" viewBox="0 0 ${x - 1} 10" preserveAspectRatio="none" aria-hidden="true">${bars.join('')}</svg>`;
}

// "Mundial Alemania 2006" -> "Alemania".
const countryOf = (ball) => ball.edition.replace(/^mundial\s+/i, '').replace(/\s*\d{4}$/, '');
const shortName = (name) => name.replace(/^adidas\s+/i, '');

function itemMarkup(item, index) {
  const { ball } = item;
  const country = countryOf(ball);
  return `
    <div class="bag-item" data-item="${index}">
      <div class="bag-item__hit" data-hit></div>
      <div class="bag-item__body">
        <div class="bag-item__hover">
          <span class="bag-item__shadow" data-shadow></span>
          <span class="bag-item__ghost" data-ghost></span>
          <span class="bag-item__wait" data-wait></span>
          <canvas class="bag-item__ball" data-ball></canvas>
        </div>
      </div>
      <svg class="bag-item__string" data-string><path/></svg>
      <div class="bag-tag" data-tag>
        <div class="bag-tag__card" data-card>
          <div class="bag-tag__face bag-tag__face--front">
            <span class="bag-tag__hole"></span>
            <span class="bag-tag__air">Mundial</span>
            <span class="bag-tag__code" data-code style="--bag-chars: ${country.length}">${country}</span>
            <span class="bag-tag__year" data-year>${ball.tag.year}</span>
            ${barcode(`${country}${ball.tag.year}${item.round}`)}
            <span class="bag-tag__city">${shortName(ball.name)}</span>
          </div>
          <div class="bag-tag__face bag-tag__face--back">
            <span class="bag-tag__hole"></span>
            <span class="bag-tag__focus">En<br />foco</span>
            <span class="bag-tag__back-code">${ball.tag.year}</span>
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.element contenedor .bag-belt
 * @param {object[]} options.items piezas { slug, ball, angle, round }
 * @param {object} options.gsap
 * @param {object} options.tokens { EASE, DURATION }
 * @param {boolean} options.reducedMotion
 */
export function createBelt({ element, items, gsap, tokens, reducedMotion }) {
  const { EASE, DURATION } = tokens;
  element.innerHTML = `
    <div class="bag-belt__back"></div>
    <div class="bag-belt__plane bag-belt__base"></div>
    <div class="bag-belt__plane bag-belt__slats" data-slats></div>
    <div class="bag-belt__plane bag-belt__glow"><span class="bag-belt__pool" data-pool></span></div>
    <div class="bag-belt__lip"></div>
    <div class="bag-belt__skirt">
      <div class="bag-belt__rollers" data-rollers></div>
      <span class="bag-belt__claim" data-claim><span class="bag-belt__claim-mark"></span><span class="bag-belt__claim-label">Foco</span></span>
    </div>
    <div class="bag-belt__items" data-items>${items.map(itemMarkup).join('')}</div>`;

  const slats = element.querySelector('[data-slats]');
  const rollers = element.querySelector('[data-rollers]');
  const claimMark = element.querySelector('[data-claim]');
  const pool = element.querySelector('[data-pool]');
  const pieces = [...element.querySelectorAll('[data-item]')].map((node, index) => ({
    ...items[index],
    data: items[index].ball, // datos del catálogo (ball pasa a ser el canvas)
    index,
    node,
    hit: node.querySelector('[data-hit]'),
    body: node.querySelector('.bag-item__body'),
    ball: node.querySelector('[data-ball]'),
    shadow: node.querySelector('[data-shadow]'),
    ghost: node.querySelector('[data-ghost]'),
    wait: node.querySelector('[data-wait]'),
    string: node.querySelector('[data-string]'),
    tag: node.querySelector('[data-tag]'),
    card: node.querySelector('[data-card]'),
    code: node.querySelector('[data-code]'),
    year: node.querySelector('[data-year]'),
    x: 0,
    angle: 0, // giro de la etiqueta (grados)
    spin: 0, // velocidad angular de la etiqueta
    shownAngle: null,
    shownX: null,
    stiffness: 34 + ((index * 37) % 5) * 4,
    hidden: false,
  }));

  const geometry = {
    width: 0,
    height: 0,
    D: 100,
    lipY: 0,
    ballCY: 0,
    sMid: 1,
    spacing: 300,
    loop: 1800,
    margin: 150,
    pitch: 40,
    perspective: 1000,
    cruise: 40, // velocidad de crucero (px/s)
    claimX: 0,
  };
  const drive = { factor: reducedMotion ? 0 : 1 };
  let offset = 0; // desplazamiento de la banda en px de pantalla (a la altura de las piezas)
  let speed = 0;
  let lastSpeed = 0;
  let shownSlats = '';
  let shownRoll = '';
  const state = { speed: 0, metersPerSecond: 0 };

  // ---------- Geometría (solo en refresh) ----------

  function layout() {
    const rect = element.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (!width || !height) return geometry;
    const D = Math.round(clamp((height - 14) / 2.42, 60, 136));
    const tagW = Math.round(D * 0.72);
    const tagH = Math.round(D * 1.02);
    const lipY = Math.round(height - tagH * 0.9 - 12);
    const skirtH = Math.round(D * 0.36);
    const depth = D * 0.92; // profundidad visible del plano en pantalla
    const perspective = Math.round(Math.max(680, width * 0.72));
    const sin = Math.sin(TILT);
    const cos = Math.cos(TILT);
    const planeH = (depth * perspective) / (perspective * cos - depth * sin);
    const sBack = perspective / (perspective + planeH * sin);
    const dMid = planeH * 0.46;
    const sMid = perspective / (perspective + dMid * sin);
    const yMid = dMid * cos * sMid;
    const yBack = planeH * cos * sBack;
    const ballCY = lipY - yMid - D / 2 + D * 0.06;
    const planeW = Math.ceil((width / sBack) * 1.1 + 240);
    const pitch = Math.round((D * 0.4) / sMid);
    const count = pieces.length;
    const spacing = Math.max(D * 2.6, (width + D * 3.2) / count);

    Object.assign(geometry, {
      width,
      height,
      D,
      lipY,
      ballCY,
      sMid,
      spacing,
      loop: spacing * count,
      margin: D * 1.6,
      pitch,
      perspective,
      cruise: D * 0.34,
    });

    const style = element.style;
    style.setProperty('--bag-d', `${D}px`);
    style.setProperty('--bag-ball-box', `${2 * Math.round(D * 0.6)}px`);
    style.setProperty('--bag-tag-w', `${tagW}px`);
    style.setProperty('--bag-tag-h', `${tagH}px`);
    style.setProperty('--bag-lip-y', `${lipY}px`);
    style.setProperty('--bag-skirt-h', `${skirtH}px`);
    style.setProperty('--bag-ball-cy', `${ballCY.toFixed(1)}px`);
    style.setProperty('--bag-back-y', `${(lipY - yBack).toFixed(1)}px`);
    style.setProperty('--bag-plane-w', `${planeW}px`);
    style.setProperty('--bag-plane-h', `${planeH.toFixed(1)}px`);
    style.setProperty('--bag-persp', `${perspective}px`);
    style.setProperty('--bag-tilt', `${TILT_DEG}deg`);
    style.setProperty('--bag-pitch', `${pitch}px`);

    // Rodillos del faldón, centrados.
    const rollerGap = Math.round(D * 0.72);
    const rollerCount = Math.ceil(width / rollerGap) + 2;
    const start = (width / 2) % rollerGap;
    if (rollers.childElementCount !== rollerCount) {
      rollers.innerHTML = '<span class="bag-roller"><i></i></span>'.repeat(rollerCount);
    }
    [...rollers.children].forEach((roller, index) => {
      roller.style.left = `${(start + (index - 1) * rollerGap).toFixed(1)}px`;
    });

    // Cordel de cada etiqueta: del balón al ojal (coordenadas locales de la pieza).
    const fromX = D * 0.22;
    const fromY = ballCY + D * 0.34;
    const toX = D * 0.24;
    const toY = lipY + tagW * 0.17;
    for (const piece of pieces) {
      piece.string.setAttribute('width', String(Math.ceil(D * 0.6)));
      piece.string.setAttribute('height', String(Math.ceil(toY + 4)));
      piece.string
        .querySelector('path')
        .setAttribute(
          'd',
          `M${fromX.toFixed(1)} ${fromY.toFixed(1)} C${(fromX + D * 0.14).toFixed(1)} ${(fromY + D * 0.12).toFixed(1)} ${(toX + D * 0.08).toFixed(1)} ${(toY - D * 0.2).toFixed(1)} ${toX.toFixed(1)} ${toY.toFixed(1)}`,
        );
    }
    shownSlats = '';
    for (const piece of pieces) piece.shownX = null;
    placeClaim();
    place();
    return geometry;
  }

  // Punto de reclamo: bajo el foco (x relativa a la banda).
  function setClaim(x) {
    geometry.claimX = x;
    placeClaim();
  }

  function placeClaim() {
    claimMark.style.transform = `translateX(${geometry.claimX.toFixed(1)}px)`;
    const planeX = (geometry.claimX - geometry.width / 2) / geometry.sMid;
    pool.style.transform = `translateX(${planeX.toFixed(1)}px)`;
  }

  // Desplazamiento con el que la pieza `index` queda en la posición x.
  function offsetFor(index, x) {
    return x + geometry.margin - index * geometry.spacing;
  }

  function setOffset(value) {
    offset = value;
    place();
  }

  // Velocidad relativa a la de crucero (0 = detenida, 1 = crucero).
  function setDrive(factor, { duration = 1, ease = 'power2.inOut' } = {}) {
    if (reducedMotion) return null;
    return gsap.to(drive, { factor, duration, ease, overwrite: true });
  }

  // ---------- Cuadro ----------

  function positionOf(piece) {
    return mod(piece.index * geometry.spacing + offset, geometry.loop) - geometry.margin;
  }

  function place() {
    const planeOffset = offset / geometry.sMid;
    const slatX = mod(planeOffset, geometry.pitch) - geometry.pitch;
    const slatTransform = `perspective(${geometry.perspective}px) rotateX(${TILT_DEG}deg) translate3d(${slatX.toFixed(2)}px, 0, 0)`;
    if (slatTransform !== shownSlats) {
      shownSlats = slatTransform;
      slats.style.transform = slatTransform;
    }

    // Rodillos: giran con la velocidad del borde frontal.
    const rollerRadius = geometry.D * 0.11;
    const roll = `${mod((planeOffset / rollerRadius) * (180 / Math.PI), 360).toFixed(1)}deg`;
    if (roll !== shownRoll) {
      shownRoll = roll;
      rollers.style.setProperty('--bag-roll', roll);
    }

    for (const piece of pieces) {
      const x = positionOf(piece);
      piece.x = x;
      const rounded = Math.round(x * 10) / 10;
      if (rounded !== piece.shownX) {
        piece.shownX = rounded;
        piece.node.style.transform = `translate3d(${rounded}px, 0, 0)`;
      }
    }
  }

  function frame(time, deltaMs) {
    const dt = Math.min(0.05, Math.max(0.001, (deltaMs || 16) / 1000));
    speed = geometry.cruise * drive.factor;
    offset += speed * dt;
    state.speed = speed;
    state.metersPerSecond = speed / (geometry.D / BALL_M);
    place();
    if (reducedMotion) return;

    // Etiquetas: péndulos amortiguados. El equilibrio se inclina con la
    // velocidad (arrastre) y la aceleración las hace oscilar al frenar o
    // arrancar; un vaivén leve imita el traqueteo de las tablillas.
    const accel = (speed - lastSpeed) / dt;
    lastSpeed = speed;
    for (const piece of pieces) {
      const k = piece.stiffness;
      const rattle = Math.sin(time * 2.1 + piece.index * 1.7) * 0.9 * drive.factor;
      const lean = -speed * 0.1 + rattle;
      const force = -k * (piece.angle - lean) - 2 * Math.sqrt(k) * 0.16 * piece.spin - accel * 0.5;
      piece.spin += force * dt;
      piece.angle = clamp(piece.angle + piece.spin * dt, -24, 24);
      const shown = Math.round(piece.angle * 20) / 20;
      if (shown !== piece.shownAngle) {
        piece.shownAngle = shown;
        piece.tag.style.transform = `rotate(${shown}deg)`;
      }
    }
  }

  // Empujón a una etiqueta (al pasar el cursor o al reclamar).
  function nudge(index, amount = 60) {
    if (reducedMotion) return;
    pieces[index].spin += amount;
  }

  // Centro del balón de una pieza, relativo a la banda (px).
  function anchor(index) {
    return { x: pieces[index].x, y: geometry.ballCY };
  }

  function isVisible(index, inset = 0) {
    const x = pieces[index].x;
    return x > inset && x < geometry.width - inset;
  }

  // Pieza de un modelo más cercana al punto de reclamo (o a x).
  function nearest(slug, x = geometry.claimX) {
    let best = -1;
    let bestDistance = Infinity;
    for (const piece of pieces) {
      if (piece.slug !== slug || piece.hidden) continue;
      const distance = Math.abs(piece.x - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = piece.index;
      }
    }
    return best;
  }

  // ---------- Estados de una pieza ----------

  function flipTag(piece, back, animate) {
    if (reducedMotion || !animate) {
      gsap.set(piece.card, { rotationY: back ? 180 : 0 });
      return;
    }
    gsap.to(piece.card, { rotationY: back ? 180 : 0, duration: DURATION.reveal, ease: EASE.inOut, overwrite: 'auto' });
  }

  // El balón deja la banda al instante (el 3D toma su lugar en el mismo cuadro).
  function hideBall(index, { animate = true } = {}) {
    const piece = pieces[index];
    piece.hidden = true;
    piece.node.classList.add('is-claimed');
    gsap.killTweensOf([piece.ball, piece.shadow, piece.ghost]);
    gsap.set(piece.ball, { autoAlpha: 0, y: 0 });
    if (reducedMotion || !animate) {
      gsap.set(piece.shadow, { autoAlpha: 0 });
      gsap.set(piece.ghost, { autoAlpha: 1, scale: 1 });
    } else {
      gsap.to(piece.shadow, { autoAlpha: 0, duration: 0.5, ease: 'power2.out' });
      gsap.fromTo(piece.ghost, { autoAlpha: 0, scale: 0.86 }, { autoAlpha: 1, scale: 1, duration: DURATION.reveal, ease: EASE.out, delay: 0.35 });
      nudge(index, 70);
    }
    flipTag(piece, true, animate);
  }

  // El balón vuelve a la banda sin animación propia.
  function showBall(index, { animate = true } = {}) {
    const piece = pieces[index];
    piece.hidden = false;
    piece.node.classList.remove('is-claimed');
    gsap.killTweensOf([piece.ball, piece.shadow, piece.ghost]);
    gsap.set(piece.ball, { autoAlpha: 1, y: 0 });
    gsap.set(piece.ghost, { autoAlpha: 0 });
    if (reducedMotion || !animate) gsap.set(piece.shadow, { autoAlpha: 1 });
    else gsap.to(piece.shadow, { autoAlpha: 1, duration: 0.4, ease: 'power2.out' });
    flipTag(piece, false, animate);
  }

  // Cambio de balón: esta pieza sube hacia el foco y se desvanece.
  function liftOut(index) {
    const piece = pieces[index];
    if (reducedMotion) return hideBall(index, { animate: false });
    piece.hidden = true;
    piece.node.classList.add('is-claimed');
    gsap.killTweensOf([piece.ball, piece.shadow, piece.ghost]);
    gsap.fromTo(piece.ball, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -geometry.D * 0.75, duration: 0.55, ease: 'power3.in' });
    gsap.to(piece.shadow, { autoAlpha: 0, duration: 0.4, ease: 'power2.out' });
    gsap.fromTo(piece.ghost, { autoAlpha: 0, scale: 0.86 }, { autoAlpha: 1, scale: 1, duration: DURATION.reveal, ease: EASE.out, delay: 0.35 });
    nudge(index, 70);
    flipTag(piece, true, true);
  }

  // Cambio de balón: el anterior vuelve a caer en su lugar de la banda.
  function dropIn(index) {
    const piece = pieces[index];
    if (reducedMotion) return showBall(index, { animate: false });
    piece.hidden = false;
    piece.node.classList.remove('is-claimed');
    gsap.killTweensOf([piece.ball, piece.shadow, piece.ghost]);
    gsap.to(piece.ghost, { autoAlpha: 0, duration: 0.3, ease: 'power2.out' });
    gsap.fromTo(piece.ball, { autoAlpha: 0, y: -geometry.D * 0.85 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out', delay: 0.3 });
    gsap.fromTo(piece.shadow, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power2.out', delay: 0.55 });
    gsap.delayedCall(0.75, () => nudge(index, -60));
    flipTag(piece, false, true);
  }

  return {
    element,
    pieces,
    geometry,
    state,
    layout,
    setClaim,
    offsetFor,
    setOffset,
    setDrive,
    frame,
    place,
    nudge,
    anchor,
    isVisible,
    nearest,
    hideBall,
    showBall,
    liftOut,
    dropIn,
    get offset() {
      return offset;
    },
  };
}
