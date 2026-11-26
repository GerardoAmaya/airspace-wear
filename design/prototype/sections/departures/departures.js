// Sección "departures" (catálogo): tablero split-flap + Hangar 360°.
//
// Estructura:
//   .dep-board   tablero (filas = botones) + vista 3D (.dep-slot) + detalles
//   #hangar      plataforma giratoria (.hangar-stage): gira sola y con arrastre
//
// Hay UN solo canvas 3D. Vive dentro de la vista previa o de la plataforma
// (rig.js lo mueve en el DOM) y pasa de una a otra con una transición por
// tiempo cuando el tablero sale de la vista. Nada está fijado ni ligado al
// scroll: la página se desplaza de forma nativa.

import { collectTiles, createFlapEngine, fitText, tilesMarkup } from './flap.js';
import { createRig } from './rig.js';

// Ajusta un título de una sola línea a su ancho: primero angosta la letra con
// el eje de ancho de Hubot Sans y, si no alcanza, reduce el tamaño. Mide una
// copia invisible; se llama al cambiar de producto, nunca en cada cuadro.
function fitSingleLine(element, text) {
  element.style.fontStretch = '';
  element.style.fontSize = '';
  const available = element.clientWidth;
  if (!available) return;
  const probe = element.cloneNode(false);
  probe.removeAttribute('aria-live');
  probe.textContent = text;
  Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', width: 'auto', whiteSpace: 'nowrap' });
  element.parentElement.append(probe);
  let stretch = parseFloat(getComputedStyle(element).fontStretch) || 100;
  while (probe.scrollWidth > available && stretch > 75) {
    stretch = Math.max(75, stretch - 5);
    probe.style.fontStretch = `${stretch}%`;
  }
  if (stretch !== (parseFloat(getComputedStyle(element).fontStretch) || 100)) element.style.fontStretch = `${stretch}%`;
  if (probe.scrollWidth > available) {
    const size = parseFloat(getComputedStyle(element).fontSize);
    element.style.fontSize = `${Math.floor(size * (available / probe.scrollWidth) * 100) / 100}px`;
  }
  probe.remove();
}


