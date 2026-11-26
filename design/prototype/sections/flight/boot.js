// Carga inicial ("boot"): radar, marca y lista de carga de la colección
// mientras llega el modelo 3D. Se muestra una vez por sesión y sale
// abriéndose en dos paneles hacia la portada.
//
// Se monta en <body> y no dentro de la sección: <main> forma su propio
// contexto de apilamiento y el encabezado fijo quedaría por encima.

import { BOOT_CHECKS, BOOT_COPY } from './content.js';

const BOOT_KEY = 'airspace-boot-seen';
const MIN_HOLD = 1.8; // segundos mínimos de secuencia antes de salir
const SWEEP_PERIOD = 2.4; // segundos por vuelta del barrido del radar

// Ecos del radar: [ángulo en grados desde arriba, en sentido horario, radio].
const BLIPS = [
  [52, 62],
  [158, 36],
  [292, 80],
];

// Se salta con movimiento reducido, en enlaces profundos (#ancla), con ?noboot
// o si ya se vio en esta sesión.
export function shouldPlayBoot(reducedMotion) {
  if (reducedMotion) return false;
  // Enlace profundo: el <head> quita el ancla de la URL y la deja en data-deep-link.
  if (location.hash || document.documentElement.dataset.deepLink) return false;
  if (new URLSearchParams(location.search).has('noboot')) return false;
  try {
    return sessionStorage.getItem(BOOT_KEY) === null;
  } catch {
    return true;
  }
}

function polar(angle, radius) {
  const radians = (angle * Math.PI) / 180;
  return [radius * Math.sin(radians), -radius * Math.cos(radians)];
}

function radarMarkup() {
  const rings = [96, 72, 48, 24].map((r) => `<circle class="flight-boot__ring" r="${r}" />`).join('');
  let ticks = '';
  for (let angle = 0; angle < 360; angle += 5) {
    const inner = angle % 30 === 0 ? 86 : 91;
    const [x1, y1] = polar(angle, inner);
    const [x2, y2] = polar(angle, 96);
    ticks += `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  const blips = BLIPS.map(([angle, radius]) => {
    const [x, y] = polar(angle, radius);
    return `<circle class="flight-boot__blip" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.6" />`;
  }).join('');
  return `
    <svg class="flight-boot__radar-svg" viewBox="-100 -100 200 200" aria-hidden="true">
      ${rings}
      <path class="flight-boot__axis" d="M-96 0H96M0 -96V96" />
      <path class="flight-boot__ticks" d="${ticks}" />
      ${blips}
      <circle class="flight-boot__core" r="2" />
    </svg>`;
}

function markup(productName) {
  const checks = BOOT_CHECKS.map(
    (name) => `
      <li class="flight-boot__check">
        <span class="flight-boot__check-name" data-name="${name}">${name}</span>
        <span class="flight-boot__check-leader"></span>
        <span class="flight-boot__check-state">OK</span>
      </li>`,
  ).join('');
  return `
    <div class="flight-boot__panel flight-boot__panel--top"><span class="flight-boot__edge"></span></div>
    <div class="flight-boot__panel flight-boot__panel--bottom"><span class="flight-boot__edge"></span></div>
    <span class="flight-boot__seam"></span>
    <div class="flight-boot__body">
      <p class="flight-boot__corner flight-boot__corner--tl hud-label">${BOOT_COPY.title}</p>
      <p class="flight-boot__corner flight-boot__corner--tr hud-label">${BOOT_COPY.season}</p>
      <p class="flight-boot__corner flight-boot__corner--bl hud-label"><span class="mono" data-boot-clock>00.0</span> s</p>
      <p class="flight-boot__corner flight-boot__corner--br hud-label">${BOOT_COPY.view}</p>
      <div class="flight-boot__center">
        <div class="flight-boot__radar">
          ${radarMarkup()}
          <span class="flight-boot__sweep"></span>
        </div>
        <p class="flight-boot__mark"><span class="flight-boot__mark-air">AIRSPACE</span><span class="flight-boot__mark-wear">Wear</span></p>
        <ol class="flight-boot__checks">
          ${checks}
          <li class="flight-boot__check flight-boot__check--model">
            <span class="flight-boot__check-name" data-name="${productName}">${productName}</span>
            <span class="flight-boot__check-leader"></span>
            <span class="flight-boot__check-state mono" data-boot-percent>000%</span>
          </li>
        </ol>
      </div>
      <div class="flight-boot__progress"><span class="flight-boot__progress-fill"></span></div>
    </div>`;
}

/**
 * Reproduce la secuencia. Devuelve una promesa que se resuelve al retirar el overlay.
 * @param {object} options
 * @param {object} options.motion contexto de movimiento (gsap, EASE, setScrollLocked...)
 * @param {object} options.hud utilidades HUD
 * @param {object} options.stage escenario 3D (onProgress y ready)
 * @param {string} options.productName nombre del modelo que se carga
 * @param {() => void} options.onReveal se llama cuando los paneles empiezan a abrirse
 */
