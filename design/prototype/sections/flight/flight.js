// Sección "flight": carga inicial, portada con un zapato en 3D (el Air Jordan 1
// por defecto, ver HERO_OPTIONS en content.js) y
// "Pieza por pieza": cuatro detalles del zapato que se ven al seleccionarlos
// en la lista, y un "Ver catálogo" con despegue del zapato.
//
// El scroll nunca maneja la animación (CLAUDE.md, Motion): no hay pin ni
// scrub. Todo se mueve por tiempo y ScrollTrigger solo dispara cambios de modo.
//
// Estructura:
//   .flight-track    capa de escena del alto de toda la sección (absoluta)
//     .flight-sticky fondo, halo, canvas 3D, retícula y rótulos. En
//                    escritorio es sticky: se queda arriba mientras se cruzan
//                    portada y detalles, y se va con la sección. En móvil va
//                    en el lugar de la portada o en el de los detalles.
//   .flight-hero     portada
//   .flight-inspect  detalles (sección anidada #inspeccion)
//
// Modos: hero (portada, el zapato flota), inspect (detalle seleccionado),
// away (la sección quedó atrás) y takeoff (salida al catálogo). Dentro de
// los detalles, los rótulos solo aparecen con el bloque alineado arriba; antes,
// en escritorio, el zapato espera en la columna libre (pose "transit"). Un
// callback del ticker, registrado antes que el render, compone la pose
// (zapato + cámara) con la flotación, el aterrizaje inicial, el puntero y el
// giro manual. Con movimiento reducido no hay ciclo de dibujo: cada cambio
// dibuja un cuadro.

import { runBoot, shouldPlayBoot } from './boot.js';
import { goTo } from '../../core/header.js';
import { LIGHT_PRESETS } from '../../core/stage.js';
import { COPY, HERO, HOTSPOTS, PRODUCT_SLUG, SHOE } from './content.js';

const FOV = 28;
const SHOE_LENGTH = SHOE.length;
const SHOE_HEIGHT = SHOE.height;
const SHOE_CENTER = [0, SHOE_HEIGHT / 2, 0];
const HEEL_POINT = [-0.146, 0.05, 0];
// Lado de la pantalla hacia donde apunta la punta en el plano de perfil.
const TOE_SIDE = Math.cos(SHOE.baseYaw) >= 0 ? 1 : -1;
const TAN_HALF = Math.tan((FOV * Math.PI) / 360);
const MOBILE_QUERY = '(max-width: 860px), (max-aspect-ratio: 9/10)';

// Tiempos (segundos). Con movimiento reducido los cambios de cámara son instantáneos.
const TIMING = {
  move: 1.15, // cámara de un punto al siguiente
  entrance: 1.5, // primer punto al entrar a la inspección
  drift: 4.5, // vaivén lento mientras se mira un punto
  mode: 1.3, // portada ↔ inspección
  takeoff: 1.2,
};

// Portada en móvil: alto de la caja de la retícula respecto del largo del
// zapato, alto máximo (fracción de la pantalla) y borde superior en píxeles
// (debajo del encabezado).
const MOBILE_HERO = { boxRatio: 0.885, maxShare: 0.35, top: 96 };

const TAPE_PX_PER_DEG = 4;
const pad = (value, length) => String(value).padStart(length, '0');

// ---------- Geometría ----------

const viewHeight = (distance) => 2 * distance * TAN_HALF;
// Distancia de cámara para que un largo ocupe una fracción del ancho o del alto visible.
const fitWidth = (length, fraction, aspect) => length / (fraction * 2 * TAN_HALF * aspect);
const fitHeight = (length, fraction) => length / (fraction * 2 * TAN_HALF);

// Medidas de la escena (el canvas mide una ventana). Se leen solo al
// refrescar, nunca por cuadro. En escritorio también se mide la columna libre
// entre el texto de la izquierda y los datos de la derecha: ahí espera el
// zapato mientras la portada y los detalles se cruzan al bajar.
function readLayout(canvas, root) {
  const width = canvas?.clientWidth || window.innerWidth;
  const height = canvas?.clientHeight || window.innerHeight;
  const mobile = window.matchMedia(MOBILE_QUERY).matches;
  const layout = { width, height, aspect: width / height, mobile, free: null };
  if (!mobile && root) {
    const rects = (selectors) =>
      selectors
        .map((selector) => root.querySelector(selector)?.getBoundingClientRect())
        .filter((rect) => rect && rect.width > 0);
    const from = Math.max(0, ...rects(['.flight-hero__lead', '.flight-hero__actions', '.flight-instruments__list', '.flight-inspect__head']).map((rect) => rect.right)) + 32;
    const to = Math.min(width, ...rects(['.flight-instruments__cue', '.flight-inspect__status']).map((rect) => rect.left)) - 32;
    if (to - from > 280) layout.free = { from, to };
  }
  return layout;
}

// Punto del modelo (pose canónica) a coordenadas de mundo para una pose dada.
// Replica el orden de three.js (Euler XYZ: primero cabeceo, luego rumbo, luego alabeo).
function worldPoint([px, py, pz], pose) {
  const s = pose.scale;
  let x = px * s;
  let y = (py - SHOE_HEIGHT / 2) * s;
  let z = pz * s;
  let c = Math.cos(pose.pitch);
  let n = Math.sin(pose.pitch);
  [x, y] = [x * c - y * n, x * n + y * c];
  c = Math.cos(pose.yaw);
  n = Math.sin(pose.yaw);
  [x, z] = [x * c + z * n, -x * n + z * c];
  c = Math.cos(pose.bank);
  n = Math.sin(pose.bank);
  [y, z] = [y * c - z * n, y * n + z * c];
  return [x + pose.x, y + pose.y, z + pose.z];
}

// Giro absoluto a partir de uno relativo (> 0 acerca la punta a la cámara).
const absoluteYaw = (relative = 0) => SHOE.baseYaw + SHOE.yawSign * relative;

