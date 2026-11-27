import { gsap } from '@/lib/motion/gsap';
import { DURATION, EASE } from '@/lib/motion/tokens';

// Motor de la banda transportadora (portado de design/prototype/sections/
// baggage/belt.js). La banda es un plano CSS 3D (perspective + rotateX) con
// tablillas que se desplazan dentro del plano; las piezas (póster del balón
// con su etiqueta) viajan sobre la línea media del plano, donde la escala de
// perspectiva es constante, así que basta con trasladarlas en X.
//
// - La geometría se calcula solo en layout() (al cambiar de tamaño) y se
//   escribe como variables CSS.
// - Cada cuadro escribe solo transform (piezas, tablillas, etiquetas) y una
//   variable de giro de los rodillos. Ninguna lectura de layout por cuadro.
// - El movimiento es por tiempo: la sección llama a frame() solo mientras la
//   banda se ve. setDrive() la frena y la vuelve a arrancar.
// - Arrastre: grab() la toma (la marcha propia queda en espera), drag() la
//   mueve bajo el dedo y glide() la deja seguir por inercia hasta encajar una
//   pieza en el foco. resume() devuelve la marcha propia pasado un tiempo.
// - La velocidad (balanceo de etiquetas) se mide del avance real
//   de la banda, así que vale igual con marcha propia que con arrastre.

const TILT_DEG = 64; // inclinación del plano
const TILT = (TILT_DEG * Math.PI) / 180;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mod = (value: number, length: number) => ((value % length) + length) % length;

export interface PieceElements {
  node: HTMLElement;
  sprite: HTMLElement;
  shadow: HTMLElement;
  ghost: HTMLElement;
  string: SVGSVGElement;
  path: SVGPathElement;
  tag: HTMLElement;
  card: HTMLElement;
}

interface Piece extends PieceElements {
  index: number;
  ball: number;
  x: number;
  angle: number; // giro de la etiqueta (grados)
  spin: number; // velocidad angular de la etiqueta
  shownAngle: number | null;
  shownX: number | null;
  stiffness: number;
  claimed: boolean;
}

export interface BeltElements {
  root: HTMLElement;
  slats: HTMLElement;
  rollers: HTMLElement;
  claimMark: HTMLElement;
  pool: HTMLElement;
  pieces: PieceElements[];
}

export type BeltEngine = ReturnType<typeof createBeltEngine>;

