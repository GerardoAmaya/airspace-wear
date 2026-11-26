// Pie de página "Únete al club" (id "club"): una tarjeta de miembro con talón
// desprendible para escanear al pagar. La tarjeta entra y se asienta al
// aparecer, el código de barras se dibuja y los campos se decodifican. En
// escritorio el talón se inclina sobre la perforación al pasar el puntero,
// como a punto de rasgarse. Debajo va la barra final: logo, enlaces, tema,
// idioma y aviso. Los enlaces con # los maneja main.js (scroll suave y foco).

const DATE_FORMAT = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' });

const MEMBER = {
  name: 'Invitado',
  number: 'AS-2026',
  favoriteSize: 'Por elegir',
  season: '26',
};

const ICONS = {
  check:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrow:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4 12.5 8l-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3.5M4 7.5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// Generador pseudoaleatorio determinista (mismo código de barras siempre).
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text) {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
  return hash >>> 0;
}

// Código de barras SVG: barras de 1 a 4 unidades con huecos irregulares y
// barras guía en los extremos. Cada barra es una <line> para poder
// "dibujarla" con DrawSVG.
function barcodeSvg(seed, { units = 150, height = 40 } = {}) {
  const random = createRandom(hashString(seed));
  const bars = [];
  const guard = (x) => {
    bars.push({ x, width: 1 }, { x: x + 2, width: 1 });
    return x + 4;
  };
  let x = guard(0);
  while (x < units - 6) {
    const width = [1, 1, 1, 2, 2, 3, 4][Math.floor(random() * 7)];
    bars.push({ x, width });
    x += width + 1 + Math.floor(random() * 2.2);
  }
  guard(units - 3);
  const lines = bars
    .map((bar) => `<line x1="${bar.x + bar.width / 2}" y1="0" x2="${bar.x + bar.width / 2}" y2="${height}" stroke-width="${bar.width}"/>`)
    .join('');
  return `<svg class="pass-barcode__svg" viewBox="0 0 ${units} ${height}" preserveAspectRatio="none" aria-hidden="true"><g stroke="currentColor">${lines}</g></svg>`;
}

const field = (label, value, extraClass = '') => `
  <div class="pass-field ${extraClass}">
    <dt class="pass-field__label">${label}</dt>
    <dd class="pass-field__value" data-decode>${value}</dd>
  </div>`;

