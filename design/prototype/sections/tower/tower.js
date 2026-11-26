// Sección "Estilista IA" (id "tower"): adelanto del estilista con IA.
// Una consola de chat dentro de un marco HUD. Al entrar en pantalla se
// reproduce un intercambio guionado: el visitante escribe letra por letra,
// el estilista responde palabra por palabra y aparecen las tarjetas de
// recomendación. Las ideas sugeridas reproducen otros guiones y el campo de
// texto recibe una respuesta fija que explica la IA del sitio real.

import { FREE_REPLY, SCENARIOS } from './tower-script.js';

const TIME_FORMAT = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false });
const WAVE_BAR_COUNT = 34;

const ICONS = {
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3Z"/></g></svg>',
  arrow:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 11.5 11.5 4.5M5.5 4.5h6v6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const pad = (value) => String(value).padStart(2, '0');
const clock = () => TIME_FORMAT.format(new Date());

// Generador pseudoaleatorio determinista: el ritmo de tecleo es "humano"
// pero igual en cada reproducción.
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

// Divide la respuesta en palabras. Los tramos entre [corchetes] se marcan
// como resaltados y la puntuación queda pegada a su palabra.
function tokenize(answer) {
  const tokens = [];
  let pendingSpace = false;
  for (const part of answer.split(/(\[[^\]]+\])/)) {
    if (!part) continue;
    const highlight = part.startsWith('[');
    const text = highlight ? part.slice(1, -1) : part;
    for (const piece of text.split(/(\s+)/)) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) {
        pendingSpace = true;
        continue;
      }
      tokens.push({ word: piece, highlight, space: tokens.length > 0 && pendingSpace });
      pendingSpace = false;
    }
  }
  return tokens;
}

const plainText = (answer) => answer.replace(/[[\]]/g, '');