// Poses con nombre para el tamaño actual. rim y shadow son factores sobre el
// contraluz lima y la sombra de contacto del preset del tema (se bajan donde
// brillan de más o donde la cámara queda al ras del piso).
function computePoses(layout) {
  const { aspect, mobile } = layout;
  const shoe = (values = {}) => ({ x: 0, y: 0, z: 0, pitch: 0, bank: 0, scale: 1, idle: 0, rim: 1, shadow: 1, ...values, yaw: absoluteYaw(values.yaw) });
  const aim = (pose, [tx, ty, tz], distance, elevation) => ({
    ...pose,
    tx,
    ty,
    tz,
    cx: tx,
    cy: ty + elevation * distance,
    cz: tz + distance,
  });
  const poses = {};

  // Portada: el zapato a la derecha (escritorio) o arriba (móvil), en actitud
  // de ascenso y con la punta hacia la cámara.
  if (mobile) {
    // En móvil se ubica en píxeles: debajo del encabezado y de la etiqueta
    // Ref., y nunca más alto que un 35% de la pantalla, para que el titular
    // quede siempre debajo (el CSS reserva ese alto con --flight-hero-stage).
    const fraction = Math.min(0.8, (MOBILE_HERO.maxShare * layout.height) / (MOBILE_HERO.boxRatio * layout.width));
    const distance = fitWidth(SHOE_LENGTH, fraction, aspect);
    const boxHeight = MOBILE_HERO.boxRatio * fraction * layout.width;
    const centerY = MOBILE_HERO.top + boxHeight / 2;
    const ty = (centerY / layout.height - 0.5) * viewHeight(distance);
    poses.hero = aim(shoe({ y: 0.012, yaw: 0.42, pitch: 0.08, bank: 0.06, idle: 1 }), [0, ty, 0], distance, 0.07);
  } else {
    const distance = Math.max(fitWidth(SHOE_LENGTH, 0.38, aspect), fitHeight(SHOE_HEIGHT, 0.42));
    const x = 0.2 * viewHeight(distance) * aspect;
    poses.hero = aim(shoe({ x, y: 0.012, yaw: 0.5, pitch: 0.09, bank: 0.06, idle: 1 }), [0, -0.01, 0], distance, 0.07);
  }

  // Perfil: referencia de encuadre para los planos de inspección.
  const profileDistance = mobile
    ? fitWidth(SHOE_LENGTH, 0.8, aspect)
    : Math.max(fitWidth(SHOE_LENGTH, 0.38, aspect), fitHeight(SHOE_HEIGHT, 0.36));
  // En móvil el zapato sube para dejar sitio a la tarjeta; en escritorio queda en la franja central.
  const profileLift = mobile ? 0.11 : 0.02;
  poses.profile = aim(shoe(), [0, -profileLift * viewHeight(profileDistance), 0], profileDistance, 0.05);

  // Un plano por punto: el encuadre se acerca al punto según focus y corre el
  // zapato según shift para dejar aire a la etiqueta.
  HOTSPOTS.forEach((spot, index) => {
    const pose = shoe(mobile ? { ...spot.pose, yaw: spot.mobile.yaw } : { ...spot.pose });
    const zoom = mobile ? spot.mobile.zoom : spot.camera.zoom;
    const focus = mobile ? 0.2 : spot.camera.focus;
    const shift = mobile ? 0 : spot.camera.shift;
    const distance = profileDistance / zoom;
    const height = viewHeight(distance);
    const [hx, hy, hz] = worldPoint(spot.point, pose);
    const target = [
      pose.x + (hx - pose.x) * focus - shift * height * aspect,
      pose.y + (hy - pose.y) * focus - profileLift * height,
      pose.z + (hz - pose.z) * focus,
    ];
    poses[`spot${index}`] = aim(pose, target, distance, spot.camera.elev);
    // Deriva lenta mientras se lee, para que el plano nunca quede muerto.
    poses[`spot${index}b`] = aim({ ...pose, yaw: pose.yaw + SHOE.yawSign * 0.06 }, target, distance * 0.965, spot.camera.elev);
  });

  // Tránsito (escritorio): mientras la portada y los detalles se cruzan, el
  // zapato espera en la columna libre del centro, en tres cuartos, para no
  // quedar debajo de textos ni datos. Sin columna libre, usa el primer plano.
  if (layout.free) {
    const { from, to } = layout.free;
    const lengthPx = Math.min((to - from) * 0.92, layout.width * 0.34);
    const projected = 0.32; // largo aparente del zapato en tres cuartos (metros)
    const distance = (projected * layout.width) / lengthPx / aspect / (2 * TAN_HALF);
    const height = viewHeight(distance);
    const centerX = (from + to) / 2;
    const pose = shoe({ yaw: 0.25, pitch: 0.03, bank: 0.08 });
    const target = [-(centerX / layout.width - 0.5) * height * aspect, (0.5 - 0.5) * height + 0.004, 0];
    poses.transit = aim(pose, target, distance, 0.06);
  } else {
    poses.transit = poses.spot0;
  }

  // Listo para despegar: el zapato arriba del titular final, con la nariz
  // levantada. Despega hacia donde apunta la punta, en diagonal hacia arriba.
  const readyDistance = mobile
    ? fitWidth(SHOE_LENGTH, 0.62, aspect)
    : Math.max(fitWidth(SHOE_LENGTH, 0.28, aspect), fitHeight(SHOE_HEIGHT, 0.27));
  const readyHeight = viewHeight(readyDistance);
  poses.ready = aim(shoe({ yaw: 0.12, pitch: 0.1, bank: 0.06, rim: 0.8, shadow: 0.6 }), [0, -(mobile ? 0.17 : 0.2) * readyHeight, 0], readyDistance, 0.1);
  poses.takeoff = {
    ...poses.ready,
    x: TOE_SIDE * 0.62 * readyHeight * aspect,
    y: 0.72 * readyHeight,
    z: -0.3,
    yaw: absoluteYaw(0.3),
    pitch: 0.55,
    bank: 0.16,
    scale: 0.9,
  };
  return poses;
}

// Eases del despegue por eje: avanza primero y trepa después (trayectoria curva).
const TAKEOFF_EASES = {
  x: 'power2.in',
  z: 'power2.in',
  scale: 'power2.in',
  y: 'power3.in',
  yaw: 'power2.inOut',
  pitch: 'power2.inOut',
  bank: 'power2.inOut',
};
const TAKEOFF_ROTATION_SHARE = 0.55; // los giros terminan antes que la traslación
const isRotation = (key) => key === 'yaw' || key === 'pitch' || key === 'bank';

// Pose del despegue en la fracción s, con el ease de cada eje (igual que la animación).
const easeCache = new Map();
function takeoffPoseAt(from, to, s) {
  const result = { ...from };
  for (const [key, ease] of Object.entries(TAKEOFF_EASES)) {
    if (!easeCache.has(ease)) easeCache.set(ease, window.gsap.parseEase(ease));
    const local = Math.min(1, s / (isRotation(key) ? TAKEOFF_ROTATION_SHARE : 1));
    result[key] = from[key] + (to[key] - from[key]) * easeCache.get(ease)(local);
  }
  return result;
}

// ---------- Marcado ----------

const arrowRight =
  '<svg class="flight-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" /></svg>';
const arrowDown =
  '<svg class="flight-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v11M4 9l4 4 4-4" /></svg>';
const arrowUp =
  '<svg class="flight-icon flight-icon--up" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M5.5 4H12v6.5" /></svg>';

function tapeMarkup() {
  // Escala de giro de -60° a 420° para poder envolver sin saltos.
  let ticks = '';
  let labels = '';
  for (let degree = -60; degree <= 420; degree += 5) {
    const x = (degree + 60) * TAPE_PX_PER_DEG;
    const major = degree % 30 === 0;
    ticks += `M${x} ${major ? 0 : 4}V10`;
    if (major) {
      const turn = ((degree % 360) + 360) % 360;
      labels += `<text x="${x}" y="23">${turn}</text>`;
    }
  }
  const width = 480 * TAPE_PX_PER_DEG;
  return `<svg class="flight-tape__strip" width="${width}" height="26" viewBox="0 0 ${width} 26"><path d="${ticks}" />${labels}</svg>`;
}

// Titular con el nombre del zapato. El texto real va en un span accesible;
// las letras animadas son copias aria-hidden (una por carácter, con data-c
// para el contorno de la segunda línea y data-text para el barrido de luz).
function headlineMarkup() {
  const [first, second] = HERO.headline;
  const chars = (text) =>
    [...text]
      .map((char) => (char === ' ' ? '<span class="flight-char flight-char--space"> </span>' : `<span class="flight-char" data-c="${char}"><span class="flight-char__fill">${char}</span></span>`))
      .join('');
  const longest = Math.max(first.length, second.length);
  return `<h1 class="flight-hero__title flight-name display" style="--name-chars: ${longest}">
          <span class="visually-hidden">${first} ${second}</span>
          <span class="flight-name__line" data-text="${first}" aria-hidden="true">${chars(first)}</span>
          <span class="flight-name__line flight-name__line--two" data-text="${second}" aria-hidden="true">${chars(second)}</span>
        </h1>`;
}