export function createBeltEngine(elements: BeltElements, balls: number[], reducedMotion: boolean) {
  const { root, slats, rollers, claimMark, pool } = elements;
  const pieces: Piece[] = elements.pieces.map((piece, index) => ({
    ...piece,
    index,
    ball: balls[index],
    x: 0,
    angle: 0,
    spin: 0,
    shownAngle: null,
    shownX: null,
    stiffness: 34 + ((index * 37) % 5) * 4,
    claimed: false,
  }));

  const geometry = { width: 0, height: 0, D: 100, lipY: 0, ballCY: 0, sMid: 1, spacing: 300, loop: 1800, margin: 150, pitch: 40, perspective: 1000, cruise: 40, claimX: 0 };
  const drive = { factor: reducedMotion ? 0 : 1 };
  // Espera de la marcha propia mientras se arrastra (0 = en espera).
  const hold = { factor: 1 };
  const state = { speed: 0 };
  // px de pantalla a la altura de las piezas (objeto: lo anima la inercia).
  const track = { offset: 0 };
  let lastOffset = 0;
  let lastSpeed = 0;
  let gliding = false;
  let shownSlats = '';
  let shownRoll = '';
  let claimed = -1;

  // ---------- Geometría (solo al cambiar de tamaño) ----------

  function layout(): boolean {
    const rect = root.getBoundingClientRect();
    const { width, height } = rect;
    if (!width || !height) return false;
    const D = Math.round(clamp((height - 14) / 2.42, 60, 136));
    const tagW = Math.round(D * 0.72);
    const tagH = Math.round(D * 1.02);
    const lipY = Math.round(height - tagH * 0.9 - 12);
    const skirtH = Math.round(D * 0.36);
    const depth = D * 0.92;
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
    const spacing = Math.max(D * 2.6, (width + D * 3.2) / pieces.length);
    Object.assign(geometry, { width, height, D, lipY, ballCY, sMid, spacing, loop: spacing * pieces.length, margin: D * 1.6, pitch, perspective, cruise: D * 0.34 });

    const style = root.style;
    style.setProperty('--belt-d', `${D}px`);
    style.setProperty('--belt-tag-w', `${tagW}px`);
    style.setProperty('--belt-tag-h', `${tagH}px`);
    style.setProperty('--belt-lip-y', `${lipY}px`);
    style.setProperty('--belt-skirt-h', `${skirtH}px`);
    style.setProperty('--belt-ball-cy', `${ballCY.toFixed(1)}px`);
    style.setProperty('--belt-back-y', `${(lipY - yBack).toFixed(1)}px`);
    style.setProperty('--belt-plane-w', `${planeW}px`);
    style.setProperty('--belt-plane-h', `${planeH.toFixed(1)}px`);
    style.setProperty('--belt-persp', `${perspective}px`);
    style.setProperty('--belt-tilt', `${TILT_DEG}deg`);
    style.setProperty('--belt-pitch', `${pitch}px`);

    // Rodillos del faldón, centrados (nodos propios del motor: React no los toca).
    const rollerGap = Math.round(D * 0.72);
    const rollerCount = Math.ceil(width / rollerGap) + 2;
    const start = (width / 2) % rollerGap;
    while (rollers.childElementCount < rollerCount) {
      const roller = document.createElement('span');
      roller.appendChild(document.createElement('i'));
      rollers.appendChild(roller);
    }
    while (rollers.childElementCount > rollerCount) rollers.lastElementChild?.remove();
    Array.from(rollers.children).forEach((roller, index) => {
      (roller as HTMLElement).style.left = `${(start + (index - 1) * rollerGap).toFixed(1)}px`;
    });

    // Cordel de cada etiqueta: del balón al ojal (coordenadas de la pieza).
    const fromX = D * 0.22;
    const fromY = ballCY + D * 0.34;
    const toX = D * 0.24;
    const toY = lipY + tagW * 0.17;
    const d = `M${fromX.toFixed(1)} ${fromY.toFixed(1)} C${(fromX + D * 0.14).toFixed(1)} ${(fromY + D * 0.12).toFixed(1)} ${(toX + D * 0.08).toFixed(1)} ${(toY - D * 0.2).toFixed(1)} ${toX.toFixed(1)} ${toY.toFixed(1)}`;
    for (const piece of pieces) {
      piece.string.setAttribute('width', String(Math.ceil(D * 0.6)));
      piece.string.setAttribute('height', String(Math.ceil(toY + 4)));
      piece.path.setAttribute('d', d);
      piece.shownX = null;
    }
    shownSlats = '';
    placeClaim();
    place();
    return true;
  }

  // Punto del foco: bajo el visor 3D (x relativa a la banda).
  function setClaim(x: number) {
    geometry.claimX = x;
    placeClaim();
  }

  function placeClaim() {
    claimMark.style.transform = `translateX(${geometry.claimX.toFixed(1)}px)`;
    const planeX = (geometry.claimX - geometry.width / 2) / geometry.sMid;
    pool.style.transform = `translateX(${planeX.toFixed(1)}px)`;
  }

  // Desplazamiento con el que la pieza `index` queda en la posición x.
  const offsetFor = (index: number, x: number) => x + geometry.margin - index * geometry.spacing;

  function setOffset(value: number) {
    track.offset = value;
    lastOffset = value;
    place();
  }

  // Velocidad relativa a la de crucero (0 = detenida, 1 = crucero).
  function setDrive(factor: number, { duration = 1, ease = 'power2.inOut' } = {}) {
    if (reducedMotion) return;
    gsap.to(drive, { factor, duration, ease, overwrite: true });
  }

  // ---------- Cuadro ----------

  const positionAt = (piece: Piece, at: number) => mod(piece.index * geometry.spacing + at, geometry.loop) - geometry.margin;

  function place() {
    const offset = track.offset;
    const planeOffset = offset / geometry.sMid;
    const slatX = mod(planeOffset, geometry.pitch) - geometry.pitch;
    const slatTransform = `perspective(${geometry.perspective}px) rotateX(${TILT_DEG}deg) translate3d(${slatX.toFixed(2)}px, 0, 0)`;
    if (slatTransform !== shownSlats) {
      shownSlats = slatTransform;
      slats.style.transform = slatTransform;
    }
    // Rodillos: giran con la velocidad del borde frontal.
    const radius = geometry.D * 0.11;
    const roll = `${mod((planeOffset / radius) * (180 / Math.PI), 360).toFixed(1)}deg`;
    if (roll !== shownRoll) {
      shownRoll = roll;
      rollers.style.setProperty('--belt-roll', roll);
    }
    for (const piece of pieces) {
      const x = positionAt(piece, offset);
      piece.x = x;
      const rounded = Math.round(x * 10) / 10;
      if (rounded !== piece.shownX) {
        piece.shownX = rounded;
        piece.node.style.transform = `translate3d(${rounded}px, 0, 0)`;
      }
    }
  }

  function frame(time: number, deltaMs: number) {
    const dt = Math.min(0.05, Math.max(0.001, (deltaMs || 16) / 1000));
    const motor = geometry.cruise * drive.factor * hold.factor;
    track.offset += motor * dt;
    // Velocidad real (marcha propia, arrastre o inercia), suavizada: los
    // eventos del puntero no llegan al mismo ritmo que los cuadros.
    const measured = (track.offset - lastOffset) / dt;
    lastOffset = track.offset;
    const speed = state.speed + (measured - state.speed) * Math.min(1, dt * 14);
    state.speed = speed;
    place();
    // Etiquetas: péndulos amortiguados. El equilibrio se inclina con la
    // velocidad y la aceleración las hace oscilar al frenar o arrancar
    // (acotadas: un arrastre rápido no las deja girando sin fin).
    const accel = clamp((speed - lastSpeed) / dt, -300, 300);
    lastSpeed = speed;
    const motion = drive.factor * hold.factor;
    for (const piece of pieces) {
      const k = piece.stiffness;
      const rattle = Math.sin(time * 2.1 + piece.index * 1.7) * 0.9 * motion;
      const lean = clamp(-speed * 0.1, -18, 18) + rattle;
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

  // Empujón a una etiqueta (al pasar el cursor o al elegir).
  function nudge(index: number, amount = 60) {
    if (!reducedMotion && pieces[index]) pieces[index].spin += amount;
  }

  // Copia de un balón más cercana al foco.
  function nearest(ball: number): number {
    let best = -1;
    let bestDistance = Infinity;
    for (const piece of pieces) {
      if (piece.ball !== ball) continue;
      const distance = Math.abs(piece.x - geometry.claimX);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = piece.index;
      }
    }
    return best;
  }

  // ---------- Arrastre ----------

  // Toma la banda: corta la inercia en curso y deja la marcha propia en espera.
  function grab() {
    gsap.killTweensOf(track);
    gsap.killTweensOf(hold);
    gliding = false;
    hold.factor = 0;
  }

  // Mueve la banda dx px de pantalla (las piezas siguen al puntero 1:1).
  function drag(dx: number) {
    track.offset += dx;
    place();
  }

  // Desplazamiento final más cercano a `projected` con una pieza en el foco.
  function snapFrom(projected: number) {
    let best = -1;
    let bestDelta = Infinity;
    for (const piece of pieces) {
      const delta = geometry.claimX - positionAt(piece, projected);
      if (Math.abs(delta) < Math.abs(bestDelta)) {
        bestDelta = delta;
        best = piece.index;
      }
    }
    return { offset: projected + bestDelta, piece: best };
  }

  // Suelta la banda con velocidad `velocity` (px/s): sigue por inercia y
  // frena hasta encajar la pieza más cercana en el foco. Sin inercia (o con
  // movimiento reducido) encaja al instante desde donde quedó.
  function glide(velocity: number, onSettle: (piece: number) => void) {
    gsap.killTweensOf(track);
    const inertia = !reducedMotion && Math.abs(velocity) > 60;
    // Proyección: la distancia que recorrería frenando de forma pareja.
    const reach = clamp(velocity * 0.32, -geometry.spacing * 3, geometry.spacing * 3);
    const target = snapFrom(track.offset + (inertia ? reach : 0));
    const distance = target.offset - track.offset;
    if (reducedMotion || Math.abs(distance) < 0.5) {
      setOffset(target.offset);
      gliding = false;
      onSettle(target.piece);
      return;
    }
    // power3.out arranca a 3 veces su velocidad media: con esta duración la
    // banda sale del dedo a la misma velocidad que traía.
    const duration = inertia ? clamp((3 * Math.abs(distance)) / Math.abs(velocity), 0.45, 1.3) : 0.45;
    gliding = true;
    gsap.to(track, {
      offset: target.offset,
      duration,
      ease: inertia ? 'power3.out' : 'power2.out',
      onUpdate: place,
      onComplete: () => {
        gliding = false;
        onSettle(target.piece);
      },
    });
  }

  // La marcha propia vuelve pasados `delay` segundos (con una rampa suave).
  function resume(delay: number) {
    gsap.killTweensOf(hold);
    if (reducedMotion) return;
    gsap.to(hold, { factor: 1, duration: 1.8, delay, ease: 'power2.inOut' });
  }

  // ---------- Pieza en el foco ----------

  // Lleva la pieza al punto del foco por el camino más corto (al elegir con
  // el teclado o al restaurar una recarga): con animación o al instante.
  function bring(index: number, animate: boolean) {
    const piece = pieces[index];
    if (!piece) return;
    const delta = mod(geometry.claimX - positionAt(piece, track.offset) + geometry.loop / 2, geometry.loop) - geometry.loop / 2;
    gsap.killTweensOf(track);
    gliding = false;
    if (!animate || reducedMotion) {
      setOffset(track.offset + delta);
      return;
    }
    gsap.to(track, { offset: track.offset + delta, duration: 0.9, ease: 'power2.inOut', onUpdate: place });
  }

  // El balón de la pieza sube al foco (o se oculta al instante) y la etiqueta
  // se da vuelta; el anterior vuelve a caer en su lugar de la banda.
  function claim(index: number, animate: boolean) {
    if (index === claimed || !pieces[index]) return;
    const previous = pieces[claimed];
    const next = pieces[index];
    claimed = index;
    const D = geometry.D;
    if (previous) {
      previous.claimed = false;
      previous.node.removeAttribute('data-claimed');
      gsap.killTweensOf([previous.sprite, previous.shadow, previous.ghost]);
      if (animate) {
        gsap.to(previous.ghost, { opacity: 0, duration: DURATION.ui, ease: 'power2.out' });
        gsap.fromTo(previous.sprite, { opacity: 0, y: -D * 0.85 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', delay: 0.3 });
        gsap.fromTo(previous.shadow, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power2.out', delay: 0.55 });
        gsap.delayedCall(0.75, () => nudge(previous.index, -60));
      } else {
        gsap.set(previous.ghost, { opacity: 0 });
        gsap.set([previous.sprite, previous.shadow], { opacity: 1, y: 0 });
      }
    }
    next.claimed = true;
    next.node.setAttribute('data-claimed', '');
    gsap.killTweensOf([next.sprite, next.shadow, next.ghost]);
    if (animate) {
      gsap.fromTo(next.sprite, { opacity: 1, y: 0 }, { opacity: 0, y: -D * 0.75, duration: 0.55, ease: 'power3.in' });
      gsap.to(next.shadow, { opacity: 0, duration: 0.4, ease: 'power2.out' });
      gsap.fromTo(next.ghost, { opacity: 0, scale: 0.86 }, { opacity: 1, scale: 1, duration: DURATION.reveal, ease: EASE.out.gsap, delay: 0.35 });
      nudge(index, 70);
    } else {
      gsap.set([next.sprite, next.shadow], { opacity: 0, y: 0 });
      gsap.set(next.ghost, { opacity: 1, scale: 1 });
    }
  }

  function destroy() {
    gsap.killTweensOf([drive, hold, track]);
    for (const piece of pieces) gsap.killTweensOf([piece.sprite, piece.shadow, piece.ghost]);
  }

  return {
    geometry,
    layout,
    setClaim,
    offsetFor,
    setOffset,
    setDrive,
    frame,
    place,
    nudge,
    nearest,
    bring,
    claim,
    destroy,
    grab,
    drag,
    glide,
    resume,
    isGliding: () => gliding,
    pieceBall: (index: number) => pieces[index]?.ball ?? -1,
    isClaimed: (index: number) => index === claimed,
  };
}