// Los elementos con data-reveal empiezan transparentes por CSS (solo
// opacidad) mientras la sección está en data-motion="pending". El texto
// siempre está en el HTML: nada depende de que una animación termine.
function renderFooter({ since }) {
  return `
    <div class="container footer-inner">
      <div class="footer-intro">
        <div class="footer-intro__head">
          <p class="hud-label hud-label--primary footer-kicker" data-footer-kicker data-reveal>
            <span class="status-dot footer-dot" aria-hidden="true"></span>Acceso anticipado
          </p>
          <h2 class="heading footer-title" data-footer-title>Únete al club</h2>
        </div>
        <p class="lead footer-lead" data-footer-lead>
          Crea tu cuenta para guardar tus pares favoritos, seguir tus pedidos y enterarte primero de cada lanzamiento.
        </p>
      </div>

      <div class="pass-stage">
        <article class="pass" data-pass data-reveal aria-labelledby="pass-title">
          <div class="pass-main">
            <div class="pass-band">
              <span class="pass-band__brand" aria-hidden="true" data-reveal>AIRSPACE<span>Wear</span></span>
              <h3 class="pass-band__title" id="pass-title" data-reveal>Tarjeta de miembro</h3>
              <span class="pass-band__meta" data-reveal>Temporada ${MEMBER.season}</span>
            </div>

            <div class="pass-body">
              <div class="pass-club">
                <div class="pass-club__name">
                  <span class="pass-field__label">Club de miembros</span>
                  <span class="pass-club__title" data-pass-code data-reveal>AIRSPACE CLUB</span>
                  <svg class="pass-club__line" viewBox="0 0 400 8" preserveAspectRatio="none" aria-hidden="true">
                    <line class="pass-club__track" x1="0" y1="4" x2="392" y2="4" />
                    <line class="pass-club__stroke" data-path-line x1="0" y1="4" x2="392" y2="4" />
                    <circle cx="395" cy="4" r="3" />
                  </svg>
                  <span class="pass-club__perk" data-reveal>Lanzamientos antes que nadie</span>
                </div>
                <div class="pass-club__season">
                  <span class="pass-field__label">Temporada</span>
                  <span class="pass-club__number" data-pass-code data-reveal>${MEMBER.season}</span>
                </div>
              </div>

              <dl class="pass-fields">
                ${field('Miembro', MEMBER.name)}
                ${field('Nº de miembro', MEMBER.number, 'pass-field--accent')}
                ${field('Desde', since)}
                ${field('Talla favorita', MEMBER.favoriteSize)}
              </dl>

              <div class="pass-actions">
                <a class="btn btn--primary pass-cta" href="#" data-action="signup" data-reveal>Crear cuenta ${ICONS.arrow}</a>
                <button class="btn btn--ghost pass-waitlist" type="button" data-action="waitlist" aria-pressed="false" data-reveal>
                  <span data-waitlist-label>Unirme a la lista</span>
                </button>
                <p class="pass-note" data-note role="status" aria-live="polite"></p>
              </div>
            </div>
          </div>

          <div class="pass-stub" data-stub>
            <div class="pass-band pass-band--stub">
              <span class="pass-band__title" data-reveal>Escanea al pagar</span>
            </div>
            <div class="pass-stub__body">
              <dl class="pass-fields pass-fields--stub">
                ${field('Nº de miembro', MEMBER.number, 'pass-field--accent pass-field--code')}
              </dl>
              <p class="pass-stub__note">Válida en tienda y en línea</p>
              <div class="pass-barcode">
                ${barcodeSvg(`${MEMBER.number}-CLUB`)}
                <p class="pass-barcode__code" aria-hidden="true" data-reveal>${MEMBER.number.replace('-', '')} CLUB T${MEMBER.season}</p>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div class="footer-bar">
        <div class="footer-bar__row">
          <a class="logo footer-logo" href="#inicio" aria-label="AIRSPACE Wear, volver al inicio" data-reveal>AIRSPACE<span class="logo__wear">Wear</span></a>
          <nav class="footer-nav" aria-label="Pie de página" data-reveal>
            <a href="#catalogo">Catálogo</a>
            <a href="#hangar">Hangar 360°</a>
            <a href="#balones">Balones</a>
            <a href="#estilista">Estilista IA</a>
            <a href="/credits">Créditos</a>
          </nav>
          <div class="footer-tools" data-reveal>
            <div class="footer-theme" role="group" aria-label="Tema de color">
              <button type="button" data-theme-option="dark" aria-pressed="false">Noche</button>
              <button type="button" data-theme-option="light" aria-pressed="false">Día</button>
            </div>
            <div class="lang-switch" role="group" aria-label="Idioma">
              <button type="button" aria-pressed="true" lang="es" data-footer-lang="es">ES</button>
              <button type="button" aria-pressed="false" lang="en" data-footer-lang="en">EN</button>
            </div>
          </div>
          <p class="footer-note" role="status" aria-live="polite" data-footer-note></p>
        </div>
        <div class="footer-bar__row footer-bar__row--legal">
          <p class="footer-disclaimer" data-reveal>Proyecto de portafolio. Sin afiliación con ninguna marca mostrada.</p>
          <p class="footer-copy" data-reveal>© 2026 AIRSPACE Wear</p>
          <a class="footer-top" href="#inicio" data-reveal>Volver arriba ${ICONS.up}</a>
        </div>
      </div>
    </div>

    <div class="footer-wordmark" aria-hidden="true">
      <svg viewBox="0 0 1000 150" preserveAspectRatio="xMidYMax meet" data-reveal>
        <text x="500" y="139" text-anchor="middle" textLength="992" lengthAdjust="spacingAndGlyphs">AIRSPACE</text>
      </svg>
    </div>`;
}