function template({ product, status, price }) {
  const total = pad(HOTSPOTS.length, 2);
  // Cada fila de la lista es el control que lleva la cámara a ese punto.
  const rail = HOTSPOTS.map(
    (spot, index) => `
      <li>
        <button class="flight-rail__item" type="button" data-step="${index}" aria-pressed="false" tabindex="${index === 0 ? 0 : -1}">
          <span class="flight-rail__index mono"><span class="visually-hidden">${COPY.jumpTo} </span>${pad(index + 1, 2)}</span>
          <span class="flight-rail__copy">
            <span class="flight-rail__name">${spot.title}</span>
            <span class="flight-rail__text">${spot.text}</span>
          </span>
          <span class="flight-rail__check" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2.6 6.3 5 8.6 9.6 3.7" /></svg></span>
        </button>
      </li>`,
  ).join('');
  const marks = HOTSPOTS.map(() => '<div class="flight-mark"><span class="flight-mark__ring"></span><span class="flight-mark__dot"></span></div>').join('');
  const labels = HOTSPOTS.map(
    (spot, index) => `
      <div class="flight-label hud-frame" data-side="${spot.slot.side}" style="--slot-y: ${spot.slot.y}">
        <p class="hud-label hud-label--primary">${pad(index + 1, 2)} / ${total}</p>
        <p class="flight-label__title">${spot.title}</p>
        <p class="flight-label__text">${spot.text}</p>
      </div>`,
  ).join('');
  const alert = status.tone === 'alert';

  return `
    <div class="flight-track">
    <div class="flight-sticky">
      <div class="flight-backdrop" aria-hidden="true">
        <div class="flight-backdrop__grid hud-grid"></div>
        <div class="flight-halo stage-halo"></div>
      </div>
      <canvas class="flight-stage" aria-hidden="true"></canvas>
      <div class="flight-reticle" aria-hidden="true">
        <div class="flight-reticle__inner hud-frame">
          <p class="flight-reticle__tag hud-label">${COPY.reticleTarget} · ${COPY.reference(product.flight)}</p>
          <p class="flight-reticle__lock hud-label hud-label--primary"><span class="flight-reticle__pip"></span>${COPY.reticleLock}</p>
          <span class="flight-reticle__tick flight-reticle__tick--left"></span>
          <span class="flight-reticle__tick flight-reticle__tick--right"></span>
          <div class="flight-tape">
            <div class="flight-tape__window">${tapeMarkup()}</div>
            <span class="flight-tape__caret"></span>
          </div>
        </div>
      </div>
      <svg class="flight-lines" aria-hidden="true">
        <path class="flight-trail" />
        ${HOTSPOTS.map(() => '<path class="flight-leader" />').join('')}
      </svg>
      <div class="flight-marks" aria-hidden="true">${marks}</div>
      <div class="flight-labels" aria-hidden="true">${labels}</div>
      <div class="flight-grip" role="slider" tabindex="0" aria-label="${COPY.gripLabel}" aria-valuemin="0" aria-valuemax="359" aria-valuenow="0" aria-valuetext="${COPY.gripValue(0)}"></div>
    </div>
    </div>

    <div class="flight-hero">
      <div class="flight-hero__content">
        <p class="flight-kicker hud-label">${product.brand} · ${COPY.reference(product.flight)}</p>
        ${headlineMarkup()}
        <p class="flight-hero__lead lead">${COPY.heroLead}</p>
        <div class="flight-hero__actions">
          <a class="btn btn--primary" href="#catalogo" data-flight-catalog>${COPY.ctaCatalog}${arrowRight}</a>
          <a class="btn btn--ghost" href="#inspeccion" data-flight-inspect>${COPY.ctaInspect}${arrowDown}</a>
        </div>
      </div>
      <div class="flight-instruments">
        <dl class="flight-instruments__list">
          <div class="flight-instrument"><dt class="hud-label">${COPY.readoutTurn}</dt><dd class="mono"><span data-turn>000</span><small>°</small></dd></div>
          <div class="flight-instrument flight-instrument--desk"><dt class="hud-label">${COPY.readoutWeight}</dt><dd class="mono">${product.specs.weightGrams}<small>g</small></dd></div>
          <div class="flight-instrument"><dt class="hud-label">${COPY.readoutPrice}</dt><dd class="mono">${price}</dd></div>
          <div class="flight-instrument flight-instrument--meta"><dt class="hud-label">${COPY.readoutSizes}</dt><dd class="mono">${product.sizes}</dd></div>
          <div class="flight-instrument flight-instrument--status" data-tone="${status.tone}"><dt class="hud-label">${COPY.readoutAvailability}</dt><dd class="mono"><span class="status-dot${alert ? ' status-dot--alert' : ''}" aria-hidden="true"></span>${status.label}</dd></div>
        </dl>
        <p class="flight-instruments__cue hud-label" aria-hidden="true"><span class="flight-cue__pointer">${COPY.scrollCuePointer}</span><span class="flight-cue__touch">${COPY.scrollCueTouch}</span><span class="flight-cue" aria-hidden="true"></span></p>
      </div>
    </div>

    <section class="flight-inspect" id="inspeccion" aria-labelledby="flight-inspect-title">
      <div class="flight-inspect__ui">
        <header class="flight-inspect__head">
          <p class="hud-label">${COPY.reference(product.flight)} · ${product.name}</p>
          <h2 class="flight-inspect__title" id="flight-inspect-title">${COPY.inspectTitle.map((line) => `<span>${line}</span>`).join(' ')}</h2>
        </header>
        <div class="flight-inspect__status">
          <p class="hud-label">${COPY.progressLabel}</p>
          <p class="flight-inspect__state mono" data-state aria-hidden="true">${COPY.progress(0, HOTSPOTS.length)}</p>
          <p class="visually-hidden" aria-live="polite" data-state-live></p>
          <p class="flight-inspect__hdg hud-label" aria-hidden="true">${COPY.readoutTurn} <span class="mono" data-turn-inspect>000</span>°</p>
        </div>
        <div class="flight-inspect__rail">
          <div class="flight-rail__head">
            <p class="hud-label" id="flight-rail-title">${COPY.railTitle}</p>
            <p class="hud-label" aria-hidden="true"><span class="mono" data-counter>01</span> / ${total}</p>
          </div>
          <p class="flight-rail__hint" id="flight-rail-hint">${COPY.railHint}</p>
          <div class="flight-rail__body">
            <div class="flight-rail__track" aria-hidden="true"><span class="flight-rail__fill"></span></div>
            <ol class="flight-rail" aria-labelledby="flight-rail-title" aria-describedby="flight-rail-hint">${rail}</ol>
          </div>
        </div>
        <dl class="flight-specs">
          <div class="flight-spec"><dt class="hud-label">${COPY.specWeight}</dt><dd class="mono"><span data-spec-weight>${product.specs.weightGrams}</span> g</dd></div>
          <div class="flight-spec"><dt class="hud-label">${COPY.specStack}</dt><dd class="mono"><span data-spec-stack>${product.specs.stackMm}</span> mm</dd></div>
          <div class="flight-spec flight-spec--text"><dt class="hud-label">${COPY.specUpper}</dt><dd>${product.specs.upper}</dd></div>
          <div class="flight-spec flight-spec--text"><dt class="hud-label">${COPY.specSole}</dt><dd>${product.specs.sole}</dd></div>
        </dl>
        <div class="flight-card hud-frame" aria-hidden="true">
          <p class="hud-label hud-label--primary"><span data-card-index>01</span> / ${total}</p>
          <p class="flight-card__title" data-card-title>${HOTSPOTS[0].title}</p>
          <p class="flight-card__text" data-card-text>${HOTSPOTS[0].text}</p>
        </div>
        <div class="flight-launch">
          <div class="flight-done" hidden>
            <p class="flight-done__label hud-label hud-label--primary"><span class="flight-tick" aria-hidden="true"></span>${COPY.complete}</p>
            <p class="flight-done__title"><span class="flight-tick" aria-hidden="true"></span>${COPY.completeTitle.join(' ')}</p>
          </div>
          <a class="btn btn--ghost flight-takeoff" href="#catalogo" data-flight-takeoff>${COPY.ctaFinish}${arrowUp}</a>
        </div>
      </div>
    </section>`;
}


// ---------- Montaje ----------

