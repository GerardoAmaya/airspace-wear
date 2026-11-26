// Foco 3D de la sección "baggage". UN solo canvas cubre el foco y la banda.
//
// El balón siempre está en el origen del mundo y la cámara lo mira de frente;
// un desplazamiento de lente (camera.setViewOffset) lo coloca sobre cualquier
// punto del canvas y la distancia de la cámara fija su tamaño en píxeles. Así
// el mismo balón puede estar sobre una pieza de la banda o en el foco, con
// exactamente la misma perspectiva.
//
// Los balones de la banda son fotos de ese mismo escenario (snapshots()): se
// dibujan una vez con las luces del tema y se copian a un <canvas> 2D por
// pieza. Al reclamar un balón, el 3D aparece en el lugar exacto de su foto y
// la foto se oculta en el mismo cuadro: el relevo no se nota.
//
// Rendimiento: el layout se mide solo en cada refresh. Cada cuadro calcula con
// números en caché; el DOM solo recibe transform y opacity.

const BALL_M = 0.22; // diámetro real (m)
const ELEVATION_DEG = 7; // cámara apenas por encima del ecuador del balón
const TILT_X = 0.21; // eje inclinado hacia la cámara
const TILT_Z = 0.4; // eje inclinado de lado (~23°)
const SPIN = 0.42; // giro en el foco (rad/s)

export const AXIS_DEGREES = Math.round((TILT_Z * 180) / Math.PI);

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const mix = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const smoothstep = (edge0, edge1, value) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/**
 * @param {object} options
 * @param {object} options.stage escenario de createStage()
 * @param {object} options.gsap
 * @param {object} options.belt banda de createBelt()
 * @param {object} options.elements { canvas, spot, halo }
 * @param {boolean} options.reducedMotion
 */