function renderSection(modelCount) {
  const chips = SCENARIOS.map(
    (scenario, index) => `
      <button class="tower-chip" type="button" data-scenario="${index}" aria-pressed="false">
        ${scenario.chip}
      </button>`,
  ).join('');

  return `
    <div class="tower-grid hud-grid" aria-hidden="true"></div>
    <div class="container tower-inner">
      <div class="tower-layout">
        <div class="tower-intro">
          <p class="hud-label hud-label--primary tower-kicker" data-tower-kicker data-reveal>
            <span class="status-dot" aria-hidden="true"></span>Estilista IA
          </p>
          <h2 class="heading tower-title" data-tower-title>Habla con tu estilista</h2>
          <p class="lead tower-lead" data-tower-lead>
            Nuestro estilista con IA conoce cada par del catálogo. Cuéntale a dónde vas o qué buscas y te recomienda
            el modelo ideal, con razones claras y en tu idioma.
          </p>
          <dl class="tower-readouts">
            <div class="tower-readout" data-tower-readout data-reveal>
              <dt class="hud-label">Catálogo</dt>
              <dd><span class="tower-readout__value" data-count="${modelCount}">${String(modelCount).padStart(2, '0')}</span><span class="tower-readout__unit">modelos</span></dd>
            </div>
            <div class="tower-readout" data-tower-readout data-reveal>
              <dt class="hud-label">Idiomas</dt>
              <dd><span class="tower-readout__value">ES</span><span class="tower-readout__unit">y</span><span class="tower-readout__value">EN</span></dd>
            </div>
            <div class="tower-readout" data-tower-readout data-reveal>
              <dt class="hud-label">Respuesta</dt>
              <dd><span class="tower-readout__value">En segundos</span></dd>
            </div>
          </dl>
        </div>

        <div class="tower-stage">
          <div class="tower-radar" aria-hidden="true" data-reveal>
            <svg class="tower-radar__rings" viewBox="0 0 1000 1000">
              <circle cx="500" cy="500" r="498" />
              <circle cx="500" cy="500" r="390" />
              <circle cx="500" cy="500" r="282" />
              <circle cx="500" cy="500" r="174" />
              <path d="M500 0V1000M0 500H1000" />
            </svg>
            <div class="tower-radar__sweep"></div>
          </div>

          <div class="tower-console hud-frame" data-console data-mode="idle" data-reveal>
            <header class="tower-head">
              <div class="tower-head__id" data-head-item data-reveal>
                <span class="status-dot" aria-hidden="true"></span>
                <span class="hud-label tower-head__callsign">Estilista IA</span>
              </div>
              <p class="tower-freq" data-head-item data-reveal>
                <span class="tower-freq__value mono" data-freq>En línea</span>
              </p>
              <div class="tower-wave" data-wave data-head-item data-reveal aria-hidden="true"></div>
              <p class="tower-mode" data-head-item data-reveal aria-hidden="true">
                <span class="tower-mode__rx">Tú</span><span class="tower-mode__tx">IA</span>
              </p>
              <p class="chip tower-lang" data-head-item data-reveal>${ICONS.globe}Responde en tu idioma</p>
            </header>

            <div class="tower-status">
              <span class="hud-label tower-status__label">Estado</span>
              <span class="hud-label hud-label--primary tower-status__value" data-status>Disponible</span>
              <span class="tower-ruler" data-ruler aria-hidden="true"></span>
              <span class="hud-label tower-status__tx" data-transmission>Consulta 00 · --:--</span>
            </div>

            <div class="tower-log" data-log data-lenis-prevent role="log" aria-live="off" aria-label="Conversación con tu estilista" tabindex="0">
              <div class="tower-thread" data-thread></div>
            </div>

            <div class="tower-controls" data-reveal>
              <div class="tower-routes">
                <p class="hud-label tower-routes__label" id="tower-routes-label">Prueba con</p>
                <div class="tower-chips" role="group" aria-labelledby="tower-routes-label">${chips}</div>
              </div>
              <form class="tower-form" data-form autocomplete="off">
                <label class="visually-hidden" for="tower-input">Escribe tu mensaje para el estilista</label>
                <span class="tower-form__prompt hud-label" aria-hidden="true">&gt;_</span>
                <input class="tower-input" id="tower-input" name="message" type="text" maxlength="160"
                  placeholder="Pregúntale por un estilo, una ocasión o una talla" />
                <button class="tower-send" type="submit" aria-label="Enviar mensaje">${ICONS.send}</button>
              </form>
            </div>

            <div class="visually-hidden" role="log" aria-live="polite" aria-relevant="additions" data-announcer></div>
          </div>
        </div>
      </div>
    </div>`;
}

// Barra de forma de onda: un único callback del ticker escribe scaleY en
// cada barra (solo escrituras, sin lecturas de layout). "level" sube cuando
// el estilista responde y baja a una línea casi plana en reposo.
function createWave(container, gsap, { reducedMotion }) {
  container.innerHTML = Array.from({ length: WAVE_BAR_COUNT }, () => '<span class="tower-wave__bar"></span>').join('');
  const bars = [...container.children];
  const setters = bars.map((bar) => gsap.quickSetter(bar, 'scaleY'));
  const envelope = bars.map((_, index) => Math.pow(Math.sin((Math.PI * (index + 0.5)) / WAVE_BAR_COUNT), 0.8));
  const state = { level: 0.08 };
  let elapsed = 0;
  let running = false;

  const render = () => {
    for (let index = 0; index < WAVE_BAR_COUNT; index++) {
      const noise =
        Math.abs(Math.sin(elapsed * 8.7 + index * 0.83) * Math.cos(elapsed * 3.9 + index * 0.29)) * 0.8 +
        Math.abs(Math.sin(elapsed * 15.3 + index * 1.7)) * 0.35;
      setters[index](0.06 + state.level * envelope[index] * Math.min(1, noise));
    }
  };
  const tick = (time, deltaTime) => {
    elapsed += deltaTime / 1000;
    render();
  };

  if (reducedMotion) {
    // Estado estático: una silueta de onda serena.
    bars.forEach((bar, index) => setters[index](0.12 + 0.5 * envelope[index] * Math.abs(Math.sin(index * 0.9))));
    return { speak() {}, start() {}, stop() {} };
  }

  render();
  return {
    speak(level) {
      gsap.to(state, { level, duration: level > 0.3 ? 0.5 : 0.9, ease: 'power2.out', overwrite: true });
    },
    start() {
      if (running) return;
      running = true;
      gsap.ticker.add(tick);
    },
    stop() {
      running = false;
      gsap.ticker.remove(tick);
    },
  };
}