export async function mount(root, context) {
  const { motion, hud, catalog, lite, reducedMotion: reduced, createStage, theme } = context;
  const { gsap, ScrollTrigger, EASE, DURATION, scrollTo } = motion;
  const product = catalog.findProduct(PRODUCT_SLUG);
  const status = catalog.FLIGHT_STATUS[product.status];

  root.classList.add('flight');
  // Acento propio de la portada elegida (ver HERO_OPTIONS en content.js).
  if (HERO.accent) root.dataset.heroAccent = HERO.accent;
  root.classList.toggle('flight--reduced', reduced);
  root.innerHTML = template({ product, status, price: catalog.formatPrice(product.price) });

  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  $$('.hud-frame').forEach((frame) => hud.frameCorners(frame));
  const canvas = $('.flight-stage');
  const inspect = $('.flight-inspect');

  let layout = readLayout(canvas, root);
  let poses = computePoses(layout);
  root.classList.toggle('is-mobile', layout.mobile);

  // Estado que se compone en cada cuadro. intro: desvío del aterrizaje inicial.
  const pose = { ...poses.hero };
  let poseName = 'hero';
  const intro = reduced
    ? { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 }
    : { x: TOE_SIDE * -0.3, y: 0.42, z: -0.32, yaw: SHOE.yawSign * -1.1, pitch: -0.32, bank: 0.24 };
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const telemetry = { turn: 0 };
  // Giro manual (arrastre o teclado): se suma a la pose y vuelve a 0 solo.
  const spin = { yaw: 0, tilt: 0 };
  let dragging = false;
  let stage = null;
  let stageVisible = true;

  // Compone la pose antes del render: el callback se registra antes que el
  // escenario, así el ticker de GSAP lo ejecuta primero en cada cuadro.
  const compose = (time, deltaTime) => {
    if (!stage || !stageVisible) return;
    const dt = Math.max(Math.min(deltaTime, 64), 1) / 1000;
    const follow = 1 - Math.exp(-dt * 3.2);
    pointer.x += (pointer.targetX - pointer.x) * follow;
    pointer.y += (pointer.targetY - pointer.y) * follow;

    const idle = reduced ? 0 : pose.idle;
    const float = Math.sin(time * 1.15) * 0.006 * idle;
    const drift = Math.sin(time * 0.3) * 0.18 * idle;
    const { sneaker, camera, cameraTarget } = stage;
    sneaker.position.set(pose.x + intro.x * idle, pose.y + float + intro.y * idle, pose.z + intro.z * idle);
    sneaker.rotation.set(
      pose.bank + spin.tilt + (intro.bank + pointer.y * 0.08) * idle,
      pose.yaw + spin.yaw + (intro.yaw + drift + pointer.x * 0.2) * idle,
      pose.pitch + (intro.pitch + Math.sin(time * 0.8) * 0.01) * idle,
    );
    sneaker.scale.setScalar(pose.scale);
    const preset = LIGHT_PRESETS[theme.get()] ?? LIGHT_PRESETS.dark;
    stage.lights.rim.intensity = preset.rim * pose.rim;
    stage.shadowOpacity = preset.shadow * pose.shadow;
    camera.position.set(pose.cx + pointer.x * 0.025 * idle, pose.cy - pointer.y * 0.018 * idle, pose.cz);
    cameraTarget.set(pose.tx, pose.ty, pose.tz);

    // Lectura de giro: el ángulo real del zapato (crece al arrastrar hacia la derecha).
    const turnDegrees = ((sneaker.rotation.y - SHOE.baseYaw) * 180) / Math.PI;
    telemetry.turn = Math.round(((turnDegrees % 360) + 360) % 360) % 360;
  };
  if (!reduced) gsap.ticker.add(compose);

  // Las luces por tema las aplica el escenario (LIGHT_PRESETS en core/stage.js).
  stage = createStage(canvas, { models: [PRODUCT_SLUG], lite, fov: FOV, cameraZ: poses.hero.cz });
  // Con movimiento reducido no hay ciclo de dibujo: se dibuja un cuadro por cada cambio.
  if (reduced) stage.setRendering(false);
  const requestRender = () => {
    if (!reduced || !stageVisible) return;
    compose(gsap.ticker.time, 16);
    stage.renderOnce();
  };

  if (new URLSearchParams(location.search).has('flightdebug')) {
    window.__flight = { stage, pose, intro, getPoses: () => poses, worldPoint, HOTSPOTS };
  }

  // ---------- Lecturas HUD ----------
  hud.bindReadout($('[data-turn]'), () => telemetry.turn, { pad: 3 });
  hud.bindReadout($('[data-turn-inspect]'), () => telemetry.turn, { pad: 3 });

  // ---------- Paralaje del puntero (solo escritorio y con movimiento) ----------
  if (!reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener(
      'pointermove',
      (event) => {
        if (dragging) return;
        pointer.targetX = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.targetY = (event.clientY / window.innerHeight) * 2 - 1;
      },
      { passive: true },
    );
  }

  // ---------- Rótulos que siguen al zapato ----------
  const reticle = $('.flight-reticle');
  const tapeStrip = $('.flight-tape__strip');
  const halo = $('.flight-halo');
  const marks = $$('.flight-mark');
  const leaders = $$('.flight-leader');
  const labels = $$('.flight-label');
  const lines = $('.flight-lines');
  const reticleBox = { width: 0, height: 0, tape: 0 };
  const anchors = labels.map(() => ({ x: 0, y: 0, side: 1 }));
  const leaderDraw = HOTSPOTS.map(() => ({ value: 0 }));
  const live = new Set(); // rótulos visibles: se reposicionan en cada cuadro
  let reticleOn = true;

  // Guía en codo: diagonal a 45° desde el punto y luego horizontal hasta la etiqueta.
  function drawLeader(index, x0, y0) {
    const { x: ax, y: ay, side } = anchors[index];
    let x1 = x0 + side * Math.abs(ay - y0);
    if (side * (ax - x1) < 28) x1 = ax - side * 28;
    const length = Math.hypot(x1 - x0, ay - y0) + Math.abs(ax - x1);
    const path = leaders[index];
    path.setAttribute('d', `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${ay.toFixed(1)}H${ax.toFixed(1)}`);
    path.style.strokeDasharray = `${length.toFixed(1)} ${(length + 1).toFixed(1)}`;
    path.style.strokeDashoffset = (length * (1 - leaderDraw[index].value)).toFixed(1);
  }

  stage.onFrame(() => {
    // El halo sigue al zapato y escala con su distancia a la cámara.
    const center = stage.toScreen(SHOE_CENTER);
    const { camera, sneaker } = stage;
    const distance = Math.hypot(camera.position.x - sneaker.position.x, camera.position.y - sneaker.position.y, camera.position.z - sneaker.position.z);
    halo.style.transform = `translate3d(${center.x.toFixed(1)}px, ${center.y.toFixed(1)}px, 0) scale(${(sneaker.scale.x / distance).toFixed(4)})`;
    if (reticleOn) {
      reticle.style.transform = `translate3d(${(center.x - reticleBox.width / 2).toFixed(1)}px, ${(center.y - reticleBox.height / 2).toFixed(1)}px, 0)`;
      const offset = reticleBox.tape / 2 - (telemetry.turn + 60) * TAPE_PX_PER_DEG;
      tapeStrip.style.transform = `translate3d(${offset}px, 0, 0)`;
    }
    if (dragging || document.activeElement === grip || gsap.isTweening(spin)) updateAria();
    for (const index of live) {
      const point = stage.toScreen(HOTSPOTS[index].point);
      marks[index].style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`;
      if (!layout.mobile) drawLeader(index, point.x, point.y);
    }
  });

  // Proyección con una cámara auxiliar, para medir poses sin tocar la escena.
  const scratchCamera = new stage.THREE.PerspectiveCamera(FOV, 1, 0.01, 20);
  const scratchVector = new stage.THREE.Vector3();
  function projector(name) {
    const view = poses[name];
    scratchCamera.aspect = layout.aspect;
    scratchCamera.updateProjectionMatrix();
    scratchCamera.position.set(view.cx, view.cy, view.cz);
    scratchCamera.lookAt(view.tx, view.ty, view.tz);
    scratchCamera.updateMatrixWorld();
    return ([x, y, z]) => {
      scratchVector.set(x, y, z).project(scratchCamera);
      return [((scratchVector.x + 1) / 2) * layout.width, ((1 - scratchVector.y) / 2) * layout.height];
    };
  }

  // Caja de la retícula de la portada (proyección de la pose, sin leer el DOM).
  function heroBox() {
    const project = projector('hero');
    const xs = [];
    const ys = [];
    for (const x of [-SHOE_LENGTH / 2, SHOE_LENGTH / 2]) {
      for (const y of [0, SHOE_HEIGHT]) {
        for (const z of [-SHOE.halfWidth, SHOE.halfWidth]) {
          const [sx, sy] = project(worldPoint([x, y, z], poses.hero));
          xs.push(sx);
          ys.push(sy);
        }
      }
    }
    // La caja nunca toca los bordes (en móvil el zapato es casi tan ancho como la ventana).
    const width = Math.min((Math.max(...xs) - Math.min(...xs)) * 1.12, layout.width - 40);
    const height = Math.min((Math.max(...ys) - Math.min(...ys)) * 1.3, layout.height * 0.56);
    const [centerX, centerY] = project(worldPoint(SHOE_CENTER, poses.hero));
    return { width, height, bottom: centerY + height / 2, left: centerX - width / 2 };
  }

  // Titular: las dos líneas comparten un tamaño que hace entrar la más larga
  // en la columna de texto (en escritorio, hasta el borde izquierdo de la
  // retícula menos un respiro; en móvil, el ancho de la pantalla). Se mide una
  // vez por refresco: el ancho del texto crece en proporción al tamaño.
  const title = $('.flight-hero__title');
  function fitHeadline() {
    title.style.removeProperty('--name-size');
    const style = getComputedStyle(title);
    const size = parseFloat(style.fontSize);
    const gap = parseFloat(getComputedStyle(root).getPropertyValue('--space-8')) * 16 || 32;
    const left = title.getBoundingClientRect().left;
    const right = layout.mobile ? layout.width - left : heroBox().left - gap;
    // Ancho real del texto de cada línea (la línea en sí ocupa toda la columna).
    const widest = Math.max(...[...title.querySelectorAll('.flight-name__line')].map((line) => line.lastElementChild.getBoundingClientRect().right - line.getBoundingClientRect().left));
    if (!widest || right - left <= 0) return;
    const max = (layout.mobile ? 5 : 7.5) * parseFloat(getComputedStyle(document.documentElement).fontSize);
    const fitted = Math.min(max, (size * (right - left)) / widest) * 0.98;
    title.style.setProperty('--name-size', `${fitted.toFixed(1)}px`);
  }

  // Móvil: el texto de la portada empieza debajo de la retícula. Se fija antes
  // de que ScrollTrigger mida, porque cambia el alto de la portada.
  function reserveHeroStage() {
    if (layout.mobile) root.style.setProperty('--flight-hero-stage', `${Math.round(heroBox().bottom + 18)}px`);
    else root.style.removeProperty('--flight-hero-stage');
  }

  // Medidas que dependen del tamaño (solo al refrescar, nunca por cuadro).
  function measure() {
    const { width, height } = heroBox();
    reticleBox.width = Math.round(width);
    reticleBox.height = Math.round(height);
    reticleBox.tape = Math.round(Math.min(width * 0.6, 300));
    reticle.style.width = `${reticleBox.width}px`;
    reticle.style.height = `${reticleBox.height}px`;
    reticle.style.setProperty('--tape-width', `${reticleBox.tape}px`);

    // Halo: tamaño base a un metro; cada cuadro escala por 1 / distancia.
    const pixelsPerMeter = layout.height / viewHeight(1);
    halo.style.setProperty('--halo-width', `${Math.round(0.8 * pixelsPerMeter)}px`);
    halo.style.setProperty('--halo-height', `${Math.round(0.52 * pixelsPerMeter)}px`);

    // Anclas de las guías: el borde de cada etiqueta, a la altura de su índice.
    labels.forEach((label, index) => {
      const side = label.dataset.side === 'right' ? 1 : -1;
      anchors[index] = {
        side,
        x: side > 0 ? label.offsetLeft - 12 : label.offsetLeft + label.offsetWidth + 12,
        y: label.offsetTop + 22,
      };
    });
    lines.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    measureTrail();

    // Área de arrastre: la caja del zapato en cada pose donde se puede girar.
    for (const name of ['hero', 'transit', ...HOTSPOTS.map((_, index) => `spot${index}`)]) gripRects[name] = shoeRect(name);
    placeGrip();
  }

  // Caja del zapato en pantalla para una pose (proyecta las 8 esquinas).
  const gripRects = {};
  function shoeRect(name) {
    const project = projector(name);
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const x of [-SHOE_LENGTH / 2, SHOE_LENGTH / 2]) {
      for (const y of [0, SHOE_HEIGHT]) {
        for (const z of [-SHOE.halfWidth, SHOE.halfWidth]) {
          const [sx, sy] = project(worldPoint([x, y, z], poses[name]));
          left = Math.min(left, sx);
          right = Math.max(right, sx);
          top = Math.min(top, sy);
          bottom = Math.max(bottom, sy);
        }
      }
    }
    const padX = (right - left) * 0.06;
    const padY = (bottom - top) * 0.08;
    left = Math.max(8, left - padX);
    top = Math.max(8, top - padY);
    right = Math.min(layout.width - 8, right + padX);
    bottom = Math.min(layout.height - 8, bottom + padY);
    return { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) };
  }

  // Estela del despegue: la trayectoria del talón proyectada con la cámara final.
  const trailPath = $('.flight-trail');
  const trailState = { s: 0 };
  const TRAIL_SAMPLES = 48;
  let trailLengths = [0];
  function measureTrail() {
    const project = projector('ready');
    const points = [];
    for (let i = 0; i <= TRAIL_SAMPLES; i++) {
      points.push(project(worldPoint(HEEL_POINT, takeoffPoseAt(poses.ready, poses.takeoff, i / TRAIL_SAMPLES))));
    }
    trailPath.setAttribute('d', points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(''));
    trailLengths = [0];
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      trailLengths.push(trailLengths[i - 1] + Math.hypot(bx - ax, by - ay));
    }
    const total = trailLengths[TRAIL_SAMPLES];
    trailPath.style.strokeDasharray = `${total.toFixed(1)} ${(total + 1).toFixed(1)}`;
    renderTrail();
  }
  function renderTrail() {
    const total = trailLengths[TRAIL_SAMPLES] || 1;
    const exact = trailState.s * TRAIL_SAMPLES;
    const index = Math.min(TRAIL_SAMPLES - 1, Math.floor(exact));
    const length = trailLengths.length > 1 ? trailLengths[index] + (trailLengths[index + 1] - trailLengths[index]) * (exact - index) : 0;
    trailPath.style.strokeDashoffset = (total - length).toFixed(1);
  }

  // ---------- Inspección guiada por selección ----------
  // Zonas (solo disparadores, sin scrub):
  //   inspección activa: el bloque ocupa al menos media ventana.
  //   alineada: el bloque llegó arriba; recién ahí aparecen marca, guía y
  //   etiqueta, para que nunca tapen el texto que todavía se está moviendo.
  //   Antes de alinear, en escritorio el zapato espera en la columna libre.
  const rows = $$('.flight-rail__item');
  const railFill = $('.flight-rail__fill');
  const railBlock = $('.flight-inspect__rail');
  const headBlock = $('.flight-inspect__head');
  const statusBlock = $('.flight-inspect__status');
  const specs = $('.flight-specs');
  const card = $('.flight-card');
  const launch = $('.flight-launch');
  const done = $('.flight-done');
  const takeoffLink = $('[data-flight-takeoff]');
  const counterText = $('[data-counter]');
  const stateText = $('[data-state]');
  const stateLive = $('[data-state-live]');
  const weightText = $('[data-spec-weight]');
  const stackText = $('[data-spec-stack]');
  const cardIndex = $('[data-card-index]');
  const cardTitle = $('[data-card-title]');
  const cardText = $('[data-card-text]');
  const specValues = { weight: product.specs.weightGrams, stack: product.specs.stackMm };
  const visited = new Set();

  let mode = 'hero'; // hero | inspect | away | takeoff
  let aligned = false; // el bloque de detalles está arriba: se muestran los rótulos
  let aboveAlign = true; // todavía no se llegó a la zona alineada (bajando)
  let active = -1;
  let tookOff = false;
  let specsCounted = false;
  let completeShown = false;
  let moveTimeline = null;
  let drift = null;
  let lastAnnounced = '';

  // Las especificaciones muestran el dato real desde el principio; al entrar
  // por primera vez cuentan desde cero, como un instrumento que se estabiliza.
  const renderSpecs = () => {
    weightText.textContent = pad(Math.round(specValues.weight), 3);
    stackText.textContent = pad(Math.round(specValues.stack), 2);
  };
  function countSpecs() {
    if (specsCounted || reduced) return;
    specsCounted = true;
    gsap.fromTo(
      specValues,
      { weight: 0, stack: 0 },
      { weight: product.specs.weightGrams, stack: product.specs.stackMm, duration: 1.2, ease: 'power2.out', onUpdate: renderSpecs },
    );
  }

  // El texto visible se "decodifica" (y es aria-hidden); la región viva
  // recibe el texto final una sola vez por cambio.
  function announce(text) {
    if (text === lastAnnounced) return;
    lastAnnounced = text;
    stateLive.textContent = text;
  }

  function stopMotion() {
    moveTimeline?.kill();
    drift?.kill();
    moveTimeline = drift = null;
    gsap.killTweensOf(pose);
  }

  // Lleva la pose a una con nombre (instantáneo con movimiento reducido).
  function moveTo(name, duration, ease = EASE.inOut) {
    stopMotion();
    poseName = name;
    if (reduced || duration === 0) {
      Object.assign(pose, poses[name]);
      requestRender();
      return null;
    }
    return gsap.to(pose, { ...poses[name], duration, ease });
  }

  function calloutIn(index) {
    const mark = marks[index];
    const label = labels[index];
    gsap.killTweensOf([mark, mark.children, label, leaders[index], leaderDraw[index]]);
    live.add(index);
    if (reduced) {
      leaderDraw[index].value = 1;
      gsap.set([mark, leaders[index], label], { opacity: 1, x: 0 });
      gsap.set(mark.children, { scale: 1 });
      requestRender();
      return null;
    }
    leaderDraw[index].value = 0;
    const side = label.dataset.side === 'right' ? 1 : -1;
    return gsap
      .timeline()
      .set([mark, leaders[index]], { opacity: 1 })
      .fromTo(mark.children, { scale: 0 }, { scale: 1, duration: 0.45, ease: 'back.out(2)', stagger: 0.06 }, 0)
      .to(leaderDraw[index], { value: 1, duration: 0.6, ease: 'power2.inOut' }, 0.15)
      .fromTo(label, { opacity: 0, x: 18 * side }, { opacity: 1, x: 0, duration: 0.6, ease: EASE.out }, 0.5);
  }
  function calloutsOut(except = -1) {
    for (const index of [...live]) {
      if (index === except) continue;
      const parts = [marks[index], labels[index], leaders[index]];
      gsap.killTweensOf([...parts, leaderDraw[index]]);
      if (reduced) {
        gsap.set(parts, { opacity: 0 });
        live.delete(index);
      } else {
        gsap.to(parts, { opacity: 0, duration: 0.3, ease: 'power1.out', onComplete: () => live.delete(index) });
      }
    }
  }

  // Filas: activa (aria-pressed), foco itinerante, contador y tarjeta de móvil.
  function syncRows() {
    rows.forEach((row, index) => {
      const isActive = index === active;
      row.classList.toggle('is-active', isActive);
      row.setAttribute('aria-pressed', String(isActive));
      row.tabIndex = index === Math.max(active, 0) ? 0 : -1;
      row.classList.toggle('is-done', visited.has(index));
    });
    counterText.textContent = pad(Math.max(active, 0) + 1, 2);
    if (!completeShown) {
      const progress = COPY.progress(visited.size, HOTSPOTS.length);
      stateText.textContent = progress;
      announce(progress);
    }
    const share = visited.size / HOTSPOTS.length;
    if (reduced) gsap.set(railFill, { scaleY: share });
    else gsap.to(railFill, { scaleY: share, duration: 0.5, ease: EASE.out, overwrite: true });
    if (active >= 0) {
      card.classList.add('is-visible');
      cardIndex.textContent = pad(active + 1, 2);
      cardTitle.textContent = HOTSPOTS[active].title;
      cardText.textContent = HOTSPOTS[active].text;
      if (!reduced) gsap.fromTo([cardTitle, cardText], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: DURATION.ui, stagger: 0.04, ease: EASE.out, overwrite: true });
    }
  }

  // Con los cuatro detalles vistos: el estado dice "Recorrido completo" (una
  // sola vez en pantalla) y "Ver catálogo" pasa a primario.
  function showComplete() {
    completeShown = true;
    root.classList.add('is-complete');
    hud.scramble(stateText, COPY.complete, { duration: 0.5 });
    announce(COPY.complete);
    takeoffLink.classList.replace('btn--ghost', 'btn--primary');
    done.hidden = false;
    if (!reduced) gsap.fromTo(done.children, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: DURATION.reveal, stagger: 0.08, ease: EASE.out, delay: 0.4 });
  }

  // Pose del punto según la zona: tránsito (columna libre) o primer plano.
  const poseFor = (index) => (aboveAlign && layout.free ? 'transit' : `spot${index}`);

  // Presenta el punto activo con la pose que corresponde a la zona.
  function present({ entrance = false } = {}) {
    if (mode !== 'inspect' || active < 0) return;
    const name = poseFor(active);
    const showCallout = aligned;
    calloutsOut(showCallout ? active : -1);
    stopMotion();
    poseName = name;
    placeGrip();
    const duration = entrance ? TIMING.entrance : TIMING.move;
    if (reduced) {
      Object.assign(pose, poses[name]);
      if (showCallout) calloutIn(active);
      requestRender();
      return;
    }
    moveTimeline = gsap.timeline().to(pose, { ...poses[name], duration, ease: EASE.inOut }, 0);
    if (showCallout && !live.has(active)) moveTimeline.add(calloutIn(active), Math.max(0, duration - 0.45));
    // En primer plano, un vaivén lento mantiene vivo el plano mientras se lee.
    if (name.startsWith('spot')) {
      moveTimeline.add(() => {
        drift = gsap.fromTo(pose, { ...poses[name] }, { ...poses[`${name}b`], duration: TIMING.drift, ease: 'sine.inOut', repeat: -1, yoyo: true });
        if (!stageVisible) drift.pause();
      });
    }
  }

  // Selecciona un punto: tilde de "visto", contador y cámara.
  function select(index, { entrance = false } = {}) {
    if (mode === 'takeoff') return;
    if (mode !== 'inspect') setInspectMode();
    if (index === active && !entrance && (moveTimeline || drift)) return;
    active = index;
    resetSpin(reduced ? 0 : TIMING.move);
    visited.add(index);
    syncRows();
    if (visited.size === HOTSPOTS.length && !completeShown) showComplete();
    present({ entrance });
  }

  function setInspectMode() {
    mode = 'inspect';
    reticleOn = false;
    if (reduced) gsap.set(reticle, { opacity: 0 });
    else gsap.to(reticle, { opacity: 0, duration: 0.4, overwrite: true });
    countSpecs();
  }

  // Móvil: la escena no se queda fija; va en el lugar de la portada o en el
  // de los detalles y se desplaza con ese bloque (así nunca queda debajo del
  // texto). El cambio de lugar se hace con un fundido corto.
  const sticky = $('.flight-sticky');
  let slot = 'hero';
  function updateSlot({ instant = false } = {}) {
    const next = layout.mobile && mode !== 'hero' ? 'inspect' : 'hero';
    if (next === slot) return;
    slot = next;
    gsap.killTweensOf(sticky);
    if (instant || reduced) {
      root.classList.toggle('is-slot-inspect', slot === 'inspect');
      gsap.set(sticky, { opacity: 1 });
      requestRender();
      return;
    }
    gsap
      .timeline()
      .to(sticky, { opacity: 0, duration: 0.18, ease: 'power1.in' })
      .add(() => root.classList.toggle('is-slot-inspect', slot === 'inspect'))
      .to(sticky, { opacity: 1, duration: 0.45, ease: 'power1.out' });
  }

  // El bloque ocupa parte de la ventana: el punto activo (o el 01) se presenta una vez.
  function enterInspect() {
    if (mode === 'inspect' || mode === 'takeoff') return;
    if (tookOff) {
      // Vuelve a aterrizar desde arriba después de ir al catálogo.
      tookOff = false;
      Object.assign(pose, poses.takeoff);
      trailState.s = 0;
      renderTrail();
      fadeInterface(false);
      gsap.to(halo, { opacity: 1, duration: reduced ? 0 : 0.8, overwrite: true });
    }
    setInspectMode();
    updateSlot();
    select(Math.max(active, 0), { entrance: true });
  }

  function enterHero() {
    if (mode === 'hero') return;
    mode = 'hero';
    updateSlot();
    calloutsOut();
    moveTo('hero', TIMING.mode);
    resetSpin(reduced ? 0 : TIMING.mode);
    placeGrip();
    reticleOn = true;
    if (reduced) gsap.set(reticle, { opacity: 1 });
    else gsap.to(reticle, { opacity: 1, duration: 0.6, delay: 0.7, overwrite: true });
    requestRender();
  }

  // El bloque quedó atrás: el vaivén se pausa.
  function leaveDown() {
    if (mode === 'takeoff') return;
    mode = 'away';
    drift?.pause();
  }

  // Zona alineada: los rótulos aparecen o se van (por tiempo) y la pose se ajusta.
  function setAligned(isAligned, isAbove) {
    if (isAligned === aligned && isAbove === aboveAlign) return;
    aligned = isAligned;
    aboveAlign = isAbove;
    if (mode !== 'inspect') {
      if (!aligned) calloutsOut();
      return;
    }
    if (!aligned) {
      calloutsOut();
      // Bajando más allá de la zona, el zapato se queda en su plano (ya se
      // mueve junto con el bloque); subiendo, vuelve a la columna libre.
      if (aboveAlign && layout.free) present();
      return;
    }
    present();
  }

  // La interfaz de detalles se aparta durante la salida al catálogo.
  function fadeInterface(hidden) {
    return gsap.to([headBlock, statusBlock, railBlock, specs, launch], { opacity: hidden ? 0 : 1, duration: reduced ? 0 : hidden ? 0.3 : 0.5, overwrite: true });
  }

  // "Ver catálogo": el zapato despega mientras la página ya baja al catálogo.
  function takeOff() {
    if (mode === 'takeoff') return;
    stopMotion();
    calloutsOut();
    mode = 'takeoff';
    tookOff = true;
    poseName = 'takeoff';
    resetSpin(0.3);
    placeGrip();
    const lift = 0.3;
    const timeline = gsap.timeline({
      onComplete: () => {
        mode = 'away';
        placeGrip();
        // Si el usuario se quedó en los detalles, el zapato vuelve a aterrizar.
        if (zoneTrigger.isActive) enterInspect();
      },
    });
    fadeInterface(true);
    timeline.to(pose, { ...poses.ready, duration: lift, ease: 'power2.out' }, 0);
    for (const [key, ease] of Object.entries(TAKEOFF_EASES)) {
      timeline.to(pose, { [key]: poses.takeoff[key], duration: TIMING.takeoff * (isRotation(key) ? TAKEOFF_ROTATION_SHARE : 1), ease }, lift);
    }
    timeline
      .fromTo(trailState, { s: 0 }, { s: 1, duration: TIMING.takeoff, ease: 'none', onUpdate: renderTrail }, lift)
      .to(halo, { opacity: 0, duration: 0.4, overwrite: true }, lift)
      .add(() => goTo(document.getElementById('catalogo'), { motion }), lift);
  }

  // Controles: cada fila selecciona su punto; las flechas mueven el foco entre filas.
  rows.forEach((row) =>
    row.addEventListener('click', () => {
      select(Number(row.dataset.step));
      // Si el bloque todavía no llegó arriba, se lo acerca para ver el rótulo.
      if (aboveAlign) scrollTo(inspect, { duration: 0.9 });
    }),
  );
  $('.flight-rail').addEventListener('keydown', (event) => {
    const current = rows.indexOf(document.activeElement);
    if (current < 0) return;
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    let next = null;
    if (event.key in keys) next = (current + keys[event.key] + rows.length) % rows.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = rows.length - 1;
    if (next === null) return;
    event.preventDefault();
    rows.forEach((row, index) => (row.tabIndex = index === next ? 0 : -1));
    rows[next].focus();
  });
  // Con movimiento reducido el enlace salta directo al catálogo.
  if (!reduced) {
    takeoffLink.addEventListener('click', (event) => {
      event.preventDefault();
      takeOff();
    });
  }


  // ---------- Giro con el mouse, el dedo o el teclado ----------
  // El área de arrastre cubre solo la caja del zapato: los CTA, el texto y la
  // lista siguen recibiendo clics. Horizontal gira (360°), vertical inclina
  // (±12°). Al soltar hay inercia suave y, tras 1,5 s sin tocar, vuelve a la pose.
  const grip = $('.flight-grip');
  const TAU = Math.PI * 2;
  const YAW_PER_PX = 0.009;
  const TILT_PER_PX = 0.004;
  const MAX_TILT = (12 * Math.PI) / 180;
  const KEY_STEP = (15 * Math.PI) / 180;
  let spinReturn = null;
  let dimmed = false;
  let lastPointer = null;
  let spinVelocity = 0;
  let keyTarget = 0;
  let keyTween = null;
  let lastAria = -1;

  function placeGrip() {
    const rect = mode === 'takeoff' ? null : gripRects[mode === 'hero' ? 'hero' : poseName];
    grip.classList.toggle('is-off', !rect);
    if (!rect) return;
    grip.style.width = `${rect.width}px`;
    grip.style.height = `${rect.height}px`;
    grip.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
  }

  // El valor del control es el mismo giro que muestra la lectura "Giro".
  function updateAria() {
    const turn = telemetry.turn;
    if (turn === lastAria) return;
    lastAria = turn;
    grip.setAttribute('aria-valuenow', String(turn));
    grip.setAttribute('aria-valuetext', COPY.gripValue(turn));
  }

  // Mientras se gira en la inspección, la marca, la guía y la etiqueta se apartan.
  function dimCallout(hide) {
    if (hide === dimmed) return;
    dimmed = hide;
    if (mode !== 'inspect' || active < 0 || !live.has(active)) return;
    if (!hide) {
      leaderDraw[active].value = 1;
      gsap.set(labels[active], { x: 0 });
      gsap.set(marks[active].children, { scale: 1 });
    }
    gsap.to([marks[active], leaders[active], labels[active]], { opacity: hide ? 0 : 1, duration: reduced ? 0 : hide ? 0.25 : 0.5, overwrite: true });
    requestRender();
  }

  // Vuelve a la pose actual por el camino más corto.
  function returnSpin(duration = reduced ? 0 : 1.2, { restore = true } = {}) {
    spinReturn?.kill();
    spinReturn = null;
    gsap.killTweensOf(spin);
    const finish = () => {
      spin.yaw = 0;
      spin.tilt = 0;
      if (restore) dimCallout(false);
      updateAria();
      requestRender();
    };
    if (duration === 0 || (spin.yaw === 0 && spin.tilt === 0)) {
      finish();
      return;
    }
    gsap.to(spin, { yaw: Math.round(spin.yaw / TAU) * TAU, tilt: 0, duration, ease: 'power3.inOut', onComplete: finish });
  }

  // Un cambio de pose (punto, portada, despegue) también deshace el giro manual.
  function resetSpin(duration) {
    dimmed = false;
    returnSpin(duration, { restore: false });
  }

  function scheduleReturn() {
    spinReturn?.kill();
    spinReturn = gsap.delayedCall(1.5, () => returnSpin());
  }

  grip.addEventListener('pointerdown', (event) => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || mode === 'takeoff') return;
    dragging = true;
    grip.classList.add('is-grabbing');
    grip.setPointerCapture?.(event.pointerId);
    spinReturn?.kill();
    gsap.killTweensOf(spin);
    lastPointer = { x: event.clientX, y: event.clientY, t: event.timeStamp };
    spinVelocity = 0;
    pointer.targetX = 0;
    pointer.targetY = 0;
    dimCallout(true);
  });
  grip.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    const dt = Math.max(event.timeStamp - lastPointer.t, 1) / 1000;
    spin.yaw += dx * YAW_PER_PX;
    spin.tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, spin.tilt + dy * TILT_PER_PX));
    spinVelocity = spinVelocity * 0.6 + ((dx * YAW_PER_PX) / dt) * 0.4;
    lastPointer = { x: event.clientX, y: event.clientY, t: event.timeStamp };
    updateAria();
    requestRender();
  });
  const release = (event) => {
    if (!dragging) return;
    dragging = false;
    grip.classList.remove('is-grabbing');
    // Inercia suave al soltar (solo si el gesto venía en movimiento).
    if (!reduced && event.timeStamp - lastPointer.t < 90 && Math.abs(spinVelocity) > 0.3) {
      const throwBy = Math.max(-2.4, Math.min(2.4, spinVelocity * 0.28));
      gsap.to(spin, { yaw: spin.yaw + throwBy, duration: 1, ease: 'power3.out', onUpdate: updateAria });
    }
    scheduleReturn();
  };
  grip.addEventListener('pointerup', release);
  grip.addEventListener('pointercancel', release);
  grip.addEventListener('lostpointercapture', release);

  // Teclado: flechas giran de a 15°, Inicio vuelve a la pose.
  grip.addEventListener('keydown', (event) => {
    if (event.key === 'Home') {
      event.preventDefault();
      returnSpin(reduced ? 0 : 0.6);
      return;
    }
    const step = { ArrowRight: KEY_STEP, ArrowUp: KEY_STEP, ArrowLeft: -KEY_STEP, ArrowDown: -KEY_STEP }[event.key];
    if (step === undefined || mode === 'takeoff') return;
    event.preventDefault();
    spinReturn?.kill();
    dimCallout(true);
    // Pulsaciones seguidas se acumulan aunque el giro anterior no haya terminado.
    keyTarget = (keyTween && keyTween.progress() < 1 ? keyTarget : spin.yaw) + step;
    if (reduced) {
      gsap.killTweensOf(spin);
      spin.yaw = keyTarget;
      requestRender();
    } else {
      keyTween = gsap.to(spin, { yaw: keyTarget, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
    }
    updateAria();
    scheduleReturn();
  });

  // ---------- ScrollTriggers: solo disparadores, sin pin ni scrub ----------
  // El 3D dibuja solo mientras la sección está en pantalla.
  const visibility = ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => setStageVisible(self.isActive),
  });
  // Los detalles se activan cuando ocupan un 40% de la ventana: el zapato
  // deja la portada antes de que el estado de la derecha llegue a cruzarlo.
  const zoneTrigger = ScrollTrigger.create({
    trigger: inspect,
    start: 'top 60%',
    end: 'bottom 50%',
    onEnter: enterInspect,
    onEnterBack: enterInspect,
    onLeave: leaveDown,
    onLeaveBack: enterHero,
  });
  // Zona alineada: el bloque está arriba y la escena se mueve con él.
  const alignTrigger = ScrollTrigger.create({
    trigger: inspect,
    start: 'top 12%',
    end: 'bottom 70%',
    onEnter: () => setAligned(true, false),
    onEnterBack: () => setAligned(true, false),
    onLeave: () => setAligned(false, false),
    onLeaveBack: () => setAligned(false, true),
  });
  // La pista "Baja para ver los detalles" se retira apenas empieza a bajar,
  // para no cruzarse con el zapato.
  const cue = $('.flight-instruments__cue');
  ScrollTrigger.create({
    trigger: root,
    start: () => `top+=${Math.round(window.innerHeight * 0.12)} top`,
    end: 'max',
    onToggle: (self) => gsap.to(cue, { opacity: self.isActive ? 0 : 1, duration: reduced ? 0 : 0.4, overwrite: true }),
  });

  function setStageVisible(visible) {
    if (visible === stageVisible) return;
    stageVisible = visible;
    if (reduced) {
      requestRender();
      return;
    }
    stage.setRendering(visible);
    if (visible && mode === 'inspect') drift?.resume();
    else drift?.pause();
  }

  // Estado correcto tras cargar en cualquier posición (main.js restaura el
  // scroll después de montar todo).
  function syncWithScroll() {
    setStageVisible(visibility.isActive);
    // Si cambió el tamaño (por ejemplo, de escritorio a móvil), la escena va
    // al lugar que corresponde sin fundido.
    if (!layout.mobile && slot !== 'hero') updateSlot({ instant: true });
    aligned = alignTrigger.isActive;
    aboveAlign = alignTrigger.progress === 0 && !alignTrigger.isActive;
    if (zoneTrigger.isActive) enterInspect();
    else if (zoneTrigger.progress === 1 && mode === 'hero') {
      // Ya se pasaron los detalles: quedan listos en el punto 01, sin animar.
      setInspectMode();
      select(0, { entrance: true });
      leaveDown();
    }
    updateSlot({ instant: true });
  }

  ScrollTrigger.addEventListener('refreshInit', () => {
    layout = readLayout(canvas, root);
    poses = computePoses(layout);
    root.classList.toggle('is-mobile', layout.mobile);
    reserveHeroStage();
    fitHeadline();
  });
  ScrollTrigger.addEventListener('refresh', () => {
    measure();
    // Con el nuevo tamaño, la pose actual se recalcula sin reiniciar nada.
    if (!gsap.isTweening(pose) && poses[poseName]) Object.assign(pose, { ...poses[poseName] });
    syncWithScroll();
    requestRender();
  });
  reserveHeroStage();
  fitHeadline();
  measure();

  // Los CTA de la portada son anclas: core/header.js resuelve el
  // desplazamiento y pasa el foco al destino.
  theme.onChange(() => requestRender());

  // ---------- Entrada: arranque o aterrizaje directo ----------
  const heroParts = {
    kicker: $('.flight-kicker'),
    lead: $('.flight-hero__lead'),
    actions: $$('.flight-hero__actions .btn'),
    instruments: $$('.flight-instrument, .flight-instruments__cue'),
    rule: $('.flight-instruments'),
    reticleInner: $('.flight-reticle__inner'),
    reticleTexts: $$('.flight-reticle__tag, .flight-reticle__lock'),
  };
  const nameLines = $$('.flight-name__line');
  const firstChars = [...nameLines[0].querySelectorAll('.flight-char:not(.flight-char--space)')];
  const secondChars = [...nameLines[1].querySelectorAll('.flight-char:not(.flight-char--space)')];
  const secondFills = secondChars.map((char) => char.firstElementChild);

  // Mientras la entrada no corre, las letras esperan ocultas desde el CSS
  // (clase is-intro: solo opacidad y giro). Sin movimiento no hay entrada.
  root.classList.toggle('is-intro', !reduced);

  // La entrada usa solo opacidad y transformaciones (nunca visibility): el
  // contenido sigue siendo legible y enfocable. Si algo recibe el foco antes
  // de que termine, la entrada se completa al instante.
  let heroReveal = null;
  function finishIntro() {
    root.classList.remove('is-intro');
    gsap.set([...firstChars, ...secondChars, ...secondFills], { clearProps: 'transform,opacity' });
    firstChars.forEach((char) => {
      char.firstElementChild.textContent = char.dataset.c;
    });
    startSweep();
  }
  root.querySelector('.flight-hero').addEventListener('focusin', () => {
    if (heroReveal) heroReveal.progress(1);
    else if (root.classList.contains('is-intro')) finishIntro();
  });

  // Letras tipo tablero del catálogo: cada una gira sobre su eje horizontal,
  // pasa por un par de caracteres al azar y se asienta. La segunda línea entra
  // como contorno en el acento y luego se rellena.
  const GLYPHS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  function nameTimeline() {
    const timeline = gsap.timeline();
    const flip = { rotationX: -100, opacity: 0, yPercent: 18, transformOrigin: '50% 50% -0.35em' };
    timeline.fromTo(firstChars, flip, { rotationX: 0, opacity: 1, yPercent: 0, duration: 0.5, stagger: 0.04, ease: EASE.out }, 0);
    // Cada letra pasa por un par de caracteres al azar y siempre termina en la
    // suya (el último 35% del giro ya muestra la letra real).
    firstChars.forEach((char, index) => {
      const fill = char.firstElementChild;
      const final = char.dataset.c;
      let last = '';
      timeline.to(
        {},
        {
          duration: 0.42,
          ease: 'none',
          onUpdate() {
            const next = this.progress() < 0.65 ? GLYPHS[(Math.floor(this.progress() * 40) + index * 7) % GLYPHS.length] : final;
            if (next !== last) fill.textContent = last = next;
          },
          onComplete: () => {
            fill.textContent = final;
          },
        },
        index * 0.04,
      );
    });
    const secondStart = 0.22 + firstChars.length * 0.02;
    timeline
      .set(secondFills, { opacity: 0 }, 0)
      .fromTo(secondChars, flip, { rotationX: 0, opacity: 1, yPercent: 0, duration: 0.5, stagger: 0.035, ease: EASE.out }, secondStart)
      .to(secondFills, { opacity: 1, duration: 0.4, stagger: 0.025, ease: 'power1.out' }, secondStart + 0.45);
    return timeline;
  }

  // Barrido de luz cada ~6 s mientras la portada se ve (pausa fuera de vista,
  // nunca con movimiento reducido). Es una animación CSS de background-position
  // sobre una copia recortada al texto; aquí solo se enciende o apaga.
  let heroOnScreen = true;
  let sweepReady = false;
  function startSweep() {
    sweepReady = !reduced;
    root.classList.toggle('is-sweeping', sweepReady && heroOnScreen);
  }
  ScrollTrigger.create({
    trigger: $('.flight-hero'),
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => {
      heroOnScreen = self.isActive;
      root.classList.toggle('is-sweeping', sweepReady && heroOnScreen);
    },
  });

  function revealHero() {
    gsap.set(heroParts.reticleInner, { opacity: 1 });
    // Solo se anima la portada si está a la vista: al recargar más abajo, queda en su estado final.
    if (window.scrollY > window.innerHeight * 0.5) {
      finishIntro();
      return;
    }
    heroReveal = gsap
      .timeline({
        onComplete: () => {
          heroReveal = null;
          finishIntro();
        },
      })
      .from(heroParts.kicker, { opacity: 0, y: 12, duration: DURATION.reveal }, 0)
      .add(nameTimeline(), 0.1)
      .add(hud.revealText(heroParts.lead, { type: 'lines', stagger: 0.08 }), 0.75)
      .from(heroParts.actions, { opacity: 0, y: 18, duration: DURATION.reveal, stagger: 0.08 }, 0.95)
      .fromTo(heroParts.rule, { '--rule-scale': 0 }, { '--rule-scale': 1, duration: DURATION.cinematic, ease: EASE.inOut }, 0.6)
      .from(heroParts.instruments, { opacity: 0, y: 10, duration: DURATION.reveal, stagger: 0.05 }, 1)
      .from(heroParts.reticleInner, { opacity: 0, scale: 1.16, duration: DURATION.cinematic, ease: EASE.out }, 0.95)
      .from(heroParts.reticleTexts, { opacity: 0, duration: 0.4, stagger: 0.1 }, 1.1);
  }

  // Sin arranque, la entrada espera a que main.js termine de montar y de
  // restaurar el scroll, para saber si la portada está a la vista.
  function revealWhenReady() {
    if (document.documentElement.classList.contains('is-ready')) revealHero();
    else requestAnimationFrame(revealWhenReady);
  }

  const landShoe = (delay = 0) => gsap.to(intro, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0, duration: 2.6, delay, ease: EASE.out });

  if (reduced) {
    finishIntro();
    stage.ready.then(requestRender, () => {});
  } else if (shouldPlayBoot(reduced)) {
    gsap.set(heroParts.reticleInner, { opacity: 0 });
    runBoot({
      motion,
      hud,
      stage,
      productName: product.name,
      onReveal: () => {
        landShoe(0.05);
        revealHero();
      },
    });
  } else {
    gsap.set(heroParts.reticleInner, { opacity: 0 });
    document.fonts.ready.then(revealWhenReady);
    stage.ready.then(() => (window.scrollY > window.innerHeight * 0.5 ? gsap.set(intro, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 }) : landShoe(0)), () => {});
  }

  stage.ready.then(
    () => ScrollTrigger.refresh(),
    (error) => console.error('[flight] no se pudo cargar el modelo', error),
  );
}
