// Rig 3D de la sección: UN solo canvas que vive en una de dos "bases":
//   - board:  la ventana de vista 3D del tablero (.dep-slot)
//   - hangar: la plataforma giratoria del hangar (.hangar-stage)
// El canvas se mueve de una base a otra en el DOM (conserva su contexto
// WebGL) y una transición por tiempo lleva la cámara a la pose nueva. Nada
// depende de la posición del scroll: cada base se desplaza de forma nativa.
//
// El zapato siempre está en el origen del mundo; la cámara orbita a su
// alrededor y un desplazamiento de lente (camera.setViewOffset) lo ubica en el
// punto del canvas que marca la pose.
//
// Rendimiento: el canvas mide lo mismo que su base (no la pantalla completa),
// solo dibuja con su base a la vista (IntersectionObserver) y el DOM recibe
// únicamente transform y opacity.

import { LIGHT_PRESETS } from '../../core/stage.js';

const FLOOR_Y = -0.085; // piso del mundo (m): la suela de todos los modelos se apoya aquí
const SHOE = { length: 0.3, height: 0.18 };
const AUTO_SPEED = (Math.PI * 2) / 28; // giro automático: una vuelta cada 28 s
const RESUME_DELAY = 1.6; // s sin interacción antes de retomar el giro automático
const RING_HALF_MM = 300; // el SVG de anillos mide 600 x 600 mm del mundo

// Pose de cámara por base, en píxeles del canvas y grados.
const POSES = {
  board: (width, height) => ({
    ax: width / 2,
    ay: height * 0.53,
    k: Math.min((width * 0.72) / SHOE.length, (height * 0.62) / SHOE.height),
    elevation: 6,
    lift: 0,
    hangar: 0,
  }),
  hangar: (width, height) => ({
    ax: width / 2,
    ay: height * 0.46,
    k: Math.min((width * 0.54) / SHOE.length, (height * 0.42) / SHOE.height),
    elevation: 15,
    lift: 0,
    hangar: 1,
  }),
};

const mix = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// Escribe un transform solo si cambió (evita invalidar estilos en cada cuadro).
const lastTransform = new WeakMap();
function setTransform(element, value) {
  if (lastTransform.get(element) === value) return;
  lastTransform.set(element, value);
  element.style.transform = value;
}

/**
 * @param {object} options
 * @param {object} options.stage escenario de createStage()
 * @param {object} options.motion contexto de movimiento (gsap, EASE, DURATION)
 * @param {object} options.hosts { board, hangar }: elementos que alojan el canvas
 * @param {object} options.hangarParts { rings, ticks, scan } piezas de la plataforma
 * @param {function} [options.onLoading] (estado, slug) con estado 'loading' | 'idle' | 'error'
 * @param {function} [options.onRotate] (ángulo en radianes) mientras el hangar está activo
 */