// Número en palabras para el texto de apoyo ("Ocho pares listos...").
const NUMBER_WORDS = ['Cero', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez'];
const countWord = (count) => NUMBER_WORDS[count] ?? String(count);


// Columnas del tablero. El ancho de cada una (en paletas) sale del texto más
// largo del catálogo.
const COLUMNS = [
  { key: 'ref', label: 'Ref.', min: 0 },
  { key: 'name', label: 'Modelo', min: 0 },
  { key: 'brand', label: 'Marca', min: 0 },
  { key: 'sizes', label: 'Tallas EU', min: 6 },
  { key: 'price', label: 'Precio', min: 0 },
  { key: 'stock', label: 'Disponibilidad', min: 0 },
];

const FILTERS = ['Todas', 'Nike', 'Adidas', 'New Balance'];

const FEATURES = [
  {
    title: 'Avatar animado',
    text: 'Un avatar que camina, gira y posa con animaciones reales.',
    icon: '<circle cx="12" cy="5.5" r="2.5"/><path d="M12 8.5v6.5M12 15l-3.4 5.5M12 15l3.4 5.5M6.5 11.5 12 10l5.5 1.5"/>',
  },
  {
    title: 'Solo cambian los zapatos',
    text: 'El avatar se queda igual; tú eliges el par que lleva.',
    icon: '<path d="M4 8.5h14.5l-3.5-3.5M20 15.5H5.5L9 19"/>',
  },
  {
    title: 'Vista 360°',
    text: 'Míralo desde cualquier ángulo, como en la tienda.',
    icon: '<ellipse cx="12" cy="13" rx="9" ry="4.2"/><path d="M12 3.5v9.5M15.2 16.9l-2.6.3 1.7 2"/>',
  },
];

const ARROW = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Anillos de la plataforma, en milímetros del mundo (viewBox de 600 x 600 mm).
function ringsMarkup() {
  const ticks = [];
  for (let degree = 0; degree < 360; degree += 5) {
    const major = degree % 30 === 0;
    const inner = major ? 214 : 222;
    const outer = major ? 240 : 232;
    const angle = ((degree + 90) * Math.PI) / 180; // 000 queda al frente (hacia la cámara)
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ticks.push(
      `<line class="hangar-tick${major ? ' hangar-tick--major' : ''}" x1="${(inner * cos).toFixed(1)}" y1="${(inner * sin).toFixed(1)}" x2="${(outer * cos).toFixed(1)}" y2="${(outer * sin).toFixed(1)}"/>`,
    );
    if (major) {
      const radius = 272;
      ticks.push(
        `<text x="${(radius * cos).toFixed(1)}" y="${(radius * sin).toFixed(1)}" dy="0.35em">${String(degree).padStart(3, '0')}</text>`,
      );
    }
  }
  return `
    <svg viewBox="-300 -300 600 600" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="hangar-disc-gradient">
          <stop offset="0" class="hangar-disc-stop hangar-disc-stop--center"/>
          <stop offset="1" class="hangar-disc-stop"/>
        </radialGradient>
      </defs>
      <circle class="hangar-disc" r="206"/>
      <circle class="hangar-ring hangar-ring--outer" r="288"/>
      <circle class="hangar-ring" r="250" data-draw/>
      <circle class="hangar-ring hangar-ring--edge" r="206" data-draw/>
      <circle class="hangar-ring hangar-ring--inner" r="150" data-draw/>
      <circle class="hangar-arc" r="250" pathLength="1" transform="rotate(90) scale(1 -1)" data-arc/>
      <g data-ticks>${ticks.join('')}</g>
      <path class="hangar-index" d="M0 241 L-8 255 L8 255 Z"/>
      <path class="hangar-cross" d="M-24 0H24M0 -24V24"/>
    </svg>`;
}

function rowMarkup(row, counts) {
  const { product, text, tone } = row;
  const label = `Ref. ${product.flight}, ${product.name} de ${product.brand}, tallas ${product.sizes}, ${text.price}, ${text.stock}`;
  const cells = COLUMNS.map(
    (column) =>
      `<span class="dep-cell dep-cell--${column.key}" data-cell="${column.key}"${column.key === 'stock' ? ` data-tone="${tone}"` : ''}>${tilesMarkup(counts[column.key])}</span>`,
  ).join('');
  return `
    <li class="dep-item" data-slug="${product.slug}">
      <button type="button" class="dep-row" aria-pressed="false" aria-label="${label}">
        <span class="dep-row__hl" aria-hidden="true"></span>
        <span class="dep-row__cells" aria-hidden="true">${cells}</span>
      </button>
    </li>`;
}

function template({ rows, counts, first, formatPrice, AVAILABILITY, brands, sizeRange, countLabel }) {
  const status = AVAILABILITY[first.status];
  const columnVars = COLUMNS.map((column) => `--n-${column.key}: ${counts[column.key]}`).join('; ');
  // Orden del DOM = orden de tabulación: encabezado, filtros, filas, detalles y
  // "Agregar al carrito". En escritorio la grilla ubica cada bloque por área;
  // en móvil la vista 3D se muestra arriba con "order", sin tocar el DOM.
  return `
    <div class="dep-intro container" aria-hidden="true">
      <span class="hud-label">AIRSPACE Wear · Tienda</span>
      <span class="dep-intro__rule dep-enter-rule" data-intro-rule></span>
      <span class="hud-label">${brands.join(' · ')}</span>
    </div>

    <div class="dep-deck" data-deck>

      <div class="dep-board container" data-board>
        <header class="dep-head" data-head>
          <div class="dep-head__meta">
            <p class="hud-label hud-label--primary" data-dep-label>Sneakers · Temporada 26</p>
            <p class="hud-label">Tallas ${sizeRange}</p>
          </div>
          <div class="dep-head__title">
            <h2 class="display dep-title" data-title>Catálogo</h2>
            <p class="dep-lead dep-enter" data-lead>${countWord(rows.length)} pares listos para estrenar. Elige un par y míralo en 3D.</p>
          </div>
        </header>

        <div class="dep-list" data-list style="${columnVars}">
          <div class="dep-bar dep-enter">
            <div class="dep-filters" role="group" aria-label="Filtrar por marca">
              ${FILTERS.map((brand) => `<button type="button" class="dep-chip" data-filter="${brand}" aria-pressed="${brand === 'Todas'}">${brand}</button>`).join('')}
            </div>
            <p class="hud-label dep-count" data-count aria-live="polite">${countLabel}</p>
          </div>
          <div class="dep-cols dep-enter" aria-hidden="true">
            ${COLUMNS.map((column) => `<span class="dep-col dep-col--${column.key}">${column.label}</span>`).join('')}
          </div>
          <ul class="dep-rows" data-rows aria-label="Modelos del catálogo">
            ${rows.map((row) => rowMarkup(row, counts)).join('')}
          </ul>
          <span class="dep-probe" data-probe aria-hidden="true">0000000000</span>
        </div>

        <div class="dep-band" data-band>
          <div class="dep-slot hud-frame dep-enter-slot" data-slot data-canvas="true">
            <span class="dep-slot__grid hud-grid" aria-hidden="true"></span>
            <span class="dep-slot__marks" aria-hidden="true"></span>
            <span class="stage-halo dep-halo" aria-hidden="true"></span>
            <canvas class="dep-canvas" data-canvas aria-hidden="true"></canvas>
            <span data-canvas-anchor hidden></span>
            <a class="hud-label dep-slot__away" href="#hangar">Ver en el Hangar 360° ↓</a>
            <span class="dep-slot__loader" aria-hidden="true"></span>
            <span class="hud-label dep-slot__label dep-slot__label--tl" aria-hidden="true">Vista 3D</span>
            <span class="hud-label dep-slot__label dep-slot__label--tr" data-slot-ref aria-hidden="true">Ref. ${first.flight}</span>
            <span class="hud-label dep-slot__label dep-slot__label--bl" data-loading aria-hidden="true">Cargando modelo 3D...</span>
            <span class="hud-label dep-slot__label dep-slot__label--br" data-slot-sizes aria-hidden="true">${first.sizes}</span>
          </div>

          <div class="dep-details" data-details>
            <div class="dep-details__top">
              <p class="hud-label" data-d-route>Ref. ${first.flight} · Tallas ${first.sizes}</p>
              <span class="dep-status" data-d-status data-tone="${status.tone}">
                <span class="dep-status__dot" aria-hidden="true"></span><span data-d-status-label>${status.label}</span>
              </span>
            </div>
            <h3 class="dep-details__name" data-d-name>
              <span class="visually-hidden" data-d-name-sr>${first.name}</span><span aria-hidden="true" data-d-name-text>${first.name}</span>
            </h3>
            <p class="dep-details__meta" data-d-meta>${first.brand} · ${first.colorway}</p>
            <p class="dep-details__tagline" data-d-tagline>${first.tagline}</p>
            <ul class="dep-details__tags" data-d-tags aria-label="Etiquetas">
              ${first.tags.map((tag) => `<li class="dep-tag">${tag}</li>`).join('')}
            </ul>
            <div class="dep-details__buy">
              <div class="dep-details__fare">
                <span class="hud-label">Precio</span>
                <span class="dep-details__price" data-d-price>${formatPrice(first.price)}</span>
              </div>
              <button class="btn btn--primary dep-cta" type="button" data-cta>
                <span class="visually-hidden">Agregar al carrito</span><span aria-hidden="true" data-cta-label>Agregar al carrito</span>${ARROW}
              </button>
            </div>
            <!-- Regiones vivas: cada mensaje se escribe una sola vez, con el texto final. -->
            <p class="visually-hidden" aria-live="polite" data-sr-selection></p>
            <p class="visually-hidden" role="status" data-sr-loading></p>
            <p class="visually-hidden" aria-live="polite" data-cta-status></p>
          </div>
        </div>
      </div>

      <div class="hangar" id="hangar" data-hangar>
        <div class="hangar-floor hud-grid" aria-hidden="true"></div>
        <div class="hangar-screen">
          <div class="hangar-layout container">
            <div class="hangar-copy">
              <div class="hangar-kicker dep-enter" data-h-reveal>
                <p class="hud-label hud-label--primary">Hangar · H-01</p>
                <span class="chip hangar-chip"><span class="hangar-chip__dot" aria-hidden="true"></span>Próximamente</span>
              </div>
              <h2 class="display hangar-title" data-h-title>Hangar<br />360°</h2>
              <p class="hangar-lead dep-enter" data-h-reveal>Muy pronto: elige un avatar, ponle cualquier par y míralo caminar en 360°.</p>
              <ul class="hangar-features" aria-label="Lo que trae el hangar">
                ${FEATURES.map(
                  (feature, index) => `
                  <li class="hangar-feature dep-enter" data-h-reveal>
                    <svg viewBox="0 0 24 24" aria-hidden="true">${feature.icon}</svg>
                    <span class="hangar-feature__index hud-label">${String(index + 1).padStart(2, '0')}</span>
                    <span class="hangar-feature__title">${feature.title}</span>
                    <span class="hangar-feature__text">${feature.text}</span>
                  </li>`,
                ).join('')}
              </ul>
              <div class="hangar-actions dep-enter" data-h-reveal>
                <button class="btn btn--ghost hangar-cta" type="button" disabled aria-describedby="hangar-cta-note">
                  Entrar al hangar <span class="hangar-cta__chip">Próximamente</span>
                </button>
                <p class="hud-label hangar-note" id="hangar-cta-note">Llega la próxima temporada</p>
              </div>
            </div>
            <div class="hangar-slot" data-hslot>
              <div
                class="hangar-stage"
                data-hstage
                data-canvas="false"
                tabindex="0"
                role="slider"
                aria-label="Girar el zapato en la plataforma"
                aria-valuemin="0"
                aria-valuemax="359"
                aria-valuenow="0"
                aria-valuetext="0 grados"
              >
                <span class="stage-halo hangar-halo" aria-hidden="true"></span>
                <div class="hangar-rings" data-rings aria-hidden="true">${ringsMarkup()}</div>
                <span data-canvas-anchor hidden></span>
                <div class="hangar-scan" data-scan aria-hidden="true"><span class="hangar-scan__beam" data-scan-beam></span></div>
                <span class="hud-label hangar-wait" aria-hidden="true">Esperando modelo</span>
              </div>
              <div class="hangar-hud hangar-hud--top dep-enter" data-h-reveal>
                <span class="hud-label" data-h-status>En plataforma</span>
                <span class="hangar-model"><span class="visually-hidden" data-h-model-sr>${first.name}</span><span aria-hidden="true" data-h-model>${first.name}</span></span>
              </div>
              <div class="hangar-hud hangar-hud--side dep-enter" data-h-reveal aria-hidden="true">
                <span class="hud-label">Elev 15°</span>
                <span class="hud-label">Escáner activo</span>
              </div>
              <div class="hangar-hud hangar-hud--bottom dep-enter" data-h-reveal>
                <span class="hangar-rot" data-rot aria-hidden="true">ROT 000°</span>
                <span class="hangar-progress" aria-hidden="true"><span data-rot-bar></span></span>
                <span class="hud-label" data-rot-hint>Plataforma giratoria · Arrastra para girar</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

export async function mount(root, context) {
  const { motion, hud, catalog, theme, createStage, MODEL_SLUGS, lite, reducedMotion } = context;
  const { gsap, ScrollTrigger, EASE, DURATION } = motion;
  const { CATALOG, formatPrice, findProduct } = catalog;
  const AVAILABILITY = catalog.AVAILABILITY ?? catalog.FLIGHT_STATUS;

  // ---------- Datos ----------

  const rowsData = CATALOG.map((product) => {
    const status = AVAILABILITY[product.status];
    return {
      product,
      tone: status.tone,
      text: {
        ref: product.flight,
        name: product.name,
        brand: product.brand,
        // La escala va en el encabezado ("Tallas EU"); la celda muestra el rango.
        sizes: product.sizes.replace(/^EU\s*/, ''),
        price: formatPrice(product.price).replace(/\s/g, ' '),
        stock: status.label,
      },
    };
  });
  const counts = Object.fromEntries(
    COLUMNS.map((column) => [column.key, Math.max(column.min, ...rowsData.map((row) => row.text[column.key].length))]),
  );
  const first = CATALOG[0];

  // Datos de tienda calculados del catálogo (sin relojes ni temporizadores).
  const brands = [...new Set(CATALOG.map((product) => product.brand))];
  const sizeBounds = CATALOG.flatMap((product) => (product.sizes.match(/\d+/g) ?? []).map(Number));
  const sizeRange = sizeBounds.length ? `EU ${Math.min(...sizeBounds)}-${Math.max(...sizeBounds)}` : '';
  const pairsLabel = (count, suffix) => `${String(count).padStart(2, '0')} ${count === 1 ? 'par' : 'pares'} · ${suffix}`;
  const countLabel = pairsLabel(CATALOG.length, `${brands.length} marcas`);

  // Carrito: el de core si la página lo comparte; si no, el mismo módulo.
  const cart = context.cart ?? (await import('../../core/cart.js').catch(() => null));

  // ---------- DOM ----------

  root.classList.add('dep');
  root.classList.toggle('is-reduced', reducedMotion);
  // Con movimiento, el CSS fija el estado inicial de las entradas (opacity y
  // transform, nunca visibility): todo es legible y enfocable desde el inicio.
  root.classList.toggle('is-motion', !reducedMotion);
  root.innerHTML = template({ rows: rowsData, counts, first, formatPrice, AVAILABILITY, brands, sizeRange, countLabel });

  const $ = (selector) => root.querySelector(selector);
  const elements = {
    canvas: $('canvas.dep-canvas'),
    rings: $('[data-rings]'),
    ringTicks: $('[data-ticks]'),
    scan: $('[data-scan]'),
    board: $('[data-board]'),
    slot: $('[data-slot]'),
    hangar: $('[data-hangar]'),
    hstage: $('[data-hstage]'),
  };
  const list = $('[data-list]');
  const rowsList = $('[data-rows]');
  const probe = $('[data-probe]');
  const details = {
    route: $('[data-d-route]'),
    status: $('[data-d-status]'),
    statusLabel: $('[data-d-status-label]'),
    name: $('[data-d-name]'),
    nameText: $('[data-d-name-text]'),
    nameSr: $('[data-d-name-sr]'),
    meta: $('[data-d-meta]'),
    tagline: $('[data-d-tagline]'),
    tags: $('[data-d-tags]'),
    price: $('[data-d-price]'),
  };
  const slotRef = $('[data-slot-ref]');
  const slotSizes = $('[data-slot-sizes]');
  const loading = $('[data-loading]');
  const hangarModel = $('[data-h-model]');
  const hangarModelSr = $('[data-h-model-sr]');
  const srSelection = $('[data-sr-selection]');
  const srLoading = $('[data-sr-loading]');
  const countEl = $('[data-count]');
  const hangarStatus = $('[data-h-status]');
  const cta = $('[data-cta]');
  const ctaLabel = $('[data-cta-label]');
  const ctaStatus = $('[data-cta-status]');
  const rotEl = $('[data-rot]');
  const rotBar = $('[data-rot-bar]');
  const arc = $('[data-arc]');
  const chips = [...root.querySelectorAll('[data-filter]')];
  hud.frameCorners(elements.slot);
  const dragHint = window.matchMedia('(pointer: coarse)').matches ? 'Desliza para girar' : 'Arrastra para girar';
  $('[data-rot-hint]').textContent = `Plataforma giratoria · ${dragHint}`;

  const flap = createFlapEngine({ gsap, reducedMotion });
  const rows = rowsData.map((data) => {
    const li = rowsList.querySelector(`[data-slug="${data.product.slug}"]`);
    const cells = Object.fromEntries(
      COLUMNS.map((column) => [column.key, collectTiles(li.querySelector(`[data-cell="${column.key}"]`))]),
    );
    const fitted = Object.fromEntries(COLUMNS.map((column) => [column.key, fitText(data.text[column.key], counts[column.key])]));
    return { ...data, slug: data.product.slug, brand: data.product.brand, li, button: li.querySelector('.dep-row'), cells, fitted };
  });
  const rowBySlug = Object.fromEntries(rows.map((row) => [row.slug, row]));

  // ---------- Escenario 3D (uno solo para tablero y hangar) ----------

  // Solo se precarga el primer producto; el resto llega al pedirlo o al pasar
  // el cursor por su fila (rig.prefetch).
  const stage = createStage(elements.canvas, {
    models: MODEL_SLUGS,
    preload: [first.slug],
    lite,
    fov: 26,
    cameraZ: 1.4,
  });
  // No dibuja hasta que su base esté a la vista (lo decide el rig).
  stage.setRendering(false);

  // Estado de carga visible en la vista previa y en la plataforma. El rótulo
  // visible (con porcentaje) es aria-hidden; a los lectores de pantalla solo se
  // les anuncia el inicio y el final de una carga pedida por el usuario.
  let initialLoaded = false;
  let announcedLoading = false;
  function setLoading(state, slug) {
    const isLoading = state === 'loading';
    if (initialLoaded) {
      const name = findProduct(slug)?.name ?? '';
      if (isLoading && !announcedLoading) {
        announcedLoading = true;
        srLoading.textContent = `Cargando modelo 3D de ${name}...`;
      } else if (!isLoading && announcedLoading) {
        announcedLoading = false;
        srLoading.textContent = state === 'error' ? 'No se pudo cargar el modelo 3D.' : `Modelo 3D de ${name} listo.`;
      }
    }
    elements.slot.classList.toggle('is-loading', isLoading);
    elements.hstage.classList.toggle('is-loading', isLoading);
    loading.classList.toggle('hud-label--primary', state === 'idle');
    loading.classList.toggle('hud-label--alert', state === 'error');
    if (state === 'loading') loading.textContent = 'Cargando modelo 3D...';
    else if (state === 'error') loading.textContent = 'Modelo 3D no disponible';
    else loading.textContent = dragHint;
    hangarStatus.textContent = isLoading ? 'Cargando modelo 3D...' : 'En plataforma';
  }
  stage.onProgress((value) => {
    if (!initialLoaded) loading.textContent = `Cargando modelo 3D... ${Math.round(value * 100)}%`;
  });
  stage.ready.then(
    () => {
      initialLoaded = true;
      setLoading('idle');
    },
    () => setLoading('error'),
  );

  // Lectura de giro: ROT, barra, arco y valor del control deslizante.
  const TAU = Math.PI * 2;
  let shownDegrees = -1;
  function showRotation(angle) {
    const turn = (((angle % TAU) + TAU) % TAU) / TAU;
    const degrees = Math.floor(turn * 360) % 360;
    rotBar.style.transform = `scaleX(${turn.toFixed(4)})`;
    arc.style.strokeDasharray = `${turn.toFixed(4)} 1`;
    if (degrees === shownDegrees) return;
    shownDegrees = degrees;
    rotEl.textContent = `ROT ${String(degrees).padStart(3, '0')}°`;
    elements.hstage.setAttribute('aria-valuenow', String(degrees));
    elements.hstage.setAttribute('aria-valuetext', `${degrees} grados`);
  }

  const rig = createRig({
    stage,
    motion,
    catalog,
    reducedMotion,
    theme,
    canvas: elements.canvas,
    hosts: { board: elements.slot, hangar: elements.hstage },
    hangarParts: { rings: elements.rings, ticks: elements.ringTicks, scan: elements.scan },
    onLoading: setLoading,
    onRotate: showRotation,
  });

  // ---------- Ajuste del tablero a su columna ----------

  // La mono del sistema es ancha: se mide su avance real (ch / em) y el tablero
  // escala su tipografía para que las seis columnas entren justas.
  function fitBoard() {
    const style = getComputedStyle(probe);
    const ratio = probe.getBoundingClientRect().width / 10 / parseFloat(style.fontSize);
    const tileEm = ratio + 0.42 + 0.1;
    const total = (keys) => keys.reduce((sum, key) => sum + counts[key] * tileEm, 0) + (keys.length - 1) * 1 + 2.2;
    const full = total(COLUMNS.map((column) => column.key));
    const compact = total(COLUMNS.filter((column) => column.key !== 'brand').map((column) => column.key));
    const width = list.getBoundingClientRect().width;
    const isCompact = width / full < 10.5;
    list.classList.toggle('is-compact', isCompact);
    list.style.setProperty('--dep-fit', (isCompact ? compact : full).toFixed(2));
    // En tarjetas (móvil) el nombre va en su propia fila: su tamaño se ajusta
    // para que el nombre más largo del catálogo quepa en el ancho de la tarjeta.
    // Se mide el ancho útil (sin el relleno de la tarjeta): con nombres largos
    // como "Jordan 4 Retro University Blue", medir con el relleno hacía que las
    // paletas se salieran por la derecha.
    const cells = list.querySelector('.dep-row__cells');
    const cellsStyle = cells ? getComputedStyle(cells) : null;
    const cellsWidth = cells
      ? cells.getBoundingClientRect().width - parseFloat(cellsStyle.paddingLeft) - parseFloat(cellsStyle.paddingRight)
      : 0;
    if (cellsWidth > 0) {
      const nameSize = Math.min(14.6, cellsWidth / (counts.name * tileEm));
      list.style.setProperty('--dep-name-size', `${nameSize.toFixed(2)}px`);
    }
  }


  // ---------- Selección ----------

  let selected = null;
  const priceState = { value: first.price };
  let priceTween = null;

  function renderDetails(product, animate) {
    const status = AVAILABILITY[product.status];
    details.route.textContent = `Ref. ${product.flight} · Tallas ${product.sizes}`;
    details.status.dataset.tone = status.tone;
    details.statusLabel.textContent = status.label;
    details.meta.textContent = `${product.brand} · ${product.colorway}`;
    details.tagline.textContent = product.tagline;
    details.tags.innerHTML = product.tags.map((tag) => `<li class="dep-tag">${tag}</li>`).join('');
    slotRef.textContent = `Ref. ${product.flight}`;
    slotSizes.textContent = product.sizes;

    gsap.killTweensOf([details.nameText, hangarModel]);
    priceTween?.kill();
    // Texto final para lectores de pantalla; lo visible puede "decodificarse".
    details.nameSr.textContent = product.name;
    hangarModelSr.textContent = product.name;
    fitSingleLine(details.name, product.name);
    if (!animate || reducedMotion) {
      details.nameText.textContent = product.name;
      hangarModel.textContent = product.name;
      details.price.textContent = formatPrice(product.price);
      priceState.value = product.price;
      return;
    }
    hud.scramble(details.nameText, product.name, { duration: 0.7 });
    hud.scramble(hangarModel, product.name, { duration: 0.7 });
    gsap.fromTo(
      [details.meta, details.tagline, ...details.tags.children],
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: DURATION.reveal, ease: EASE.out, stagger: 0.04, overwrite: true },
    );
    priceTween = gsap.to(priceState, {
      value: product.price,
      duration: 0.9,
      ease: 'power3.out',
      onUpdate: () => {
        details.price.textContent = formatPrice(Math.round(priceState.value));
      },
    });
  }

  function select(slug, { animate = true } = {}) {
    if (slug === selected) return;
    selected = slug;
    const product = findProduct(slug);
    for (const row of rows) row.button.setAttribute('aria-pressed', String(row.slug === slug));
    renderDetails(product, animate);
    // Un solo anuncio por selección, con el texto final (no el que se decodifica).
    if (animate) srSelection.textContent = `${product.name}, ${formatPrice(product.price)}, ${AVAILABILITY[product.status].label}.`;
    rig.show(slug);
  }

  // La selección SOLO cambia con clic, toque o Enter/Espacio (el clic nativo
  // del botón). Pasar el cursor o el foco no selecciona: solo precarga el
  // modelo de la fila (y el de la siguiente) para que el clic se sienta inmediato.
  function prefetchAround(row) {
    rig.prefetch(row.slug);
    const items = [...rowsList.children];
    const next = items[items.indexOf(row.li) + 1];
    if (next) rig.prefetch(next.dataset.slug);
  }

  for (const row of rows) {
    row.button.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse' && !row.button.disabled) prefetchAround(row);
    });
    row.button.addEventListener('focus', () => prefetchAround(row));
    row.button.addEventListener('click', () => select(row.slug));
  }

  // Flechas arriba/abajo mueven el foco entre modelos; Enter o Espacio eligen.
  rowsList.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = [...rowsList.querySelectorAll('.dep-row:not([disabled])')];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length].focus();
  });

  // Agregar al carrito (API de core). Sin selector de talla: se omite "size".
  let ctaTimer = null;
  cta.addEventListener('click', () => {
    if (cta.classList.contains('is-done')) return;
    const product = findProduct(selected);
    const count = cart?.add?.({ slug: product.slug, kind: 'sneaker' });
    cta.classList.add('is-done');
    hud.scramble(ctaLabel, 'Agregado al carrito', { duration: 0.6 });
    const total = typeof count === 'number' ? ` Tienes ${count} ${count === 1 ? 'artículo' : 'artículos'}.` : '';
    ctaStatus.textContent = `${product.name}: agregado al carrito.${total}`;
    clearTimeout(ctaTimer);
    ctaTimer = setTimeout(() => {
      cta.classList.remove('is-done');
      hud.scramble(ctaLabel, 'Agregar al carrito', { duration: 0.5 });
    }, 2600);
  });

  // ---------- Tablero split-flap ----------

  let boardStarted = false;

  function flapRow(row, { delay = 0, short = false } = {}) {
    let offset = 0;
    for (const column of COLUMNS) {
      const tiles = row.cells[column.key];
      flap.flapTo(tiles, row.fitted[column.key], {
        delay: delay + offset * 0.012,
        stagger: 0.014,
        minSteps: short ? 2 : 3,
        maxSteps: short ? 5 : 11,
      });
      offset += tiles.length;
    }
  }

  // El tablero gira sus paletas una vez al entrar en vista (o al recibir foco).
  // "Últimos pares" late unas pocas veces en ese momento y luego queda fijo.
  function startBoard() {
    if (boardStarted) return;
    boardStarted = true;
    rows.forEach((row, index) => flapRow(row, { delay: index * 0.09 }));
    list.classList.add('is-pulsing');
  }

  // ---------- Filtros por marca (reordenan con FLIP) ----------

  let activeFilter = 'Todas';
  function applyFilter(brand) {
    if (brand === activeFilter) return;
    activeFilter = brand;
    for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.filter === brand));
    const matches = (row) => brand === 'Todas' || row.brand === brand;
    const before = new Map(rows.map((row) => [row, row.li.getBoundingClientRect().top]));
    const ordered = [...rows.filter(matches), ...rows.filter((row) => !matches(row))];
    for (const row of ordered) rowsList.appendChild(row.li);
    for (const row of rows) {
      const match = matches(row);
      row.li.classList.toggle('is-dimmed', !match);
      row.button.disabled = !match;
      const delta = before.get(row) - row.li.getBoundingClientRect().top;
      if (delta && !reducedMotion) {
        gsap.fromTo(row.li, { y: delta }, { y: 0, duration: DURATION.reveal, ease: EASE.out, overwrite: true });
      }
    }
    if (boardStarted) ordered.filter(matches).forEach((row, index) => flapRow(row, { delay: 0.08 + index * 0.06, short: true }));
    const visibleCount = rows.filter(matches).length;
    countEl.textContent = brand === 'Todas' ? countLabel : pairsLabel(visibleCount, brand);
    // La selección se mantiene si sigue visible; si quedó filtrada, pasa a la primera fila.
    if (!matches(rowBySlug[selected])) select(ordered[0].slug);
  }
  for (const chip of chips) chip.addEventListener('click', () => applyFilter(chip.dataset.filter));

  // "Ver en 3D" desde el estilista: elige el producto igual que un clic en su
  // fila. Si un filtro lo oculta, primero se muestran todas las marcas.
  document.addEventListener('airspace:select-product', (event) => {
    const row = rowBySlug[event.detail?.slug];
    if (!row) return;
    if (activeFilter !== 'Todas' && row.brand !== activeFilter) applyFilter('Todas');
    select(row.slug);
  });

  // ---------- Estado inicial ----------

  select(first.slug, { animate: false });
  if (reducedMotion) {
    boardStarted = true;
    for (const row of rows) for (const column of COLUMNS) flap.set(row.cells[column.key], row.fitted[column.key]);
  }

  // ---------- Layout y paso al hangar ----------

  // fitBoard cambia el alto del tablero: va en refreshInit, ANTES de que
  // ScrollTrigger mida, para que ninguna posición quede vieja.
  fitBoard();
  ScrollTrigger.addEventListener('refreshInit', fitBoard);

  // Paso tablero -> hangar: cuando el tablero ya casi salió de la vista, el
  // canvas se muda a la plataforma y el zapato "aterriza" con una transición
  // por tiempo. Al volver, regresa a la vista previa. Sin scrub ni pin.
  ScrollTrigger.create({
    trigger: elements.board,
    start: 'bottom 40%',
    onEnter: () => rig.attach('hangar'),
    onLeaveBack: () => rig.attach('board'),
  });

  // Entradas por grupo, por tiempo y una sola vez. El estado inicial (opacity
  // y transform) lo fija el CSS con .dep.is-motion; nunca se usa visibility,
  // así el contenido es legible y enfocable antes de animarse. Si el foco llega
  // al grupo antes que su entrada, la entrada se completa al instante.
  // Con movimiento reducido no hay entradas: todo queda visible y quieto.
  function entrance(container, trigger, build) {
    if (reducedMotion) return null;
    const timeline = gsap.timeline({ paused: true });
    build(timeline);
    ScrollTrigger.create({ ...trigger, once: true, onEnter: () => timeline.play() });
    container.addEventListener('focusin', () => timeline.progress(1), { once: true });
    return timeline;
  }
  const fadeUp = (targets, y = 14, stagger = 0.08) => [
    targets,
    { opacity: 0, y },
    { opacity: 1, y: 0, duration: DURATION.reveal, ease: EASE.out, stagger },
  ];

  // Encabezado y tablero: regla, etiqueta que se decodifica, título por letras,
  // texto de apoyo, filtros, columnas y la vista 3D.
  entrance(elements.board, { trigger: $('[data-head]'), start: 'top 85%' }, (timeline) => {
    timeline
      .fromTo('[data-intro-rule]', { scaleX: 0 }, { scaleX: 1, duration: DURATION.cinematic, ease: EASE.inOut }, 0)
      .add(hud.scramble($('[data-dep-label]'), 'Sneakers · Temporada 26', { duration: 1.1 }), 0)
      .add(hud.revealText($('[data-title]'), { type: 'chars', stagger: 0.04 }), 0)
      .fromTo(...fadeUp([$('[data-lead]'), $('.dep-bar'), $('.dep-cols')]), 0.2)
      .fromTo(
        elements.slot,
        { opacity: 0, scale: 0.96 },
        { opacity: 1, scale: 1, duration: DURATION.cinematic, ease: EASE.out },
        0,
      );
  });

  // Las paletas giran al entrar el tablero en vista, o al instante si el foco llega antes.
  ScrollTrigger.create({ trigger: list, start: 'top 85%', once: true, onEnter: startBoard });
  list.addEventListener('focusin', startBoard, { once: true });

  // Hangar: título, textos y HUD; los anillos se dibujan un poco después.
  entrance(elements.hangar, { trigger: elements.hangar, start: 'top 60%' }, (timeline) => {
    timeline
      .add(hud.revealText($('[data-h-title]'), { type: 'chars', stagger: 0.035 }), 0)
      .fromTo(...fadeUp(root.querySelectorAll('[data-h-reveal]'), 16, 0.07), 0.15)
      .add(hud.drawLines(elements.rings.querySelectorAll('[data-draw]'), { duration: DURATION.cinematic, stagger: 0.12 }), 0.3)
      .fromTo(elements.ringTicks.children, { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.006, ease: 'none' }, 0.3);
  });

  // Escáner en bucle: solo corre con el zapato en la plataforma y a la vista.
  const beam = $('[data-scan-beam]');
  if (!reducedMotion) {
    const scan = gsap
      .timeline({ repeat: -1, repeatDelay: 1.1, paused: true })
      .fromTo(beam, { yPercent: 100, opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'none' })
      .to(beam, { yPercent: 0, duration: 2, ease: EASE.inOut }, 0)
      .to(beam, { opacity: 0, duration: 0.45, ease: 'none' }, '-=0.3');
    rig.onLive(({ host, live }) => scan.paused(!(live && host === 'hangar')));
  } else {
    gsap.set(beam, { opacity: 0 });
  }
  showRotation(0);
}