export async function mount(root, context) {
  const { motion, hud, catalog, reducedMotion } = context;
  const { gsap, ScrollTrigger, EASE, DURATION, scrollTo } = motion;

  root.classList.add('tower-section');
  // Estado inicial de la entrada (lo aplica el CSS, solo opacidad). Con
  // movimiento reducido no hay entrada: todo se muestra desde el principio.
  if (!reducedMotion) root.dataset.motion = 'pending';
  root.innerHTML = renderSection(catalog.CATALOG.length);
  await document.fonts.ready;

  const consoleEl = root.querySelector('[data-console]');
  const log = root.querySelector('[data-log]');
  const thread = root.querySelector('[data-thread]');
  const statusEl = root.querySelector('[data-status]');
  const transmissionEl = root.querySelector('[data-transmission]');
  const announcer = root.querySelector('[data-announcer]');
  const form = root.querySelector('[data-form]');
  const input = root.querySelector('#tower-input');
  const chips = [...root.querySelectorAll('[data-scenario]')];

  hud.frameCorners(consoleEl);

  // En pantallas angostas el campo muestra un texto de ayuda más corto.
  const narrow = window.matchMedia('(max-width: 600px)');
  const syncPlaceholder = () =>
    (input.placeholder = narrow.matches ? 'Escribe tu mensaje' : 'Pregúntale por un estilo, una ocasión o una talla');
  syncPlaceholder();
  narrow.addEventListener('change', syncPlaceholder);
  const wave = createWave(root.querySelector('[data-wave]'), gsap, { reducedMotion });

  let exchange = null;
  let transmission = 0;
  let interacted = false;

  const setMode = (mode) => {
    consoleEl.dataset.mode = mode;
  };

  const setStatus = (text) => {
    gsap.killTweensOf(statusEl);
    if (reducedMotion || statusEl.textContent === text) {
      statusEl.textContent = text;
      return;
    }
    hud.scramble(statusEl, text, { duration: 0.5, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
  };

  const announce = (text) => {
    const line = document.createElement('p');
    line.textContent = text;
    announcer.append(line);
    while (announcer.children.length > 4) announcer.firstElementChild.remove();
  };

  const setPressed = (index) => {
    chips.forEach((chip, chipIndex) => chip.setAttribute('aria-pressed', String(chipIndex === index)));
  };

  // ---------- Construcción de los mensajes ----------

  function buildPilot(question, time) {
    const message = document.createElement('div');
    message.className = 'tower-msg tower-msg--pilot';
    message.innerHTML = `
      <p class="tower-msg__meta hud-label"><span>Tú</span><span aria-hidden="true">·</span><time>${time}</time><span class="tower-msg__sent" data-sent>Enviado</span></p>
      <p class="tower-bubble"><span data-typed></span><span class="tower-caret" data-caret aria-hidden="true"></span></p>`;
    const typed = message.querySelector('[data-typed]');
    typed.textContent = question;
    return { message, typed, caret: message.querySelector('[data-caret]'), sent: message.querySelector('[data-sent]') };
  }

  function buildTower(answer, time) {
    const message = document.createElement('div');
    message.className = 'tower-msg tower-msg--tower';
    message.innerHTML = `
      <p class="tower-msg__meta hud-label"><span class="tower-msg__callsign">Estilista</span><span aria-hidden="true">·</span><time>${time}</time></p>
      <div class="tower-reply">
        <span class="tower-thinking" data-thinking aria-hidden="true"><i></i><i></i><i></i></span>
        <p class="tower-reply__text" data-reply></p>
      </div>`;
    const reply = message.querySelector('[data-reply]');
    const words = tokenize(answer).map((token) => {
      if (token.space) reply.append(' ');
      const word = document.createElement('span');
      word.className = token.highlight ? 'tower-word tower-word--hl' : 'tower-word';
      word.textContent = token.word;
      reply.append(word);
      return { element: word, text: token.word };
    });
    return { message, words, thinking: message.querySelector('[data-thinking]') };
  }

  function buildRecommendations(picks) {
    const list = document.createElement('div');
    list.className = 'tower-recs';
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Recomendaciones del estilista');
    list.innerHTML = picks
      .map((pick, index) => {
        const product = catalog.findProduct(pick.slug);
        return `
          <article class="tower-card" role="listitem">
            <header class="tower-card__head">
              <span class="hud-label">Recomendación ${index + 1}<span class="tower-card__brand"> · ${product.brand}</span></span>
              <span class="hud-label hud-label--primary tower-card__match">Coincide <span data-match="${pick.match}">${pick.match}</span>%</span>
            </header>
            <span class="tower-card__meter" aria-hidden="true"><span class="tower-card__meter-fill" style="transform: scaleX(${pick.match / 100})"></span></span>
            <div class="tower-card__body">
              <h3 class="tower-card__name">${product.name}</h3>
              <p class="tower-card__reason">${pick.reason}</p>
            </div>
            <ul class="tower-card__tags" aria-label="Etiquetas">${product.tags.map((tag) => `<li>${tag}</li>`).join('')}</ul>
            <footer class="tower-card__foot">
              <span class="tower-card__price mono">${catalog.formatPrice(product.price)}</span>
              <a class="tower-card__link" href="#catalogo" data-select-product="${product.slug}">Ver en 3D<span class="visually-hidden">: ${product.name}</span>${ICONS.arrow}</a>
            </footer>
          </article>`;
      })
      .join('');
    return list;
  }

  const summary = (picks) =>
    picks
      .map((pick) => {
        const product = catalog.findProduct(pick.slug);
        return `${product.name}, ${catalog.formatPrice(product.price)}`;
      })
      .join('; ');

  // ---------- Reproducción de un intercambio ----------

  // Interrumpe lo que esté sonando y reproduce un intercambio nuevo.
  // typed: false cuando el mensaje lo escribió el visitante (aparece entero).
  function play({ question, answer, picks = [], typed = true }) {
    exchange?.kill();
    transmission += 1;
    const time = clock();
    const stamp = `Consulta ${pad(transmission)} · ${time}`;
    const pilot = buildPilot(question, time);
    const tower = buildTower(answer, time);
    const recs = picks.length ? buildRecommendations(picks) : null;
    const finalAnnouncement = `Estilista: ${plainText(answer)}${picks.length ? ` Recomendaciones: ${summary(picks)}.` : ''}`;

    if (reducedMotion) {
      pilot.caret.remove();
      tower.thinking.remove();
      thread.replaceChildren(...[pilot.message, tower.message, recs].filter(Boolean));
      transmissionEl.textContent = stamp;
      log.scrollTop = 0;
      setMode('idle');
      setStatus('Disponible');
      announce(`Tú: ${question}`);
      announce(finalAnnouncement);
      return;
    }

    const random = createRandom(question.length * 7919 + transmission);
    // Ojo: los tweens de elementos que aún están ocultos o fuera del DOM usan
    // immediateRender: false. Si GSAP los midiera ocultos, los reinsertaría
    // de forma temporal y movería los espacios entre palabras.
    const timeline = gsap.timeline({ defaults: { ease: EASE.out } });
    exchange = timeline;

    // 1. Despeja la consulta anterior.
    const previous = [...thread.children];
    gsap.killTweensOf(previous);
    if (previous.length) {
      timeline.to(previous, { opacity: 0, y: -14, duration: 0.32, ease: 'power2.in', stagger: 0.04 });
    }
    wave.speak(0.08);
    pilot.typed.textContent = typed ? '' : question;
    pilot.sent.hidden = true;
    // Las palabras esperan ocultas (sin ocupar espacio) hasta su turno en el streaming.
    tower.words.forEach((word) => (word.element.style.display = 'none'));
    tower.message.hidden = true;
    if (recs) recs.hidden = true;

    timeline.call(() => {
      thread.replaceChildren(pilot.message, tower.message, ...(recs ? [recs] : []));
      log.scrollTop = 0;
      gsap.killTweensOf(transmissionEl);
      hud.scramble(transmissionEl, stamp, { duration: 0.6, chars: '0123456789' });
      setMode('rx');
      setStatus(typed ? 'Escuchando' : 'Leyendo');
    });
    timeline.from(pilot.message, { opacity: 0, y: 16, duration: 0.6, immediateRender: false });

    // 2. El visitante escribe letra por letra con un ritmo irregular.
    if (typed) {
      timeline.addLabel('typing', '+=0.15');
      let offset = 0;
      for (let index = 1; index <= question.length; index++) {
        const character = question[index - 1];
        offset += 0.022 + random() * 0.03 + (character === ' ' ? 0.02 : 0) + (/[,.]/.test(character) ? 0.12 : 0);
        timeline.call(() => (pilot.typed.textContent = question.slice(0, index)), null, `typing+=${offset}`);
      }
      timeline.addLabel('sent', `typing+=${offset + 0.25}`);
    } else {
      timeline.addLabel('sent', '+=0.1');
    }
    timeline.call(
      () => {
        pilot.caret.remove();
        pilot.sent.hidden = false;
        announce(`Tú: ${question}`);
      },
      null,
      'sent',
    );
    timeline.from(pilot.sent, { opacity: 0, x: -6, duration: 0.4, immediateRender: false }, 'sent');

    // 3. El estilista "piensa" y luego responde en streaming.
    timeline.addLabel('reply', 'sent+=0.35');
    timeline.call(
      () => {
        tower.message.hidden = false;
        setMode('tx');
        setStatus('Respondiendo');
        wave.speak(1);
      },
      null,
      'reply',
    );
    timeline.from(tower.message, { opacity: 0, y: 16, duration: 0.6, immediateRender: false }, 'reply');
    timeline.call(() => tower.thinking.remove(), null, 'reply+=0.85');
    timeline.addLabel('stream', 'reply+=0.85');

    let offset = 0;
    for (const word of tower.words) {
      timeline.set(word.element, { display: 'inline-block' }, `stream+=${offset}`);
      timeline.fromTo(
        word.element,
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0, duration: 0.5, clearProps: 'transform', immediateRender: false },
        `stream+=${offset}`,
      );
      const last = word.text.at(-1);
      offset += 0.032 + random() * 0.04 + (last === ',' || last === ':' ? 0.12 : 0) + (last === '.' ? 0.26 : 0);
    }
    timeline.addLabel('done', `stream+=${offset + 0.2}`);
    timeline.call(
      () => {
        wave.speak(0.08);
        announce(finalAnnouncement);
        if (!recs) {
          setMode('idle');
          setStatus('Disponible');
        }
      },
      null,
      'done',
    );

    // 4. Tarjetas de recomendación: entran, el medidor de ajuste se llena y cuenta.
    if (recs) {
      const cards = [...recs.children];
      timeline.call(() => (recs.hidden = false), null, 'done');
      timeline.from(cards, { opacity: 0, y: 26, duration: 0.9, stagger: 0.12, immediateRender: false }, 'done');
      recs.querySelectorAll('.tower-card__meter-fill').forEach((fill, index) => {
        timeline.fromTo(
          fill,
          { scaleX: 0 },
          { scaleX: picks[index].match / 100, duration: 1.4, ease: EASE.inOut, immediateRender: false },
          `done+=${index * 0.12}`,
        );
      });
      recs.querySelectorAll('[data-match]').forEach((element, index) => {
        const counter = hud.countTo(element, Number(element.dataset.match), { duration: 1.2 });
        if (counter) timeline.add(counter, `done+=${0.2 + index * 0.12}`);
      });
      timeline.call(
        () => {
          setMode('idle');
          setStatus('Disponible');
        },
        null,
        '>',
      );
    }
  }

  const playScenario = (index) => {
    setPressed(index);
    play(SCENARIOS[index]);
  };

  // ---------- Interacción ----------

  chips.forEach((chip, index) =>
    chip.addEventListener('click', () => {
      interacted = true;
      playScenario(index);
    }),
  );

  input.addEventListener('focus', () => (interacted = true));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) {
      input.focus();
      return;
    }
    interacted = true;
    input.value = '';
    setPressed(-1);
    play({ question, answer: FREE_REPLY, typed: false });
  });

  // "Ver en 3D": avisa al catálogo qué par mostrar y desplaza hasta allí.
  root.addEventListener('click', (event) => {
    const link = event.target.closest('[data-select-product]');
    if (!link) return;
    event.preventDefault();
    document.dispatchEvent(new CustomEvent('airspace:select-product', { detail: { slug: link.dataset.selectProduct } }));
    scrollTo('#catalogo');
  });

  // ---------- Movimiento de entrada ----------

  if (reducedMotion) {
    playScenario(0);
    return;
  }

  // Los bucles solo corren mientras la sección está en pantalla.
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => {
      // Los bucles (onda en el ticker, radar y cursores en CSS) se pausan fuera de pantalla.
      root.classList.toggle('is-live', self.isActive);
      if (self.isActive) wave.start();
      else wave.stop();
    },
  });

  const show = (targets, from = {}, to = {}) => [targets, { opacity: 0, ...from }, { opacity: 1, ...to }];
  const intro = gsap.timeline({
    paused: true,
    defaults: { ease: EASE.out, duration: DURATION.reveal },
    onComplete: () => (root.dataset.motion = 'done'),
  });
  intro
    .fromTo(...show(root.querySelector('[data-tower-kicker]'), { x: -16 }, { x: 0 }), 0)
    .add(hud.revealText(root.querySelector('[data-tower-title]'), { stagger: 0.09, duration: 1.1 }), 0.05)
    .add(hud.revealText(root.querySelector('[data-tower-lead]'), { stagger: 0.05 }), 0.3)
    .fromTo(...show(root.querySelectorAll('[data-tower-readout]'), { y: 14 }, { y: 0, stagger: 0.08 }), 0.5)
    .fromTo(...show(consoleEl, { y: 56 }, { y: 0, duration: DURATION.cinematic }), 0.1)
    .fromTo(...show(root.querySelector('.tower-radar'), { scale: 0.85 }, { scale: 1, duration: DURATION.cinematic }), 0)
    .fromTo(...show(root.querySelectorAll('[data-head-item]'), { y: 10 }, { y: 0, duration: 0.6, stagger: 0.07 }), 0.55)
    .from(root.querySelector('[data-ruler]'), { scaleX: 0, transformOrigin: '0% 50%', duration: 1.2, ease: EASE.inOut }, 0.6)
    .fromTo(...show(root.querySelector('.tower-controls'), { y: 12 }, { y: 0, duration: 0.7 }), 0.8);

  const rings = hud.drawLines(root.querySelectorAll('.tower-radar__rings circle, .tower-radar__rings path'), {
    duration: 1.8,
    stagger: 0.1,
  });
  if (rings) intro.add(rings, 0.1);
  const freq = hud.scramble(root.querySelector('[data-freq]'), 'En línea', { duration: 0.9, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
  if (freq) intro.add(freq, 0.7);
  // Contador del catálogo con dos dígitos, como un instrumento ("05").
  const counter = root.querySelector('[data-count]');
  const counterState = { value: 0 };
  intro.to(
    counterState,
    {
      value: Number(counter.dataset.count),
      duration: 1,
      ease: 'power2.out',
      onStart: () => (counter.textContent = '00'),
      onUpdate: () => (counter.textContent = pad(Math.round(counterState.value))),
    },
    0.6,
  );

  // El guion arranca solo, salvo que el visitante ya haya tocado la consola.
  intro.call(() => {
    if (!interacted) playScenario(0);
  }, null, 1.15);

  ScrollTrigger.create({
    trigger: consoleEl,
    start: 'top 78%',
    once: true,
    onEnter: () => intro.play(),
  });

  // Si el foco del teclado llega antes que el scroll, la entrada se completa
  // al instante. Si el foco cae en las ideas o en el campo, el guion
  // automático no arranca para no pisar lo que la persona va a hacer.
  root.addEventListener('focusin', (event) => {
    if (intro.progress() === 1) return;
    if (event.target.closest('[data-scenario], [data-form]')) interacted = true;
    intro.progress(1);
  });
}
