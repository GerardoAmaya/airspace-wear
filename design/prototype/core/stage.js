// Escenario 3D (three.js) para mostrar los zapatos del catálogo.
// Cada sección que necesita 3D crea su propio escenario con createStage().
//
// Jerarquía de la escena:
//   scene
//   ├─ sneaker   (Group) la sección anima position / rotation / scale; su
//   │             origen es el centro del zapato activo
//   │  └─ swapper (Group) reservado para la animación de swapModel()
//   │     └─ un grupo por modelo, desplazado para que su centro quede en 0
//   └─ shadow    sombra de contacto: sigue al zapato en el piso y se
//                desvanece cuando el zapato se eleva
//
// Coordenadas de los modelos (pose canónica del pipeline): metros, suela en
// y = 0, punta hacia +X, largo 0.30 m. toScreen() recibe puntos en ese espacio.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from '/vendor/meshopt_decoder.mjs';

const { gsap } = window;

export const MODEL_SLUGS = [
  'air-jordan-1',
  'new-balance-997',
  'nike-air-uptempo',
  'adidas-samba',
  'adidas-sambae',
  'adidas-prophere',
  'adidas-gazelle',
  'adidas-basketball',
  'air-jordan-1-mid-particle-beige',
  'jordan-4-university-blue',
  'nike-pegasus-36',
  'jordan-4-travis-scott',
  'nike-dunk-high-hawaii',
];

// Balones: pose canónica propia (diámetro real de 22 cm, apoyados en y = 0).
export const BALL_SLUGS = [
  'adidas-trionda-2026',
  'adidas-al-rihla-2022',
  'adidas-jabulani-2010',
  'adidas-teamgeist-2006',
  'adidas-telstar-1970',
];

export const modelUrl = (slug, lite = false) => `/models/${slug}${lite ? '-lite' : ''}.glb`;

const BRAND_LIME = 0xc6ff3d;

// Iluminación por tema. En oscuro, los zapatos negros (Jordan, Uptempo, Samba)
// se perderían contra el fondo: la luz de contorno (kicker) y el contraluz
// dibujan sus bordes. En claro, se baja el contraluz lima (no se lee sobre
// crema) y la sombra de contacto ancla los zapatos blancos al piso.
// Un cambio de tema vuelve a aplicar el preset; las secciones pueden ajustar
// las luces después si lo necesitan.
export const LIGHT_PRESETS = {
  dark: { environment: 1, exposure: 1.05, key: 1.7, fill: 0.45, rim: 1.3, kicker: 1.8, shadow: 0.9 },
  light: { environment: 0.85, exposure: 1, key: 1.5, fill: 0.3, rim: 0.45, kicker: 0.9, shadow: 0.7 },
};

// Textura de sombra de contacto: gradiente radial suave dibujado en un canvas.
// Descargas compartidas entre escenarios: el inicio y el catálogo muestran el
// mismo Air Jordan 1, y sin esta caché el GLB bajaba dos veces. Se comparte
// el archivo (ArrayBuffer), no la escena: cada escenario la interpreta por su
// cuenta, así ningún material ni geometría queda atado a dos renderizadores.
const downloads = new Map();

function downloadModel(url, onProgress) {
  let entry = downloads.get(url);
  if (!entry) {
    const listeners = new Set();
    const promise = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`No se pudo descargar ${url} (${response.status})`);
      const total = Number(response.headers.get('Content-Length')) || 0;
      if (!total || !response.body) return response.arrayBuffer();
      // Lee por partes para informar el avance de la descarga.
      const reader = response.body.getReader();
      const bytes = new Uint8Array(total);
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes.set(value, received);
        received += value.length;
        for (const listener of listeners) listener(received / total);
      }
      return bytes.buffer;
    });
    entry = { promise, listeners };
    downloads.set(url, entry);
    // Si falla, se olvida para poder reintentar.
    promise.catch(() => downloads.delete(url));
  }
  if (onProgress) {
    entry.listeners.add(onProgress);
    entry.promise.finally(() => entry.listeners.delete(onProgress)).catch(() => {});
  }
  return entry.promise;
}

function createShadowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.75)');
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Crea un escenario sobre un <canvas> existente.
 * @param {HTMLCanvasElement} canvas
 * @param {object} options
 * @param {string[]} [options.models] slugs a cargar (por defecto, todos)
 * @param {boolean} [options.lite] usa las variantes -lite y DPR 1
 * @param {number} [options.fov] campo de visión vertical en grados
 * @param {number} [options.cameraZ] distancia inicial de la cámara en metros
 */
