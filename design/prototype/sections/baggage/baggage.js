// Sección "baggage" (Balones, colección mundialista): los balones pasan por
// una vitrina giratoria con forma de banda transportadora.
//
// Estructura:
//   .bag-head    fila de estado (colección, estado, conteo) y título
//   .bag-scene   grilla con detalles, vista 3D y selector; debajo la banda
//                a todo el ancho y UN solo canvas 3D sobre foco y banda
//
// Movimiento (sin pin ni scrub): la banda corre por tiempo mientras se ve y
// se detiene fuera de pantalla. Al entrar, el primer balón sube solo al foco;
// después se elige con un clic en la banda o con el selector (teclado).
// Cada cambio frena la banda, sube el balón y la vuelve a arrancar.
//
// Textos: vocabulario de tienda (ver COPY.md), sin metáforas de aeropuerto.

import { createBelt } from './belt.js';
import { AXIS_DEGREES, createFocus } from './focus.js';

// Giro de cada copia en la banda (rad): las copias de un balón muestran caras
// distintas. La primera copia del primer balón mira de frente (giro 0).
const angleFor = (round, index) => (round * 2.2 + index * 0.9) % (Math.PI * 2);
const NUMBER_WORDS = ['Cero', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez'];
// Copias de cada balón en la cinta: con pocos balones se repiten más para
// llenarla; con muchos, basta con dos vueltas.
const copiesFor = (count) => Math.max(2, Math.ceil(6 / count));

const ARROW =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const pad = (value) => String(value).padStart(2, '0');
// "Mundial Alemania 2006" -> "Alemania": la etiqueta muestra la edición.
export const countryOf = (ball) => ball.edition.replace(/^mundial\s+/i, '').replace(/\s*\d{4}$/, '');
const editionLabel = (ball) => `${countryOf(ball)} ${ball.tag.year}`;
const sizeValue = (size) => size.replace(/^talla\s*/i, '');
const shortName = (name) => name.replace(/^adidas\s+/i, '');

// Selector compacto: una fila por balón (índice, año, país, modelo y estado).
function claimMarkup(ball, index) {
  return `
    <button type="button" class="bag-claim" data-claim="${ball.slug}" aria-pressed="false"
      aria-label="${ball.name}, ${ball.edition}">
      <span class="bag-claim__index" aria-hidden="true">${pad(index + 1)}</span>
      <span class="bag-claim__year" aria-hidden="true">${ball.tag.year}</span>
      <span class="bag-claim__code" aria-hidden="true">${countryOf(ball)}</span>
      <span class="bag-claim__name" aria-hidden="true">${shortName(ball.name)}</span>
      <span class="bag-claim__dot" aria-hidden="true"></span>
    </button>`;
}

// "Cinco balones que marcaron un Mundial, de México 1970 a Norteamérica 2026."
function leadFor(balls) {
  const count = NUMBER_WORDS[balls.length] ?? String(balls.length);
  if (balls.length < 2) return 'El balón que marcó un Mundial, con la etiqueta de su edición.';
  const byYear = [...balls].sort((a, b) => a.tag.year - b.tag.year);
  const oldest = byYear[0];
  const newest = byYear[byYear.length - 1];
  return `${count} balones que marcaron un Mundial, de ${countryOf(oldest)} ${oldest.tag.year} a ${countryOf(newest)} ${newest.tag.year}.`;
}

// Texto que se anima (decodifica o cuenta): la versión visible queda
// aria-hidden y un gemelo oculto lleva el texto final para lectores de pantalla.
const twin = (attr, text) =>
  `<span aria-hidden="true" ${attr}>${text}</span><span class="visually-hidden" ${attr}-sr>${text}</span>`;

function template({ balls, first, formatPrice, reducedMotion }) {
  const years = balls.map((ball) => ball.tag.year);
  return `
    <div class="bag-bg hud-grid" aria-hidden="true"></div>

    <header class="container bag-head" data-head>
      <div class="bag-top">
        <p class="bag-top__id">
          <span class="hud-label hud-label--primary">${twin('data-kicker', 'Colección mundialista')}</span>
          <span class="hud-label bag-top__sub">Adidas · Talla 5</span>
        </p>
        <span class="bag-top__rule" data-rule aria-hidden="true"></span>
        <div class="bag-top__status">
          <p class="bag-status" data-reveal-head>
            <span class="status-dot" aria-hidden="true"></span>
            <span class="hud-label bag-status__text"><span class="bag-status__band">Vitrina · </span><span class="bag-status__state">${twin('data-status', reducedMotion ? 'En pausa' : 'En movimiento')}</span></span>
          </p>
          <p class="hud-label bag-count" data-reveal-head>
            <span class="bag-count__value">${pad(balls.length)}</span> balones · Mundiales ${Math.min(...years)} a ${Math.max(...years)}
          </p>
        </div>
      </div>
      <div class="bag-title">
        <h2 class="display bag-heading" data-heading>Balones</h2>
        <p class="bag-lead" data-reveal-head>
          ${leadFor(balls)}
        </p>
      </div>
    </header>

    <div class="bag-scene" data-scene>
      <div class="bag-beam" data-beam aria-hidden="true"><span class="bag-beam__lamp"></span></div>
      <div class="stage-halo bag-halo" data-halo aria-hidden="true"></div>

      <div class="bag-details" data-details>
        <div class="bag-details__top" data-reveal>
          <p class="hud-label" data-d-piece>Modelo 01 / ${pad(balls.length)}</p>
          <span class="bag-chip" data-d-chip>${editionLabel(first)}</span>
        </div>
        <h3 class="bag-details__name" data-reveal>${twin('data-d-name', first.name)}</h3>
        <p class="bag-details__edition" data-d-edition data-reveal>${first.edition}</p>
        <p class="bag-details__tagline" data-d-tagline data-reveal>${first.tagline}</p>
        <dl class="bag-specs" data-reveal>
          <div class="bag-spec">
            <dt class="hud-label">Final en</dt>
            <dd class="bag-spec__city" data-d-code>${first.tag.city}</dd>
          </div>
          <div class="bag-spec">
            <dt class="hud-label">Paneles</dt>
            <dd class="mono">${twin('data-d-panels', first.specs.panels)}</dd>
          </div>
          <div class="bag-spec">
            <dt class="hud-label">Talla</dt>
            <dd class="mono" data-d-size>${sizeValue(first.specs.size)}</dd>
          </div>
          <div class="bag-spec">
            <dt class="hud-label">Acabado</dt>
            <dd data-d-finish>${first.specs.finish}</dd>
          </div>
        </dl>
        <div class="bag-details__buy" data-reveal>
          <div class="bag-details__fare">
            <span class="hud-label">Precio</span>
            <span class="bag-details__price">${twin('data-d-price', formatPrice(first.price))}</span>
          </div>
          <button class="btn btn--primary bag-cta" type="button" data-cta>
            ${twin('data-cta-label', 'Agregar al carrito')}${ARROW}
          </button>
        </div>
        <p class="visually-hidden" aria-live="polite" data-announce></p>
      </div>

      <div class="bag-spot hud-frame" data-spot aria-hidden="true">
        <span class="bag-spot__marks"></span>
        <span class="hud-label bag-spot__label bag-spot__label--tl">Vista 3D<span class="bag-spot__extra"> · En foco</span></span>
        <span class="hud-label hud-label--primary bag-spot__label bag-spot__label--tr" data-spot-tag>${editionLabel(first)}</span>
        <span class="hud-label bag-spot__label bag-spot__label--bl" data-spot-state>Cargando 0%</span>
        <span class="hud-label bag-spot__label bag-spot__label--br">Ø 22 cm</span>
      </div>

      <aside class="bag-side" data-side aria-label="Elige tu balón">
        <dl class="bag-readouts" data-reveal-side>
          <div class="bag-readout bag-readout--rot">
            <dt class="hud-label">Giro</dt>
            <dd class="bag-readout__value" data-rot>000°</dd>
          </div>
          <div class="bag-readout">
            <dt class="hud-label">Velocidad</dt>
            <dd class="bag-readout__value bag-readout__value--sm" data-vel>0,00 m/s</dd>
          </div>
          <div class="bag-readout">
            <dt class="hud-label">Eje</dt>
            <dd class="bag-readout__value bag-readout__value--sm">${AXIS_DEGREES}°</dd>
          </div>
        </dl>
        <div class="bag-claims" data-reveal-side>
          <p class="hud-label bag-claims__label" id="bag-claims-label">Elige tu balón</p>
          <div class="bag-claims__list" role="group" aria-labelledby="bag-claims-label" data-claims>
            ${balls.map(claimMarkup).join('')}
          </div>
          <p class="hud-label bag-claims__hint">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v9.5M4 8.5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            O elige uno en la vitrina
          </p>
        </div>
      </aside>

      <div class="bag-belt" data-belt aria-hidden="true"></div>
      <canvas class="bag-canvas" data-canvas aria-hidden="true"></canvas>
    </div>`;
}

export async function mount(root, context) {
  const { motion, hud, catalog, theme, createStage, BALL_SLUGS, lite, reducedMotion } = context;
  const { gsap, ScrollTrigger, EASE, DURATION } = motion;
  const { findBall, formatPrice } = catalog;

  // ---------- Datos ----------

  const balls = BALL_SLUGS.map(findBall).filter(Boolean);
  const first = balls[0];
  const items = [];
  for (let round = 0, copies = copiesFor(balls.length); round < copies; round++) {
    balls.forEach((ball, index) => items.push({ slug: ball.slug, ball, round, angle: angleFor(round, index) }));
  }

  // ---------- DOM ----------

  root.classList.add('bag');
  root.classList.toggle('is-reduced', reducedMotion);
  // Las entradas parten ocultas desde el CSS (.is-intro: solo opacity y
  // transform), nunca con visibility ni display: todo sigue enfocable y legible.
  root.classList.toggle('is-intro', !reducedMotion);
  root.innerHTML = template({ balls, first, formatPrice, reducedMotion });

  const $ = (selector) => root.querySelector(selector);
  const scene = $('[data-scene]');
  const canvas = $('[data-canvas]');
  const spot = $('[data-spot]');
  const halo = $('[data-halo]');
  const beam = $('[data-beam]');
  const statusEl = $('[data-status]');
  const statusSr = $('[data-status-sr]');
  const spotTag = $('[data-spot-tag]');
  const spotState = $('[data-spot-state]');
  const claims = [...root.querySelectorAll('[data-claim]')];
  const details = {
    piece: $('[data-d-piece]'),
    chip: $('[data-d-chip]'),
    name: $('[data-d-name]'),
    nameSr: $('[data-d-name-sr]'),
    edition: $('[data-d-edition]'),
    tagline: $('[data-d-tagline]'),
    code: $('[data-d-code]'),
    panels: $('[data-d-panels]'),
    panelsSr: $('[data-d-panels-sr]'),
    size: $('[data-d-size]'),
    finish: $('[data-d-finish]'),
    price: $('[data-d-price]'),
    priceSr: $('[data-d-price-sr]'),
  };
  const cta = $('[data-cta]');
  const ctaLabel = $('[data-cta-label]');
  const ctaSr = $('[data-cta-label-sr]');
  const announcer = $('[data-announce]');
  hud.frameCorners(spot);

  const belt = createBelt({ element: $('[data-belt]'), items, gsap, tokens: { EASE, DURATION }, reducedMotion });

  // ---------- Estado de selección ----------

  let stage = null;
  let focus = null;
  let modelsReady = false;
  let live = false;
  let armed = reducedMotion; // el primer cambio espera a que la escena se vea
  let current = null; // balón en el foco
  let requested = first.slug;
  let requestedPiece = null;
  let busy = false;
  let started = false; // la banda ya arrancó alguna vez

  const ballIndex = (slug) => balls.findIndex((ball) => ball.slug === slug);

  const claimList = $('[data-claims]');
  function setClaimsPressed(slug) {
    let activeClaim = null;
    for (const claim of claims) {
      const active = claim.dataset.claim === slug;
      claim.setAttribute('aria-pressed', String(active));
      if (active) activeClaim = claim;
    }
    // En móvil la lista es una tira horizontal: el activo queda a la vista
    // (solo se mueve la tira, nunca el scroll de la página).
    if (activeClaim && claimList.scrollWidth > claimList.clientWidth + 1) {
      const left = activeClaim.offsetLeft - claimList.offsetLeft - parseFloat(getComputedStyle(claimList).paddingLeft);
      claimList.scrollTo({ left: Math.max(0, left), behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }

  function setStatus(text) {
    if (statusSr.textContent === text) return;
    statusSr.textContent = text;
    gsap.killTweensOf(statusEl);
    if (reducedMotion) statusEl.textContent = text;
    else hud.scramble(statusEl, text, { duration: 0.6, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
  }

  // ---------- Detalles ----------

  const priceState = { value: first.price };
  let priceTween = null;

  function renderDetails(ball, animate) {
    const index = ballIndex(ball.slug);
    details.piece.textContent = `Modelo ${pad(index + 1)} / ${pad(balls.length)}`;
    details.chip.textContent = editionLabel(ball);
    details.edition.textContent = ball.edition;
    details.tagline.textContent = ball.tagline;
    details.code.textContent = ball.tag.city;
    details.size.textContent = sizeValue(ball.specs.size);
    details.finish.textContent = ball.specs.finish;

    details.nameSr.textContent = ball.name;
    details.panelsSr.textContent = String(ball.specs.panels);
    details.priceSr.textContent = formatPrice(ball.price);
    gsap.killTweensOf([details.name, spotTag, details.panels]);
    priceTween?.kill();
    if (!animate || reducedMotion) {
      details.name.textContent = ball.name;
      spotTag.textContent = editionLabel(ball);
      details.panels.textContent = String(ball.specs.panels);
      details.price.textContent = formatPrice(ball.price);
      priceState.value = ball.price;
      return;
    }
    hud.scramble(details.name, ball.name, { duration: 0.7 });
    hud.scramble(spotTag, editionLabel(ball), { duration: 0.7 });
    hud.countTo(details.panels, ball.specs.panels, { duration: 1.1 });
    gsap.fromTo(
      [details.edition, details.tagline, details.code, details.size, details.finish],
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: DURATION.reveal, ease: EASE.out, stagger: 0.05, overwrite: true },
    );
    priceTween = gsap.to(priceState, {
      value: ball.price,
      duration: 0.9,
      ease: 'power3.out',
      onUpdate: () => (details.price.textContent = formatPrice(Math.round(priceState.value))),
    });
  }

  // ---------- Reclamos ----------

  // Pide un balón; los pedidos rápidos se encadenan y siempre termina en el último.
  function request(slug, { piece = null } = {}) {
    requested = slug;
    requestedPiece = piece;
    armed = true;
    setClaimsPressed(slug);
    sync();
  }

  async function sync() {
    if (busy || !focus || !modelsReady || !armed) return;
    busy = true;
    try {
      await runQueue();
    } catch (error) {
      console.error('[baggage]', error);
      requested = current;
      setClaimsPressed(current);
    } finally {
      busy = false;
    }
  }

  async function runQueue() {
    // La banda toma su posición inicial antes de elegir la pieza: si no, la
    // pieza elegida podría moverse fuera de la vista al arrancar.
    if (!started) startBelt();
    while (requested !== current) {
      const slug = requested;
      const ball = findBall(slug);
      const candidate = requestedPiece;
      requestedPiece = null;
      const pieceIndex =
        candidate !== null && belt.pieces[candidate].slug === slug && !belt.pieces[candidate].hidden
          ? candidate
          : belt.nearest(slug);
      const firstClaim = current === null;
      renderDetails(ball, !firstClaim);
      setClaimsPressed(slug);
      announcer.textContent = `${ball.name} en vista 3D. ${ball.edition}.`;

      if (!live || reducedMotion) {
        if (stage.model(slug)) {
          focus.setInstant(pieceIndex, slug);
          current = slug;
          showBeam(false);
          updateRendering();
          continue;
        }
        await stage.ensureModel(slug);
        continue;
      }

      // La banda frena, el balón sube (o se cambia) y la banda vuelve a arrancar.
      setStatus('Mostrando');
      belt.setDrive(0, { duration: 0.8, ease: 'power2.out' });
      if (firstClaim) {
        showBeam(true);
        const lifting = focus.lift(pieceIndex, slug);
        updateRendering();
        await lifting;
      } else {
        await stage.ensureModel(slug);
        await focus.swap(pieceIndex, slug);
      }
      current = slug;
      belt.setDrive(1, { duration: 1.8, ease: 'power2.inOut' });
      setStatus('En movimiento');
    }
  }

  // Haz del foco y charco de luz: se encienden con el primer balón en foco.
  function showBeam(animate) {
    root.classList.add('is-focused');
    if (animate) gsap.to(beam, { opacity: 1, duration: DURATION.cinematic, ease: EASE.out });
    else gsap.set(beam, { opacity: 1 });
  }

  // Un clic en la banda reclama esa pieza; los comprobantes, la más cercana al foco.
  for (const piece of belt.pieces) {
    piece.hit.addEventListener('click', () => {
      if (piece.hidden) return belt.nudge(piece.index, 90);
      request(piece.slug, { piece: piece.index });
    });
    piece.hit.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      belt.nudge(piece.index, 45);
      stage?.ensureModel(piece.slug);
    });
  }

  for (const claim of claims) {
    claim.addEventListener('click', () => request(claim.dataset.claim));
  }

  // Flechas izquierda/derecha (y arriba/abajo) recorren los comprobantes.
  claimList.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    const index = claims.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = claims[(index + step + claims.length) % claims.length];
    next.focus();
    request(next.dataset.claim);
  });

  // Carrito de demostración: no hay carrito real en el prototipo.
  let ctaTimer = null;
  cta.addEventListener('click', () => {
    if (cta.classList.contains('is-done')) return;
    const ball = findBall(requested);
    context.cart?.add({ slug: ball.slug, kind: 'ball' });
    cta.classList.add('is-done');
    ctaSr.textContent = 'Agregado al carrito';
    gsap.killTweensOf(ctaLabel);
    if (reducedMotion) ctaLabel.textContent = 'Agregado al carrito';
    else hud.scramble(ctaLabel, 'Agregado al carrito', { duration: 0.6 });
    announcer.textContent = `${ball.name} agregado al carrito.`;
    clearTimeout(ctaTimer);
    ctaTimer = setTimeout(() => {
      cta.classList.remove('is-done');
      ctaSr.textContent = 'Agregar al carrito';
      if (reducedMotion) ctaLabel.textContent = 'Agregar al carrito';
      else hud.scramble(ctaLabel, 'Agregar al carrito', { duration: 0.5 });
    }, 2600);
  });

  // ---------- Escenario 3D (uno solo, creado al acercarse) ----------

  function tick(time, deltaMs) {
    belt.frame(time, deltaMs);
    focus?.frame(time, deltaMs);
  }

  // Con movimiento reducido no hay ciclo: se dibuja un cuadro fijo cuando cambia algo.
  function renderStatic() {
    if (!stage || !focus?.layout || !focus.state.visible) return;
    belt.place();
    focus.frame(gsap.ticker.time, 16);
    stage.renderOnce();
  }

  let rendering = false;
  function updateRendering() {
    if (reducedMotion) return renderStatic();
    const should = Boolean(stage && live && focus?.state.visible);
    if (should === rendering) return;
    rendering = should;
    stage.setRendering(should);
  }

  let unbindReadouts = [];
  function setLive(on) {
    if (on === live) return;
    live = on;
    if (on && !stage) initStage();
    if (on) {
      if (!started) startBelt();
      if (!reducedMotion) gsap.ticker.add(tick);
      unbindReadouts = [
        hud.bindReadout($('[data-rot]'), () => focus?.rotation() ?? 0, { pad: 3, suffix: '°' }),
        hud.bindReadout($('[data-vel]'), () => belt.state.metersPerSecond, { decimals: 2, suffix: ' m/s' }),
      ];
    } else {
      gsap.ticker.remove(tick);
      unbindReadouts.forEach((unbind) => unbind());
      unbindReadouts = [];
    }
    updateRendering();
  }

  // La banda arranca con la primera Teamgeist a punto de llegar al foco.
  function startBelt() {
    started = true;
    const claimX = belt.geometry.claimX;
    belt.setOffset(belt.offsetFor(0, claimX - belt.geometry.spacing * (reducedMotion ? 0 : 0.42)));
  }

  function measureAll() {
    if (!focus) return;
    const layout = focus.measure();
    if (!layout) return;
    belt.setClaim(layout.spot.x - layout.belt.x);
    const beltTop = layout.belt.y;
    beam.style.setProperty('--bag-beam-x', `${layout.spot.x.toFixed(1)}px`);
    beam.style.setProperty('--bag-beam-top', `${(layout.spot.top + 2).toFixed(1)}px`);
    beam.style.setProperty('--bag-beam-h', `${(beltTop + belt.geometry.lipY - layout.spot.top).toFixed(1)}px`);
    beam.style.setProperty('--bag-beam-w', `${(belt.geometry.D * 3.4).toFixed(1)}px`);
    queueSnapshots(BALL_SLUGS);
    if (reducedMotion) renderStatic();
  }

  // Fotos de la banda: se dibujan de a un modelo por cuadro (dos o más piezas
  // cada vez), a medida que cada modelo termina de cargar. Así el primer
  // cuadro de la sección nunca carga con todo el lote.
  const snapshotQueue = new Set();
  let snapshotFrame = 0;
  function queueSnapshots(slugs) {
    if (!focus) return;
    for (const slug of slugs) if (stage.model(slug)) snapshotQueue.add(slug);
    if (!snapshotFrame && snapshotQueue.size) snapshotFrame = requestAnimationFrame(flushSnapshot);
  }
  function flushSnapshot() {
    snapshotFrame = 0;
    const slug = snapshotQueue.values().next().value;
    if (!slug) return;
    snapshotQueue.delete(slug);
    for (const piece of focus.snapshots([slug])) {
      if (piece.loaded) continue;
      piece.loaded = true;
      gsap.to(piece.wait, { autoAlpha: 0, duration: 0.4 });
      if (!reducedMotion && !piece.hidden) gsap.fromTo(piece.ball, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power2.out' });
    }
    if (reducedMotion) renderStatic();
    if (snapshotQueue.size) snapshotFrame = requestAnimationFrame(flushSnapshot);
  }

  function initStage() {
    stage = createStage(canvas, { models: BALL_SLUGS, preload: [first.slug], lite, fov: 22, cameraZ: 2 });
    stage.setRendering(false);
    focus = createFocus({ stage, gsap, belt, elements: { canvas, spot, halo }, reducedMotion });
    measureAll();
    stage.onProgress((value) => {
      if (!modelsReady) spotState.textContent = `Cargando ${Math.round(value * 100)}%`;
    });
    // Las luces del tema vienen del escenario; sobre un balón blanco el
    // contraluz lima se lee como una mancha, así que aquí queda como un filo.
    // Este listener corre después del preset del escenario: ajusta las luces
    // y rehace las fotos de la banda con el tema nuevo.
    const tuneLights = () => {
      stage.lights.rim.intensity *= 0.4;
      stage.lights.fill.intensity *= 1.25;
    };
    tuneLights();
    theme.onChange(() => {
      tuneLights();
      queueSnapshots(BALL_SLUGS);
      if (reducedMotion) renderStatic();
    });
    stage.ready
      .then(async () => {
        modelsReady = true;
        spotState.textContent = `Eje ${AXIS_DEGREES}° · ${reducedMotion ? 'Vista fija' : 'Giro lento'}`;
        queueSnapshots([first.slug]);
        sync();
        // El resto de los modelos, uno detrás de otro (no compiten con el primero).
        for (const slug of BALL_SLUGS.filter((slug) => slug !== first.slug)) {
          await stage.ensureModel(slug);
          queueSnapshots([slug]);
        }
      })
      .catch((error) => {
        console.error('[baggage]', error);
        spotState.textContent = 'Sin señal 3D';
        spotState.classList.add('hud-label--alert');
      });
  }

  // ---------- Estado inicial ----------

  setClaimsPressed(first.slug);
  if (reducedMotion) gsap.set(beam, { opacity: 1 });

  // ---------- Medición y scroll ----------

  // Escrituras de layout antes de que ScrollTrigger mida: tamaños de la banda
  // y alto del canvas (del borde superior de la escena al pie de la banda).
  const beltEl = belt.element;
  function writeLayout() {
    belt.layout();
    const sceneTop = scene.getBoundingClientRect().top;
    const beltBottom = beltEl.getBoundingClientRect().bottom;
    scene.style.setProperty('--bag-canvas-h', `${Math.round(beltBottom - sceneTop)}px`);
  }
  writeLayout();
  ScrollTrigger.addEventListener('refreshInit', writeLayout);
  ScrollTrigger.addEventListener('refresh', measureAll);

  // El modelo se pide con tiempo, antes de que la sección llegue a la pantalla.
  ScrollTrigger.create({
    trigger: root,
    start: 'top 250%',
    end: 'max',
    once: true,
    onEnter: () => !stage && initStage(),
  });

  // Banda y 3D solo corren con la escena a la vista.
  ScrollTrigger.create({
    trigger: scene,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => setLive(self.isActive),
  });

  // Primer reclamo automático, cuando la escena ya se ve bien.
  ScrollTrigger.create({
    trigger: scene,
    start: 'top 55%',
    end: 'max',
    once: true,
    onEnter: () => {
      armed = true;
      sync();
    },
  });

  // ---------- Entradas (una sola vez) ----------
  //
  // Parten del estado oculto del CSS (.is-intro) y animan hacia opacity 1 y
  // transform neutro. Se disparan una vez (end: 'max', así una recarga más
  // abajo también las completa) y si el teclado entra antes a un grupo, la
  // entrada termina al instante.

  if (reducedMotion) return;

  const head = $('[data-head]');
  const headIntro = gsap.timeline({ paused: true, defaults: { ease: EASE.out, duration: DURATION.reveal } });
  headIntro
    .to($('[data-rule]'), { scaleX: 1, duration: DURATION.cinematic, ease: EASE.inOut }, 0)
    .to(root.querySelectorAll('[data-reveal-head]'), { opacity: 1, y: 0, stagger: 0.08 }, 0.25);
  headIntro.add(hud.scramble($('[data-kicker]'), 'Colección mundialista', { duration: 1.1 }), 0);
  headIntro.add(hud.revealText($('[data-heading]'), { type: 'chars', stagger: 0.045 }), 0);

  const intro = gsap.timeline({ paused: true, defaults: { ease: EASE.out, duration: DURATION.reveal } });
  intro
    .to(spot, { opacity: 1, scale: 1, duration: DURATION.cinematic }, 0)
    .to(root.querySelectorAll('[data-reveal]'), { opacity: 1, y: 0, stagger: 0.06 }, 0.15)
    .to(root.querySelectorAll('[data-reveal-side]'), { opacity: 1, y: 0, stagger: 0.1 }, 0.3)
    .to(belt.pieces.map((piece) => piece.body), { opacity: 1, y: 0, stagger: 0.07, duration: 1.1 }, 0.1)
    .fromTo(
      belt.pieces.map((piece) => piece.card),
      { rotationX: -100, opacity: 0 },
      { rotationX: 0, opacity: 1, stagger: 0.07, duration: 1, ease: 'back.out(1.6)', immediateRender: false },
      0.45,
    )
    .to(belt.pieces.map((piece) => piece.string), { opacity: 1, stagger: 0.07, duration: 0.6 }, 0.5);
  belt.pieces.forEach((piece, index) => {
    intro.add(hud.scramble(piece.code, countryOf(piece.data), { duration: 0.8, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }), 0.55 + index * 0.07);
    intro.add(hud.scramble(piece.year, String(piece.data.tag.year), { duration: 0.8, chars: '0123456789' }), 0.6 + index * 0.07);
  });

  ScrollTrigger.create({ trigger: head, start: 'top 85%', end: 'max', once: true, onEnter: () => headIntro.play() });
  ScrollTrigger.create({ trigger: scene, start: 'top 75%', end: 'max', once: true, onEnter: () => intro.play() });

  // Teclado o lector de pantalla antes de la entrada: se completa al instante.
  const finish = (timeline) => {
    if (timeline.progress() < 1) timeline.progress(1);
  };
  head.addEventListener('focusin', () => finish(headIntro));
  scene.addEventListener('focusin', () => finish(intro));
}