export async function mount(root, context) {
  const { motion, hud, theme, reducedMotion } = context;
  const { gsap, ScrollTrigger, EASE, DURATION } = motion;

  // "Desde": la fecha de hoy, como si la tarjeta se emitiera ahora.
  const since = DATE_FORMAT.format(new Date()).replace(/\./g, '').replace(/ de /g, ' ').toUpperCase();

  root.classList.add('footer-section');
  // Estado inicial de las entradas (lo aplica el CSS). Con movimiento
  // reducido no hay entradas: todo se muestra desde el principio.
  if (!reducedMotion) root.dataset.motion = 'pending';
  root.innerHTML = renderFooter({ since });
  await document.fonts.ready;

  const pass = root.querySelector('[data-pass]');
  // Los disparadores miden el contenedor, que nunca se transforma.
  const passStage = root.querySelector('.pass-stage');
  const stub = root.querySelector('[data-stub]');
  const note = root.querySelector('[data-note]');
  const footerNote = root.querySelector('[data-footer-note]');

  // ---------- Acciones de la demo ----------

  root.querySelector('[data-action="signup"]').addEventListener('click', (event) => {
    event.preventDefault();
    note.textContent = 'El registro abre con el sitio real. Por ahora, sigue explorando.';
  });

  const waitlist = root.querySelector('[data-action="waitlist"]');
  waitlist.addEventListener('click', () => {
    const joined = waitlist.getAttribute('aria-pressed') !== 'true';
    waitlist.setAttribute('aria-pressed', String(joined));
    waitlist.querySelector('[data-waitlist-label]').innerHTML = joined ? `${ICONS.check}En la lista` : 'Unirme a la lista';
    note.textContent = joined ? 'Listo: te avisaremos de cada lanzamiento (demo).' : 'Saliste de la lista.';
  });

  // Idioma: el prototipo existe solo en español.
  root.querySelector('[data-footer-lang="en"]').addEventListener('click', () => {
    footerNote.textContent = 'La versión en inglés llega con el sitio final.';
  });

  // Interruptor de tema (Noche / Día), sincronizado con el del encabezado.
  const themeButtons = [...root.querySelectorAll('[data-theme-option]')];
  const syncTheme = (current) =>
    themeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.themeOption === current)));
  syncTheme(theme.get());
  theme.onChange(syncTheme);
  themeButtons.forEach((button) =>
    button.addEventListener('click', () => {
      const rect = button.getBoundingClientRect();
      theme.set(button.dataset.themeOption, { origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } });
    }),
  );

  if (reducedMotion) return;

  // ---------- Movimiento (solo opacidad y transform) ----------

  // Cada grupo es una entrada de una sola vez. Si el foco del teclado llega
  // antes que el scroll, la entrada se completa al instante.
  const groups = [];
  const revealGroup = (container, timeline, start) => {
    groups.push(timeline);
    ScrollTrigger.create({ trigger: container, start, once: true, onEnter: () => timeline.play() });
    container.addEventListener('focusin', () => {
      if (timeline.progress() < 1) timeline.progress(1);
    });
    timeline.eventCallback('onComplete', () => {
      if (groups.every((group) => group.progress() === 1)) root.dataset.motion = 'done';
    });
  };
  const show = (targets, vars = {}) => [targets, { opacity: 0, ...vars.from }, { opacity: 1, ...vars.to }];

  // Entrada del texto.
  const intro = gsap.timeline({ paused: true, defaults: { ease: EASE.out, duration: DURATION.reveal } });
  intro
    .fromTo(...show(root.querySelector('[data-footer-kicker]'), { from: { x: -16 }, to: { x: 0 } }), 0)
    .add(hud.revealText(root.querySelector('[data-footer-title]'), { stagger: 0.08, duration: 1.1 }), 0.05)
    .add(hud.revealText(root.querySelector('[data-footer-lead]'), { stagger: 0.05 }), 0.25);
  revealGroup(root.querySelector('.footer-intro'), intro, 'top 82%');

  // La tarjeta llega deslizándose e inclinada y se asienta; luego el talón se
  // sacude, se traza la línea del club, se dibuja el código de barras y los
  // campos se decodifican (desde su propio texto, que nunca desaparece).
  const passTimeline = gsap.timeline({ paused: true, defaults: { ease: EASE.out } });
  passTimeline
    .fromTo(
      ...show(pass, {
        from: { y: 120, rotation: -3.5, rotationX: 16, transformPerspective: 1400, transformOrigin: '50% 100%' },
        to: { y: 0, rotation: 0, rotationX: 0, duration: 1.5, ease: 'power4.out' },
      }),
      0,
    )
    .from(stub, { rotation: 3, x: 6, transformOrigin: '0% 100%', duration: 1.6, ease: 'elastic.out(1, 0.45)' }, 0.55)
    .fromTo(...show(root.querySelectorAll('.pass-band [data-reveal]'), { from: { y: 8 }, to: { y: 0, stagger: 0.05, duration: 0.6 } }), 0.35)
    .fromTo(...show(root.querySelectorAll('[data-pass-code]'), { from: { yPercent: 40 }, to: { yPercent: 0, stagger: 0.1, duration: 1 } }), 0.4)
    .fromTo(...show(root.querySelector('.pass-club__perk'), { to: { duration: 0.6 } }), 1.1)
    .fromTo(...show(root.querySelectorAll('.pass-actions [data-reveal]'), { from: { y: 12 }, to: { y: 0, stagger: 0.08, duration: 0.8 } }), 0.8)
    .fromTo(...show(root.querySelector('.pass-barcode__code'), { to: { duration: 0.6 } }), 1.2);

  const pathLine = hud.drawLines(root.querySelector('[data-path-line]'), { duration: 1.6 });
  if (pathLine) passTimeline.add(pathLine, 0.5);
  const barcode = hud.drawLines(root.querySelectorAll('.pass-barcode__svg line'), { duration: 0.5, stagger: 0.008, ease: EASE.out });
  if (barcode) passTimeline.add(barcode, 0.65);

  root.querySelectorAll('[data-decode]').forEach((element, index) => {
    const tween = hud.scramble(element, element.textContent.trim(), {
      duration: 0.9,
      chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    });
    if (tween) passTimeline.add(tween, 0.55 + index * 0.05);
  });
  revealGroup(passStage, passTimeline, 'top 78%');

  // Barra final y marca gigante.
  const bar = gsap.timeline({ paused: true, defaults: { ease: EASE.out, duration: DURATION.reveal } });
  bar.fromTo(...show(root.querySelectorAll('.footer-bar [data-reveal]'), { from: { y: 14 }, to: { y: 0, stagger: 0.05 } }), 0);
  revealGroup(root.querySelector('.footer-bar'), bar, 'top 92%');

  const wordmark = gsap.timeline({ paused: true });
  wordmark.fromTo(
    ...show(root.querySelector('.footer-wordmark svg'), { from: { yPercent: 60 }, to: { yPercent: 0, duration: DURATION.cinematic, ease: EASE.out } }),
  );
  revealGroup(root.querySelector('.footer-wordmark'), wordmark, 'top 96%');

  // El punto de la etiqueta solo late mientras el pie está en pantalla.
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => root.classList.toggle('is-live', self.isActive),
  });

  // Talón a punto de rasgarse: solo con puntero fino (escritorio) y diseño horizontal.
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  const horizontal = window.matchMedia('(min-width: 861px)');
  pass.addEventListener('pointerenter', () => {
    if (!canHover.matches || !horizontal.matches || passTimeline.isActive()) return;
    gsap.to(stub, { rotation: 3.2, x: 6, y: -2, transformOrigin: '0% 100%', duration: 0.7, ease: EASE.out, overwrite: 'auto' });
  });
  pass.addEventListener('pointerleave', () => {
    if (!canHover.matches || !horizontal.matches) return;
    gsap.to(stub, { rotation: 0, x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.5)', overwrite: 'auto' });
  });
}