export function createStage(canvas, { models = MODEL_SLUGS, preload = models, lite = false, fov = 28, cameraZ = 1.05 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  // Máximo 1.5x: en pantallas Retina, 2x dibuja 78% más píxeles por cuadro con
  // una diferencia apenas visible en un objeto con antialiasing.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1 : 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Tone mapping neutral (Khronos PBR Neutral): respeta el color real del producto.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 20);
  camera.position.set(0, 0.02, cameraZ);
  // La sección puede animar cameraTarget; la cámara lo mira en cada cuadro.
  const cameraTarget = new THREE.Vector3(0, 0, 0);

  const lights = {
    key: new THREE.DirectionalLight(0xffffff, 1.6),
    fill: new THREE.DirectionalLight(0xffffff, 0.35),
    rim: new THREE.DirectionalLight(BRAND_LIME, 1.2), // contraluz de marca
    kicker: new THREE.DirectionalLight(0xffffff, 1.8), // contorno blanco desde atrás y arriba
  };
  lights.key.position.set(0.6, 1.2, 1);
  lights.fill.position.set(-1, 0.3, 0.8);
  lights.rim.position.set(-0.8, 0.6, -1.2);
  lights.kicker.position.set(0.9, 1, -1);
  scene.add(lights.key, lights.fill, lights.rim, lights.kicker);

  const sneaker = new THREE.Group();
  sneaker.name = 'sneaker';
  const swapper = new THREE.Group();
  sneaker.add(swapper);
  scene.add(sneaker);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.2),
    new THREE.MeshBasicMaterial({ map: createShadowTexture(), transparent: true, depthWrite: false, opacity: 0.85 }),
  );
  // Orden YXZ: primero el giro horizontal del zapato, luego acostar el plano.
  shadow.rotation.order = 'YXZ';
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -1;
  scene.add(shadow);

  const loaded = new Map(); // slug -> { root, height }
  const progressListeners = new Set();
  const frameListeners = new Set();
  const progressBySlug = Object.fromEntries(preload.map((slug) => [slug, 0]));
  const loading = new Map(); // slug -> promesa de carga en curso
  let activeSlug = preload[0] ?? models[0];
  let shadowOpacity = 0.85;
  let groundY = 0; // altura del piso, relativa al origen de la escena
  let rendering = false;
  let disposed = false;

  const emitProgress = () => {
    const values = Object.values(progressBySlug);
    const total = values.reduce((sum, value) => sum + value, 0) / values.length;
    for (const listener of progressListeners) listener(total);
  };

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  function loadModel(slug) {
    const url = modelUrl(slug, lite);
    const onProgress = (fraction) => {
      progressBySlug[slug] = Math.min(0.99, fraction);
      emitProgress();
    };
    return downloadModel(url, onProgress)
      .then((buffer) => new Promise((resolve, reject) => loader.parse(buffer, url.slice(0, url.lastIndexOf('/') + 1), resolve, reject)))
      .then((gltf) => {
        const root = new THREE.Group();
        root.name = slug;
        root.add(gltf.scene);
        // Caja precisa (por vértice): con nodos rotados, la caja aproximada
        // queda holgada y el modelo no gira sobre su centro real.
        const box = new THREE.Box3().setFromObject(gltf.scene, true);
        const height = box.max.y - box.min.y;
        // Centra el zapato verticalmente para que gire sobre su centro.
        gltf.scene.position.y = -height / 2;
        root.visible = slug === activeSlug;
        swapper.add(root);
        loaded.set(slug, { root, height });
        progressBySlug[slug] = 1;
        emitProgress();
        return root;
      });
  }

  // Carga bajo demanda: devuelve la promesa en curso o inicia la carga.
  function ensureModel(slug) {
    if (loaded.has(slug)) return Promise.resolve(loaded.get(slug).root);
    if (!loading.has(slug)) loading.set(slug, loadModel(slug));
    return loading.get(slug);
  }

  // Solo se espera a los modelos de "preload"; el resto se carga al pedirlo.
  const ready = Promise.all(preload.map(ensureModel)).then(() => {
    groundY = -loaded.get(activeSlug).height / 2;
    return stage;
  });

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  function applyLightPreset(theme) {
    const preset = LIGHT_PRESETS[theme] ?? LIGHT_PRESETS.dark;
    scene.environmentIntensity = preset.environment;
    renderer.toneMappingExposure = preset.exposure;
    lights.key.intensity = preset.key;
    lights.fill.intensity = preset.fill;
    lights.rim.intensity = preset.rim;
    lights.kicker.intensity = preset.kicker;
    shadowOpacity = preset.shadow;
  }

  const onThemeChange = (event) => applyLightPreset(event.detail.theme);
  document.addEventListener('themechange', onThemeChange);
  applyLightPreset(document.documentElement.dataset.theme);

  function renderFrame(time, deltaTime) {
    if (disposed) return;
    camera.lookAt(cameraTarget);
    // La sombra queda en el piso bajo el zapato y se desvanece al elevarse.
    const lift = Math.max(0, sneaker.position.y - groundY - (loaded.get(activeSlug)?.height ?? 0) / 2);
    shadow.position.set(sneaker.position.x, groundY + 0.0005, sneaker.position.z);
    shadow.rotation.y = sneaker.rotation.y + swapper.rotation.y;
    const fade = Math.max(0, 1 - lift * 6);
    shadow.material.opacity = shadowOpacity * fade * swapper.scale.x;
    shadow.scale.setScalar(sneaker.scale.x * (1 + lift * 2));
    renderer.render(scene, camera);
    for (const listener of frameListeners) listener(time, deltaTime);
  }

  // Convierte un punto del modelo activo (metros, pose canónica) a píxeles
  // relativos al canvas. Sirve para anclar rótulos HUD al zapato.
  const projected = new THREE.Vector3();
  function toScreen([x, y, z], slug = activeSlug) {
    const entry = loaded.get(slug);
    if (!entry) return { x: 0, y: 0, visible: false };
    scene.updateMatrixWorld();
    projected.set(x, y, z);
    entry.root.children[0].localToWorld(projected);
    projected.project(camera);
    return {
      x: ((projected.x + 1) / 2) * canvas.clientWidth,
      y: ((1 - projected.y) / 2) * canvas.clientHeight,
      visible: projected.z < 1,
    };
  }

  const stage = {
    THREE,
    scene,
    camera,
    cameraTarget,
    renderer,
    lights,
    sneaker,
    shadow,
    ready,
    get active() {
      return activeSlug;
    },
    get groundY() {
      return groundY;
    },
    set groundY(value) {
      groundY = value;
    },
    get shadowOpacity() {
      return shadowOpacity;
    },
    set shadowOpacity(value) {
      shadowOpacity = value;
    },
    model: (slug = activeSlug) => loaded.get(slug)?.root ?? null,
    toScreen,
    resize,

    onProgress(listener) {
      progressListeners.add(listener);
      return () => progressListeners.delete(listener);
    },

    // Se llama después de dibujar cada cuadro: ideal para mover rótulos HUD.
    onFrame(listener) {
      frameListeners.add(listener);
      return () => frameListeners.delete(listener);
    },

    // Cambia el modelo visible sin animación.
    setActive(slug) {
      if (!loaded.has(slug)) return;
      for (const [key, entry] of loaded) entry.root.visible = key === slug;
      activeSlug = slug;
    },

    // Carga un modelo sin mostrarlo (por ejemplo, al pasar el cursor).
    ensureModel,

    // Cambia de modelo con una transición corta (se encoge, gira y crece).
    // Si el modelo aún no está cargado, lo carga primero.
    async swapModel(slug, { duration = 0.7 } = {}) {
      if (!loaded.has(slug)) await ensureModel(slug);
      if (slug === activeSlug || !loaded.has(slug)) return;
      gsap.killTweensOf([swapper.scale, swapper.rotation]);
      return new Promise((resolve) => {
        gsap
          .timeline({ onComplete: resolve })
          .to(swapper.scale, { x: 0.001, y: 0.001, z: 0.001, duration: duration / 2, ease: 'power3.in' }, 0)
          .to(swapper.rotation, { y: '+=1.2', duration: duration / 2, ease: 'power3.in' }, 0)
          .add(() => this.setActive(slug))
          .set(swapper.rotation, { y: -1.2 })
          .to(swapper.scale, { x: 1, y: 1, z: 1, duration: duration / 2, ease: 'power3.out' })
          .to(swapper.rotation, { y: 0, duration: duration / 2, ease: 'power3.out' }, '<');
      });
    },

    // Enciende o apaga el dibujo por cuadro (apágalo cuando no se ve).
    setRendering(enabled) {
      if (enabled === rendering || disposed) return;
      rendering = enabled;
      if (enabled) gsap.ticker.add(renderFrame);
      else gsap.ticker.remove(renderFrame);
    },

    // Aplica el preset de luces de un tema ('dark' o 'light'). Se llama solo
    // al cambiar de tema; úsalo para restaurar luces después de animarlas.
    setTheme: applyLightPreset,

    // Dibuja un cuadro aunque el ciclo esté apagado.
    renderOnce() {
      renderFrame(gsap.ticker.time, 0);
    },

    dispose() {
      disposed = true;
      gsap.ticker.remove(renderFrame);
      document.removeEventListener('themechange', onThemeChange);
      resizeObserver.disconnect();
      renderer.dispose();
      pmrem.dispose();
    },
  };

  stage.setRendering(true);
  return stage;
}