export function createRig({ stage, motion, catalog, reducedMotion, theme, canvas, hosts, hangarParts, onLoading, onRotate }) {
  const { gsap, EASE, DURATION } = motion;
  const { THREE, camera, sneaker, lights } = stage;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const footBySlug = Object.fromEntries(catalog.CATALOG.map((product) => [product.slug, product.foot]));

  sneaker.rotation.order = 'YXZ';
  stage.groundY = FLOOR_Y;

  // ---------- Bases y tamaños ----------

  const sizes = { board: { width: 0, height: 0 }, hangar: { width: 0, height: 0 } };
  const visible = { board: false, hangar: false };
  let host = 'board';
  const cam = POSES.board(1, 1);
  let live = false;

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const name = entry.target === hosts.board ? 'board' : 'hangar';
      sizes[name] = { width: entry.contentRect.width, height: entry.contentRect.height };
      // Sin transición en curso, la pose sigue al tamaño nuevo.
      if (name === host && !gsap.isTweening(cam)) Object.assign(cam, POSES[host](sizes[name].width, sizes[name].height));
      if (name === 'hangar') layoutHangar();
    }
  });
  resizeObserver.observe(hosts.board);
  resizeObserver.observe(hosts.hangar);

  // Solo se dibuja si la base que tiene el canvas está a la vista.
  const intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) visible[entry.target === hosts.board ? 'board' : 'hangar'] = entry.isIntersecting;
      updateLive();
    },
    { rootMargin: '0px' },
  );
  intersection.observe(hosts.board);
  intersection.observe(hosts.hangar);

  const liveListeners = new Set();
  function updateLive() {
    const next = visible[host];
    if (next === live) return;
    live = next;
    // El rig va antes del dibujo en el ticker: mueve la cámara y luego se dibuja.
    if (live) {
      gsap.ticker.add(frame);
      stage.setRendering(true);
    } else {
      gsap.ticker.remove(frame);
      stage.setRendering(false);
    }
    for (const listener of liveListeners) listener({ host, live });
  }

  // ---------- Anillos y escáner del hangar ----------

  // Los anillos SVG se proyectan con una transformación CSS 3D que replica la
  // cámara de three.js: su piso coincide con el del zapato. Sin canvas en el
  // hangar se dibujan en la pose de reposo (plataforma esperando el modelo).
  function ringTransform(pose, size) {
    const focal = size.height / 2 / tanHalf;
    const elevation = THREE.MathUtils.degToRad(pose.elevation);
    const offsetY = -pose.k * FLOOR_Y * Math.cos(elevation);
    const offsetZ = pose.k * FLOOR_Y * Math.sin(elevation);
    const tilt = 90 - pose.elevation;
    const scale = pose.k / baseK;
    return (
      `translate(${pose.ax.toFixed(1)}px, ${pose.ay.toFixed(1)}px) perspective(${focal.toFixed(1)}px) ` +
      `translate3d(0, ${offsetY.toFixed(2)}px, ${offsetZ.toFixed(2)}px) rotateX(${tilt.toFixed(3)}deg) scale(${scale.toFixed(4)})`
    );
  }

  let baseK = 1;
  function layoutHangar() {
    const size = sizes.hangar;
    if (!size.width || !size.height) return;
    const pose = POSES.hangar(size.width, size.height);
    baseK = pose.k;
    // Tamaño base en la pose de reposo: la escala por cuadro queda cerca de 1.
    const ringSize = ((RING_HALF_MM * 2) / 1000) * pose.k;
    Object.assign(hangarParts.rings.style, {
      width: `${ringSize}px`,
      height: `${ringSize}px`,
      left: `${-ringSize / 2}px`,
      top: `${-ringSize / 2}px`,
    });
    // Escáner: cubre el volumen del zapato sobre la plataforma.
    const focal = size.height / 2 / tanHalf;
    const elevation = THREE.MathUtils.degToRad(pose.elevation);
    const distance = focal / pose.k;
    const worldY = FLOOR_Y + 0.118;
    const centerY = pose.ay - (focal * worldY * Math.cos(elevation)) / (distance - worldY * Math.sin(elevation));
    const scanWidth = 0.46 * pose.k;
    const scanHeight = 0.24 * pose.k;
    Object.assign(hangarParts.scan.style, {
      width: `${scanWidth}px`,
      height: `${scanHeight}px`,
      left: `${pose.ax - scanWidth / 2}px`,
      top: `${centerY - scanHeight / 2}px`,
    });
    setTransform(hangarParts.rings, ringTransform(host === 'hangar' ? cam : pose, size));
  }

  // ---------- Giro: arrastre con inercia en ambas bases; automático y teclado en el hangar ----------

  const spin = { angle: 0 };
  let velocity = 0;
  let dragging = false;
  let resumeAt = 0;
  let keyTween = null;
  let lastTicks = '';

  function stepSpin(time, dt) {
    if (dragging || keyTween?.isActive()) return;
    const resumed = time >= resumeAt;
    // Giro automático solo en el hangar (y nunca con movimiento reducido).
    const target = resumed && host === 'hangar' && !reducedMotion ? AUTO_SPEED : 0;
    // Antes de retomar: la inercia del arrastre se apaga. Después: rampa suave.
    const rate = resumed ? 0.8 : 2.4;
    velocity += (target - velocity) * (1 - Math.exp(-dt * rate));
    spin.angle += velocity * dt;
  }

  // Arrastre: funciona en la base que tiene el canvas (vista 3D o plataforma).
  const drag = { x: 0, t: 0, sample: 0, pointer: null, element: null };
  function bindDrag(element, name) {
    element.addEventListener('pointerdown', (event) => {
      if (host !== name || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (event.target.closest('a, button')) return;
      dragging = true;
      keyTween?.kill();
      Object.assign(drag, { x: event.clientX, t: performance.now(), sample: 0, pointer: event.pointerId, element });
      element.setPointerCapture(event.pointerId);
      element.classList.add('is-dragging');
    });
    element.addEventListener('pointermove', (event) => {
      if (!dragging || drag.element !== element || event.pointerId !== drag.pointer) return;
      const now = performance.now();
      const radiansPerPixel = TAU / Math.max(320, sizes[name].width * 1.2);
      const delta = (event.clientX - drag.x) * radiansPerPixel;
      spin.angle += delta;
      const instant = delta / Math.max(0.008, (now - drag.t) / 1000);
      drag.sample = drag.sample * 0.6 + instant * 0.4;
      drag.x = event.clientX;
      drag.t = now;
    });
    const release = (event) => {
      if (!dragging || drag.element !== element || event.pointerId !== drag.pointer) return;
      dragging = false;
      element.classList.remove('is-dragging');
      // Si el dedo se quedó quieto antes de soltar, no hay inercia.
      const idle = performance.now() - drag.t > 90;
      velocity = reducedMotion || idle ? 0 : Math.max(-7, Math.min(7, drag.sample));
      resumeAt = gsap.ticker.time + RESUME_DELAY;
    };
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
  }
  bindDrag(hosts.board, 'board');
  bindDrag(hosts.hangar, 'hangar');

  // Flechas: pasos de 15°. Inicio: vuelve a 000°.
  hosts.hangar.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    if (!step && event.key !== 'Home') return;
    event.preventDefault();
    velocity = 0;
    resumeAt = gsap.ticker.time + RESUME_DELAY * 2;
    const target = event.key === 'Home' ? Math.round(spin.angle / TAU) * TAU : spin.angle + (step * Math.PI) / 12;
    keyTween?.kill();
    keyTween = gsap.to(spin, { angle: target, duration: reducedMotion ? 0 : 0.45, ease: EASE.out });
    if (!live) onRotate?.(spin.angle);
  });

  // ---------- Cuadro ----------

  let lastActive = null;
  let baseYaw = 0;
  const yawFor = (slug) => (footBySlug[slug] === 'right' ? -0.42 : Math.PI + 0.42);
  const heightOf = (slug) => {
    const model = stage.model(slug);
    // createStage centra cada modelo bajando su escena la mitad de su alto.
    return model ? -2 * model.children[0].position.y : 0.15;
  };

  function frame(time, deltaMs) {
    const size = sizes[host];
    if (!size.width || !size.height) return;
    const dt = Math.min(0.05, (deltaMs || 16) / 1000);

    const focal = size.height / 2 / tanHalf;
    const distance = focal / cam.k;
    const elevation = THREE.MathUtils.degToRad(cam.elevation);
    camera.position.set(0, distance * Math.sin(elevation), distance * Math.cos(elevation));
    camera.setViewOffset(size.width, size.height, size.width / 2 - cam.ax, size.height / 2 - cam.ay, size.width, size.height);

    stepSpin(time, dt);

    // Al cambiar de modelo (a mitad de swapModel, cuando mide casi 0) se
    // actualizan orientación y altura sin que se note.
    const active = stage.active;
    if (active !== lastActive) {
      lastActive = active;
      baseYaw = yawFor(active);
    }
    const idle = reducedMotion ? 0 : 1;
    // En la vista 3D: vaivén suave más lo que el usuario haya girado.
    const boardYaw = baseYaw + spin.angle + idle * Math.sin(time * 0.42) * 0.34;
    const hangarYaw = baseYaw + spin.angle;
    sneaker.rotation.y = mix(boardYaw, hangarYaw, cam.hangar);
    sneaker.position.y = FLOOR_Y + heightOf(active) / 2 + cam.lift + idle * Math.sin(time * 1.1) * 0.004 * (1 - cam.hangar);

    // Luces: el preset del tema (core/stage.js) es la base. En el hangar baja
    // un poco la principal y sube el contorno; en claro el contraluz lima casi
    // se apaga, porque sobre crema teñiría el cuero negro.
    const themeName = theme?.get() === 'light' ? 'light' : 'dark';
    const preset = LIGHT_PRESETS[themeName];
    const e = cam.hangar;
    lights.key.intensity = preset.key * mix(1, 0.9, e);
    lights.fill.intensity = preset.fill * mix(1, 0.85, e);
    lights.rim.intensity = preset.rim * mix(themeName === 'light' ? 0.7 : 1, themeName === 'light' ? 0.2 : 0.85, e);
    lights.kicker.intensity = preset.kicker * mix(1, 1.12, e);

    if (host === 'hangar') {
      setTransform(hangarParts.rings, ringTransform(cam, size));
      const ticks = `rotate(${((-spin.angle * 180) / Math.PI).toFixed(2)})`;
      if (ticks !== lastTicks) {
        lastTicks = ticks;
        hangarParts.ticks.setAttribute('transform', ticks);
      }
      onRotate?.(spin.angle);
    }
  }

  // ---------- Cambio de base (transición por tiempo, sin scroll) ----------

  function attach(name, { animate = true } = {}) {
    if (name === host && canvas.parentElement === hosts[name]) return;
    host = name;
    // El canvas va debajo del escáner y de los rótulos de la base.
    const anchor = hosts[name].querySelector('[data-canvas-anchor]');
    hosts[name].insertBefore(canvas, anchor);
    const size = sizes[name];
    const target = POSES[name](size.width || 1, size.height || 1);
    gsap.killTweensOf([cam, canvas, hangarParts.scan]);
    // El escáner solo aparece con el zapato ya posado en la plataforma.
    gsap.set(hangarParts.scan, { opacity: 0 });
    if (!animate || reducedMotion) {
      Object.assign(cam, target);
      gsap.set(canvas, { clearProps: 'opacity' });
      if (name === 'hangar') gsap.set(hangarParts.scan, { opacity: 1 });
    } else if (name === 'hangar') {
      // Aterrizaje: el zapato baja sobre la plataforma mientras la cámara sube.
      Object.assign(cam, { ...target, k: target.k * 0.74, elevation: 4, lift: 0.07, hangar: 0 });
      gsap.to(cam, { ...target, duration: DURATION.cinematic, ease: EASE.inOut });
      gsap.fromTo(canvas, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none', clearProps: 'opacity' });
      gsap.to(hangarParts.scan, { opacity: 1, duration: 0.5, delay: DURATION.cinematic, ease: 'none' });
    } else {
      Object.assign(cam, { ...target, k: target.k * 0.88, lift: 0.035, hangar: 1 });
      gsap.to(cam, { ...target, duration: 1.1, ease: EASE.out });
      gsap.fromTo(canvas, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'none', clearProps: 'opacity' });
    }
    hosts.board.dataset.canvas = String(name === 'board');
    hosts.hangar.dataset.canvas = String(name === 'hangar');
    if (name === 'hangar') {
      velocity = reducedMotion ? 0 : AUTO_SPEED;
      resumeAt = 0;
    }
    layoutHangar();
    // Un cuadro inmediato si la base ya está a la vista (sin esperar al ticker).
    live = false;
    gsap.ticker.remove(frame);
    stage.setRendering(false);
    updateLive();
  }

  // ---------- Modelos bajo demanda ----------

  let ready = false;
  let requested = catalog.CATALOG[0].slug;
  let pumping = false;

  stage.ready
    .then(() => {
      // createStage fija el piso con el primer modelo; aquí manda el piso común.
      stage.groundY = FLOOR_Y;
      ready = true;
      pump();
    })
    .catch(() => onLoading?.('error', requested));

  // Siempre termina en el último modelo pedido: si el usuario cambia de par
  // mientras uno carga, la carga sigue en segundo plano y se pasa al nuevo.
  async function pump() {
    if (pumping || !ready) return;
    pumping = true;
    try {
      while (requested !== stage.active) {
        const target = requested;
        if (!stage.model(target)) {
          onLoading?.('loading', target);
          try {
            await stage.ensureModel(target);
          } catch {
            onLoading?.('error', target);
            return;
          }
          if (requested !== target) continue;
        }
        onLoading?.('idle', target);
        if (reducedMotion) stage.setActive(target);
        else await stage.swapModel(target, { duration: 0.8 });
      }
      onLoading?.('idle', requested);
    } finally {
      pumping = false;
    }
  }

  function show(slug) {
    requested = slug;
    if (!ready) {
      // El primer modelo aún carga: se avisa y pump() arranca al terminar.
      if (slug !== catalog.CATALOG[0].slug) onLoading?.('loading', slug);
      return;
    }
    pump();
  }

  // Precarga silenciosa (al pasar el cursor o enfocar una fila).
  function prefetch(slug) {
    if (!slug || stage.model(slug)) return;
    stage.ensureModel(slug).catch(() => {});
  }

  return {
    attach,
    show,
    prefetch,
    get host() {
      return host;
    },
    get angle() {
      return spin.angle;
    },
    onLive(listener) {
      liveListeners.add(listener);
      return () => liveListeners.delete(listener);
    },
  };
}