export function createFocus({ stage, gsap, belt, elements, reducedMotion }) {
  const { THREE, camera, sneaker, renderer, scene } = stage;
  const swapper = sneaker.children[0];
  const elevation = THREE.MathUtils.degToRad(ELEVATION_DEG);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  // Giro sobre un eje inclinado: R = Rx(TILT_X) · Rz(TILT_Z) · Ry(giro).
  sneaker.rotation.order = 'XZY';
  sneaker.visible = false;
  // La sombra de contacto del escenario es para zapatos sobre el piso; aquí
  // el balón flota en el foco y la banda dibuja sus propias sombras.
  stage.shadow.visible = false;

  const state = {
    u: 1, // 0 = sobre la banda, 1 = en el foco
    yaw: 0,
    spinRate: 0,
    float: 0,
    source: -1, // pieza de la banda de la que salió el balón
    visible: false,
    halo: -1,
  };
  let L = null;
  let shownHalo = '';

  // Centrado preciso de cada balón (una vez por modelo). El escenario centra
  // con la caja alineada a los ejes del nodo; si el nodo viene rotado (Al
  // Rihla), esa caja es más grande que la esfera y el balón queda 3 cm abajo:
  // al girar sobre el eje inclinado "orbitaría" en vez de girar en su lugar.
  // Se mide con los vértices (setFromObject preciso) en la pose de reposo.
  const centered = new Set();
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  function prepare(slug) {
    const root = stage.model(slug);
    if (!root || centered.has(slug)) return;
    centered.add(slug);
    const saved = {
      rotation: sneaker.rotation.clone(),
      position: sneaker.position.clone(),
      scale: sneaker.scale.clone(),
      swapRotation: swapper.rotation.clone(),
      swapScale: swapper.scale.clone(),
    };
    sneaker.rotation.set(0, 0, 0);
    sneaker.position.set(0, 0, 0);
    sneaker.scale.set(1, 1, 1);
    swapper.rotation.set(0, 0, 0);
    swapper.scale.set(1, 1, 1);
    sneaker.updateMatrixWorld(true);
    box.setFromObject(root, true).getCenter(center);
    if (center.length() > 0.0005) root.children[0].position.sub(center);
    sneaker.rotation.copy(saved.rotation);
    sneaker.position.copy(saved.position);
    sneaker.scale.copy(saved.scale);
    swapper.rotation.copy(saved.swapRotation);
    swapper.scale.copy(saved.swapScale);
    sneaker.updateMatrixWorld(true);
  }

  // ---------- Medición (solo en refresh) ----------

  function measure() {
    const { canvas, spot, halo } = elements;
    const canvasRect = canvas.getBoundingClientRect();
    const spotRect = spot.getBoundingClientRect();
    const beltRect = belt.element.getBoundingClientRect();
    const width = canvasRect.width;
    const height = canvasRect.height;
    if (!width || !height) return null;
    // Tope de tamaño: la textura del Jabulani es de 512 px y no aguanta un primer plano.
    const D = Math.min(spotRect.width * 0.54, spotRect.height * 0.64, 268);
    L = {
      width,
      height,
      focal: height / 2 / tanHalf,
      spot: {
        x: spotRect.left + spotRect.width / 2 - canvasRect.left,
        y: spotRect.top + spotRect.height / 2 - canvasRect.top,
        D,
        top: spotRect.top - canvasRect.top,
      },
      belt: { x: beltRect.left - canvasRect.left, y: beltRect.top - canvasRect.top },
      kSpot: D / BALL_M,
    };
    const haloSize = Math.round(D * 2.3);
    halo.style.width = halo.style.height = `${haloSize}px`;
    halo.style.left = halo.style.top = `${-haloSize / 2}px`;
    shownHalo = '';
    return L;
  }

  // Cámara: el balón (en el origen) aparece en (x, y) del canvas con k px/m.
  function aim(x, y, k) {
    const distance = L.focal / k;
    camera.position.set(0, distance * Math.sin(elevation), distance * Math.cos(elevation));
    camera.setViewOffset(L.width, L.height, L.width / 2 - x, L.height / 2 - y, L.width, L.height);
  }

  // ---------- Cuadro ----------

  function frame(time, deltaMs) {
    if (!L || !state.visible) return;
    const dt = Math.min(0.05, (deltaMs || 16) / 1000);
    state.yaw += state.spinRate * dt;

    let x = L.spot.x;
    let y = L.spot.y;
    let k = L.kSpot;
    const u = state.u;
    if (u < 1 && state.source >= 0) {
      const from = belt.anchor(state.source);
      const fromX = L.belt.x + from.x;
      const fromY = L.belt.y + from.y;
      // Sube un poco antes de desplazarse: un arco natural de "levantar".
      const ex = easeInOut(u);
      const ey = easeInOut(clamp01(u * 1.2));
      x = mix(fromX, L.spot.x, ex);
      y = mix(fromY, L.spot.y, ey);
      k = mix(belt.geometry.D / BALL_M, L.kSpot, ex);
    }
    y += Math.sin(time * 1.15) * L.spot.D * 0.014 * state.float;
    aim(x, y, k);
    sneaker.rotation.set(TILT_X, state.yaw, TILT_Z);

    // Halo de estudio detrás del balón: sigue al balón y se enciende al subir.
    const halo = Math.round(smoothstep(0.15, 0.85, u) * 100) / 100;
    if (halo !== state.halo) {
      state.halo = halo;
      elements.halo.style.opacity = halo;
    }
    const transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(k / L.kSpot).toFixed(4)})`;
    if (transform !== shownHalo) {
      shownHalo = transform;
      elements.halo.style.transform = transform;
    }
  }

  // ---------- Fotos para la banda ----------

  // Dibuja las piezas de los modelos pedidos (o de todos los cargados). Usa el
  // canvas principal en el mismo task (sin preserveDrawingBuffer) y deja el
  // escenario como estaba.
  function snapshots(slugs = null) {
    if (!L) return [];
    stage.resize();
    const width = L.width;
    const height = L.height;
    const dpr = renderer.getPixelRatio();
    const D = belt.geometry.D;
    const R = Math.round(D * 0.6);
    if (2 * R > width || 2 * R > height) return [];
    const size = Math.round(2 * R * dpr);

    const saved = {
      active: stage.active,
      visible: sneaker.visible,
      rotation: sneaker.rotation.clone(),
      scale: swapper.scale.clone(),
      spin: swapper.rotation.y,
      position: camera.position.clone(),
      view: camera.view ? { ...camera.view } : null,
    };

    const k = D / BALL_M;
    const distance = (height / 2 / tanHalf) / k;
    camera.position.set(0, distance * Math.sin(elevation), distance * Math.cos(elevation));
    camera.setViewOffset(width, height, width / 2 - R, height / 2 - R, width, height);
    camera.lookAt(stage.cameraTarget);
    swapper.scale.set(1, 1, 1);
    swapper.rotation.y = 0;
    sneaker.visible = true;

    const drawn = [];
    for (const piece of belt.pieces) {
      if (slugs && !slugs.includes(piece.slug)) continue;
      if (!stage.model(piece.slug)) continue;
      prepare(piece.slug);
      stage.setActive(piece.slug);
      sneaker.rotation.set(TILT_X, piece.angle, TILT_Z);
      renderer.render(scene, camera);
      if (piece.ball.width !== size) piece.ball.width = piece.ball.height = size;
      const context = piece.ball.getContext('2d');
      context.clearRect(0, 0, size, size);
      context.drawImage(renderer.domElement, 0, 0, size, size, 0, 0, size, size);
      drawn.push(piece);
    }

    // Restaura el escenario y repinta el cuadro real (o lo deja vacío).
    stage.setActive(saved.active);
    sneaker.visible = saved.visible;
    sneaker.rotation.copy(saved.rotation);
    swapper.scale.copy(saved.scale);
    swapper.rotation.y = saved.spin;
    camera.position.copy(saved.position);
    if (saved.view?.enabled) {
      const view = saved.view;
      camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
    } else {
      camera.clearViewOffset();
    }
    stage.renderOnce();
    return drawn;
  }

  // ---------- Transiciones ----------

  // Primer reclamo: el balón sale de su pieza y sube al foco.
  function lift(index, slug) {
    const piece = belt.pieces[index];
    prepare(slug);
    stage.setActive(slug);
    gsap.killTweensOf(state);
    Object.assign(state, { source: index, u: 0, yaw: piece.angle, spinRate: 0, float: 0, visible: true });
    sneaker.visible = true;
    belt.hideBall(index);
    return new Promise((resolve) => {
      gsap
        .timeline({ onComplete: resolve })
        .to(state, { u: 1, duration: 1.5, ease: 'none' }, 0)
        .to(state, { spinRate: SPIN, duration: 2, ease: 'power2.in' }, 0.25)
        .to(state, { float: 1, duration: 1.4, ease: 'power2.inOut' }, 1.1);
    });
  }

  // Cambio de balón en el foco: el anterior cae a su pieza y el nuevo sube.
  async function swap(index, slug) {
    await stage.ensureModel(slug);
    prepare(slug);
    const previous = state.source;
    if (previous >= 0 && previous !== index) belt.dropIn(previous);
    belt.liftOut(index);
    state.source = index;
    await stage.swapModel(slug, { duration: 0.9 });
  }

  // Sin animación (movimiento reducido o fuera de pantalla).
  function setInstant(index, slug) {
    if (state.source >= 0 && state.source !== index) belt.showBall(state.source, { animate: false });
    prepare(slug);
    stage.setActive(slug);
    gsap.killTweensOf(state);
    Object.assign(state, {
      source: index,
      u: 1,
      yaw: reducedMotion ? 0 : state.yaw,
      spinRate: reducedMotion ? 0 : SPIN,
      float: reducedMotion ? 0 : 1,
      visible: true,
    });
    sneaker.visible = true;
    belt.hideBall(index, { animate: false });
  }

  // Grados de giro que se ven en el foco (para el instrumento ROT).
  const rotation = () => {
    if (!state.visible) return 0;
    const degrees = ((state.yaw + swapper.rotation.y) * 180) / Math.PI;
    return ((degrees % 360) + 360) % 360;
  };

  return {
    state,
    measure,
    frame,
    snapshots,
    lift,
    swap,
    setInstant,
    rotation,
    get layout() {
      return L;
    },
  };
}