export function runBoot({ motion, hud, stage, productName, onReveal }) {
  const { gsap, EASE, DURATION, setScrollLocked, lenis } = motion;
  try {
    sessionStorage.setItem(BOOT_KEY, '1');
  } catch {
    // Sin almacenamiento de sesión: la secuencia se verá en cada carga.
  }

  const overlay = document.createElement('div');
  overlay.className = 'flight-boot';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = markup(productName);
  document.body.append(overlay);

  // Arranca siempre desde arriba y sin scroll mientras corre.
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else window.scrollTo(0, 0);
  setScrollLocked(true);

  // Mientras la intro tapa la página, el teclado no debe llegar a los enlaces
  // de atrás: el resto de la página queda inerte hasta que se abre.
  const behind = [...document.querySelectorAll('body > header, body > main, body > footer, body > .skip-link')];
  behind.forEach((element) => (element.inert = true));
  const release = () => behind.forEach((element) => (element.inert = false));

  const $ = (selector) => overlay.querySelector(selector);
  const $$ = (selector) => [...overlay.querySelectorAll(selector)];
  const body = $('.flight-boot__body');
  const percentText = $('[data-boot-percent]');
  const progressFill = $('.flight-boot__progress-fill');
  const clock = $('[data-boot-clock]');
  const startTime = gsap.ticker.time;

  // Reloj de la esquina: solo escribe si cambia el texto.
  let lastClock = '';
  const tickClock = () => {
    const text = (gsap.ticker.time - startTime).toFixed(1).padStart(4, '0');
    if (text !== lastClock) clock.textContent = lastClock = text;
  };
  gsap.ticker.add(tickClock);

  // Progreso real de carga, suavizado para que no salte.
  const shown = { value: 0 };
  const renderProgress = () => {
    progressFill.style.transform = `scaleX(${shown.value})`;
    percentText.textContent = `${String(Math.round(shown.value * 100)).padStart(3, '0')}%`;
  };
  const stopProgress = stage.onProgress((value) => {
    gsap.to(shown, { value, duration: 0.45, ease: 'power2.out', overwrite: true, onUpdate: renderProgress });
  });

  // Barrido continuo del radar y puntos que se encienden cuando el haz los cruza.
  const sweep = gsap.to($('.flight-boot__sweep'), { rotation: 360, duration: SWEEP_PERIOD, ease: 'none', repeat: -1 });
  const blipTweens = $$('.flight-boot__blip').map((blip, index) =>
    gsap.fromTo(
      blip,
      { opacity: 1, scale: 1.6, transformOrigin: '50% 50%' },
      { opacity: 0.12, scale: 1, duration: SWEEP_PERIOD * 0.85, ease: 'power2.out', repeat: -1, repeatDelay: SWEEP_PERIOD * 0.15, delay: (BLIPS[index][0] / 360) * SWEEP_PERIOD },
    ),
  );

  const checks = $$('.flight-boot__check');
  const intro = gsap.timeline();
  intro
    .from($$('.flight-boot__corner'), { opacity: 0, duration: DURATION.reveal, stagger: 0.06 }, 0)
    .from($$('.flight-boot__ring, .flight-boot__axis'), { drawSVG: 0, duration: 1, ease: EASE.inOut, stagger: 0.07 }, 0)
    .from($('.flight-boot__ticks'), { drawSVG: 0, duration: 1.2, ease: EASE.inOut }, 0.1)
    .from($('.flight-boot__sweep'), { opacity: 0, duration: 0.6 }, 0.35)
    .from($('.flight-boot__progress'), { scaleX: 0, transformOrigin: '0% 50%', duration: 1.2, ease: EASE.inOut }, 0);

  hud.revealText($('.flight-boot__mark-air'), { type: 'chars', stagger: 0.035, delay: 0.2, duration: DURATION.reveal });
  intro.from($('.flight-boot__mark-wear'), { opacity: 0, x: -8, duration: DURATION.reveal }, 0.55);

  checks.forEach((check, index) => {
    const at = 0.55 + index * 0.3;
    const name = check.querySelector('.flight-boot__check-name');
    intro
      .from(check, { opacity: 0, duration: 0.2 }, at)
      .add(() => hud.scramble(name, name.dataset.name, { duration: 0.45 }), at)
      .from(check.querySelector('.flight-boot__check-leader'), { scaleX: 0, transformOrigin: '0% 50%', duration: 0.35, ease: EASE.out }, at + 0.15);
    if (!check.classList.contains('flight-boot__check--model')) {
      intro.from(check.querySelector('.flight-boot__check-state'), { opacity: 0, duration: 0.15 }, at + 0.42);
    }
  });
  intro.to({}, { duration: Math.max(0, MIN_HOLD - intro.duration()) });

  const held = new Promise((resolve) => intro.eventCallback('onComplete', resolve));
  const loaded = stage.ready.catch(() => null);

  return Promise.all([held, loaded]).then(
    () =>
      new Promise((resolve) => {
        stopProgress();
        const modelState = percentText;
        const exit = gsap.timeline({
          onComplete: () => {
            gsap.ticker.remove(tickClock);
            sweep.kill();
            blipTweens.forEach((tween) => tween.kill());
            overlay.remove();
            resolve();
          },
        });
        exit
          // Completa la barra si la carga terminó antes de que se viera llegar.
          .to(shown, { value: 1, duration: 0.25, ease: 'power2.out', overwrite: true, onUpdate: renderProgress })
          .add(() => {
            modelState.classList.add('is-ok');
            hud.scramble(modelState, 'OK', { duration: 0.25 });
          })
          .to(body, { opacity: 0, scale: 0.985, duration: 0.36, ease: 'power2.in' }, '+=0.22')
          .fromTo($('.flight-boot__seam'), { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: EASE.inOut }, '<0.05')
          .set($('.flight-boot__seam'), { opacity: 0 })
          .set($$('.flight-boot__edge'), { opacity: 1 }, '<')
          .add(() => {
            setScrollLocked(false);
            release();
            onReveal?.();
          }, '<')
          .to($('.flight-boot__panel--top'), { yPercent: -101, duration: 1, ease: EASE.inOut }, '<')
          .to($('.flight-boot__panel--bottom'), { yPercent: 101, duration: 1, ease: EASE.inOut }, '<');
      }),
  );
}
