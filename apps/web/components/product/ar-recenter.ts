import { Box3, Matrix4, Vector3, Vector4 } from 'three';
import type { Camera, Object3D } from 'three';
import {
  centerFloorPoint,
  isPlacementTap,
  isSphereOutOfView,
  rayFloorPoint,
  RECENTER_MAX_DISTANCE,
  RECENTER_MIN_DISTANCE,
  stepAwayTimer,
  TAP_MAX_DISTANCE,
} from './ar-recenter-math';

// "Traer al centro" en la vista AR de Android (WebXR de model-viewer), con
// tres caminos: el botón, el regreso automático tras unos 2 s fuera de cuadro
// y tocar una superficie (piso o mesa) para llevar el modelo a ese punto.
//
// model-viewer 4.4 no tiene una API pública para volver a colocar el modelo:
// solo lo coloca una vez al empezar (placeInitially + la primera prueba de
// impacto con el piso) y después lo mueve la persona con los dedos. Aquí se
// usan, con verificaciones de forma, algunos campos internos de su ARRenderer
// (goalPosition, goalScale, presentedScene, xrMode y las banderas de gesto). Si
// una versión futura los cambia, getArInternals devuelve null y la vista AR
// sigue igual que antes, solo que sin el botón ni el regreso automático.
//
// Quick Look (iOS) y Scene Viewer tienen sus propios controles nativos: ahí
// ar-status nunca pasa por "session-started" y nada de esto se activa.

// Forma mínima de WebXR que se usa (sin depender de los tipos globales).
interface HitTestSource {
  cancel(): void;
}
interface HitTestResult {
  getPose(space: unknown): { transform: { matrix: Float32Array } } | null | undefined;
}
interface ArInputSource {
  gamepad?: { axes: readonly number[] } | null;
}
interface ArFrame {
  getHitTestResults(source: HitTestSource): readonly HitTestResult[];
  getHitTestResultsForTransientInput?: (
    source: HitTestSource,
  ) => readonly { inputSource: ArInputSource; results: readonly HitTestResult[] }[];
}
interface ArSession extends EventTarget {
  requestAnimationFrame(callback: (time: number, frame: ArFrame) => void): number;
  cancelAnimationFrame(handle: number): void;
  requestReferenceSpace(type: 'viewer'): Promise<unknown>;
  requestHitTestSource?: (options: { space: unknown }) => Promise<HitTestSource> | undefined;
  requestHitTestSourceForTransientInput?: (options: { profile: string }) => Promise<HitTestSource> | undefined;
}

// Gesto en curso en la pantalla, para distinguir un toque de un arrastre o un
// pellizco. Los toques sobre los botones de la capa DOM (salir, traer al
// centro) no llegan aquí: model-viewer cancela su "select" (beforexrselect).
interface Gesture {
  source: ArInputSource | null;
  start: number;
  startAxes: [number, number];
  lastAxes: [number, number];
  maxTouches: number;
  onModel: boolean;
  hit: Vector3 | null;
}

interface SceneInternals extends Object3D {
  scenePivot: Object3D;
  getCamera(): Camera;
}

interface ArInternals {
  isPresenting: boolean;
  xrMode: string | null;
  currentSession: ArSession | null;
  presentedScene: SceneInternals | null;
  goalPosition: Vector3;
  goalScale: number;
  threeRenderer: { xr: { getReferenceSpace(): unknown } };
  isTranslating?: boolean;
  isRotating?: boolean;
  isTwoHandInteraction?: boolean;
  wasTwoFingering?: boolean;
}

// Busca el ARRenderer interno de model-viewer y comprueba que tenga la forma
// esperada. El renderer vive en un getter con símbolo privado ("renderer").
function getArInternals(viewer: HTMLElement): ArInternals | null {
  try {
    let proto: object | null = Object.getPrototypeOf(viewer);
    let rendererKey: symbol | undefined;
    while (proto && !rendererKey) {
      rendererKey = Object.getOwnPropertySymbols(proto).find((key) => key.description === 'renderer');
      proto = Object.getPrototypeOf(proto);
    }
    if (!rendererKey) return null;
    const renderer = (viewer as unknown as Record<symbol, { arRenderer?: unknown } | undefined>)[rendererKey];
    const ar = renderer?.arRenderer as Partial<ArInternals> | null | undefined;
    if (!ar || typeof ar !== 'object') return null;
    const goal = ar.goalPosition as Partial<Vector3> | undefined;
    const ok =
      typeof ar.isPresenting === 'boolean' &&
      typeof ar.goalScale === 'number' &&
      typeof goal?.set === 'function' &&
      typeof goal?.y === 'number' &&
      typeof ar.threeRenderer?.xr?.getReferenceSpace === 'function' &&
      'presentedScene' in ar &&
      'currentSession' in ar &&
      'xrMode' in ar;
    return ok ? (ar as ArInternals) : null;
  } catch {
    return null;
  }
}

// La escena presentada, solo si tiene lo necesario y el modelo está apoyado
// (no tomado por un control de visor, que no aplica en teléfonos).
function presentedScene(ar: ArInternals): SceneInternals | null {
  const scene = ar.presentedScene;
  if (!ar.isPresenting || !scene || typeof scene.getCamera !== 'function' || !scene.scenePivot) return null;
  return scene.scenePivot.parent === scene ? scene : null;
}

const isInteracting = (ar: ArInternals) =>
  Boolean(ar.isTranslating || ar.isRotating || ar.isTwoHandInteraction || ar.wasTwoFingering);

// Cada cuántos cuadros de la cámara se revisa si el modelo sigue a la vista.
const CHECK_EVERY_FRAMES = 6;
// Cuadros que se espera la prueba de impacto antes de quedarse con el cálculo.
const HIT_TEST_FRAMES = 45;
// Escala de partida de la entrada suave (model-viewer la lleva a goalScale).
const SCALE_IN_FROM = 0.7;

const box = new Box3();
const center = new Vector3();
const cameraPosition = new Vector3();
const forward = new Vector3();
const up = new Vector3();
const hitPoint = new Vector3();
const clip = new Vector4();
const matrix = new Matrix4();
const rayPoint = new Vector3();

const axesOf = (source: ArInputSource | null): [number, number] | null => {
  const axes = source?.gamepad?.axes;
  return axes && axes.length >= 2 ? [axes[0], axes[1]] : null;
};

// Superficie horizontal (normal hacia arriba) de un resultado de impacto.
function surfacePoint(result: HitTestResult | undefined, space: unknown, target: Vector3): Vector3 | null {
  const pose = result && space ? result.getPose(space) : null;
  if (!pose) return null;
  matrix.fromArray(pose.transform.matrix);
  return matrix.elements[5] > 0.75 ? target.setFromMatrixPosition(matrix) : null;
}

function modelOutOfView(scene: SceneInternals): boolean {
  box.setFromObject(scene.scenePivot);
  if (box.isEmpty()) return false;
  box.getCenter(center);
  const radius = box.max.distanceTo(center);
  const camera = scene.getCamera();
  matrix.copy(camera.matrixWorld).invert();
  clip.set(center.x, center.y, center.z, 1).applyMatrix4(matrix).applyMatrix4(camera.projectionMatrix);
  const projection = camera.projectionMatrix.elements;
  return isSphereOutOfView({ x: clip.x, y: clip.y, w: clip.w }, radius, projection[0], projection[5]);
}

const ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><path d="M8 .8v2.6M8 12.6v2.6M.8 8h2.6M12.6 8h2.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

// Agrega el botón "Traer al centro" como hijo del visor (model-viewer lo
// muestra en la capa DOM de WebXR), el regreso automático tras unos 2 s
// fuera de cuadro y el toque sobre una superficie para colocarlo. El CSS solo muestra el botón con ar-status="object-placed"
// y data-recenter="on" (este último solo si los internos están disponibles).
export function attachArRecenter(viewer: HTMLElement, label: string, buttonClass: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = buttonClass;
  button.innerHTML = ICON;
  button.append(label);
  viewer.append(button);

  let stopSession: (() => void) | null = null;

  function start() {
    const ar = getArInternals(viewer);
    const session = ar?.currentSession;
    // Solo en teléfonos (screen-space); en visores model-viewer usa otro flujo.
    if (!ar || !session || ar.xrMode !== 'screen-space' || typeof session.requestAnimationFrame !== 'function') return;

    let stopped = false;
    let frameHandle = 0;
    let frameCount = 0;
    let awaySince: number | null = null;
    let touches = 0;
    let hitSource: HitTestSource | null = null;
    let hitFrames = 0;
    let hitRequest = 0;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let gesture: Gesture | null = null;
    let pendingTap: { hit: Vector3 | null; axes: [number, number] } | null = null;
    let transientSource: HitTestSource | null = null;

    // Impactos bajo el dedo (superficies reales detectadas por el teléfono).
    session
      .requestHitTestSourceForTransientInput?.({ profile: 'generic-touchscreen' })
      ?.then((source) => {
        if (stopped) source.cancel();
        else transientSource = source;
      })
      .catch(() => undefined);

    // Nuestros oyentes se registran antes que los de model-viewer (que llegan
    // con el primer cuadro), así en selectend sus banderas de gesto siguen
    // intactas: isTranslating dice si el dedo empezó sobre el modelo.
    const onSelectStart = (event: Event) => {
      touches += 1;
      if (touches === 1) {
        const source = (event as Event & { inputSource?: ArInputSource }).inputSource ?? null;
        const axes = axesOf(source) ?? [0, 0];
        gesture = { source, start: performance.now(), startAxes: axes, lastAxes: axes, maxTouches: 1, onModel: false, hit: null };
      } else if (gesture) {
        gesture.maxTouches = Math.max(gesture.maxTouches, touches);
      }
    };
    const onSelectEnd = () => {
      touches = Math.max(0, touches - 1);
      const current = gesture;
      if (!current || touches > 0) return;
      gesture = null;
      const internals = getArInternals(viewer);
      const onModel = current.onModel || Boolean(internals?.isTranslating);
      const end = axesOf(current.source) ?? current.lastAxes;
      const moved = Math.hypot(end[0] - current.startAxes[0], end[1] - current.startAxes[1]);
      const tap = isPlacementTap({ durationMs: performance.now() - current.start, moved, maxTouches: current.maxTouches, onModel });
      // Se aplica en el próximo cuadro, después de que model-viewer cierre su gesto.
      if (tap) pendingTap = { hit: current.hit, axes: current.startAxes };
    };

    // Durante el gesto: guarda la superficie bajo el dedo y marca si
    // model-viewer lo tomó como arrastre del modelo o pellizco.
    function trackGesture(internals: ArInternals, frame: ArFrame) {
      const current = gesture;
      if (!current) return;
      current.lastAxes = axesOf(current.source) ?? current.lastAxes;
      if (internals.isTranslating || internals.isTwoHandInteraction || internals.wasTwoFingering) current.onModel = true;
      if (!transientSource || typeof frame.getHitTestResultsForTransientInput !== 'function') return;
      const space = internals.threeRenderer.xr.getReferenceSpace();
      for (const entry of frame.getHitTestResultsForTransientInput(transientSource)) {
        if (entry.inputSource !== current.source) continue;
        const point = surfacePoint(entry.results[0], space, rayPoint);
        if (point) current.hit = (current.hit ?? new Vector3()).copy(point);
      }
    }

    // Lleva el modelo al punto tocado: la superficie detectada bajo el dedo o,
    // si no hubo, el cruce del rayo del dedo con el piso actual. El movimiento
    // lo suavizan los amortiguadores de model-viewer; escala y giro se conservan.
    function placeAtTap(internals: ArInternals, tap: { hit: Vector3 | null; axes: [number, number] }) {
      const scene = presentedScene(internals);
      if (!scene || isInteracting(internals) || touches > 0) return;
      const camera = scene.getCamera();
      cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      if (tap.hit && Math.hypot(tap.hit.x - cameraPosition.x, tap.hit.z - cameraPosition.z) <= TAP_MAX_DISTANCE) {
        internals.goalPosition.copy(tap.hit);
      } else {
        // Rayo de la cámara por el punto tocado (y de pantalla hacia abajo).
        matrix.copy(camera.projectionMatrix).invert();
        rayPoint.set(tap.axes[0], -tap.axes[1], 0.5).applyMatrix4(matrix).applyMatrix4(camera.matrixWorld);
        forward.copy(rayPoint).sub(cameraPosition).normalize();
        const floorY = internals.goalPosition.y;
        const point = rayFloorPoint(cameraPosition, forward, floorY);
        if (!point) return;
        internals.goalPosition.set(point.x, floorY, point.z);
      }
      cancelHitTest();
      awaySince = null;
    }

    function cancelHitTest() {
      hitRequest += 1;
      hitSource?.cancel();
      hitSource = null;
    }

    // Prueba de impacto con el rayo central de la cámara: si encuentra una
    // superficie horizontal a una distancia razonable, el modelo se asienta
    // ahí (model-viewer lo desliza con sus amortiguadores).
    function requestHitTest(activeSession: ArSession) {
      cancelHitTest();
      if (typeof activeSession.requestHitTestSource !== 'function') return;
      const request = hitRequest;
      activeSession
        .requestReferenceSpace('viewer')
        .then((space) => activeSession.requestHitTestSource?.({ space }))
        .then((source) => {
          if (!source) return;
          if (stopped || request !== hitRequest) source.cancel();
          else {
            hitSource = source;
            hitFrames = 0;
          }
        })
        .catch(() => undefined);
    }

    function refineWithHitTest(internals: ArInternals, frame: ArFrame) {
      if (!hitSource) return;
      hitFrames += 1;
      let done = hitFrames > HIT_TEST_FRAMES;
      const space = internals.threeRenderer.xr.getReferenceSpace();
      const scene = presentedScene(internals);
      const point = surfacePoint(frame.getHitTestResults(hitSource)[0], space, hitPoint);
      if (point && scene && !isInteracting(internals) && touches === 0) {
        cameraPosition.setFromMatrixPosition(scene.getCamera().matrixWorld);
        const distance = Math.hypot(point.x - cameraPosition.x, point.z - cameraPosition.z);
        if (distance >= RECENTER_MIN_DISTANCE && distance <= RECENTER_MAX_DISTANCE) internals.goalPosition.copy(point);
        done = true;
      }
      if (done) cancelHitTest();
    }

    function recenter(): boolean {
      const internals = getArInternals(viewer);
      const activeSession = internals?.currentSession;
      const scene = internals && presentedScene(internals);
      if (!internals || !activeSession || !scene || isInteracting(internals)) return false;
      if (viewer.getAttribute('ar-tracking') === 'not-tracking') return false;

      const camera = scene.getCamera();
      cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      camera.getWorldDirection(forward);
      up.set(0, 1, 0).transformDirection(camera.matrixWorld);
      // Misma altura de piso en la que ya estaba apoyado.
      const floorY = internals.goalPosition.y;
      const point = centerFloorPoint(cameraPosition, forward, up, floorY);

      // Salto directo (sin cruzar la habitación) y entrada suave de escala; la
      // escala y la rotación que eligió la persona se conservan.
      internals.goalPosition.set(point.x, floorY, point.z);
      scene.scenePivot.position.copy(internals.goalPosition);
      const goalScale = internals.goalScale;
      if (!reducedMotion && Number.isFinite(goalScale) && goalScale > 0) scene.scenePivot.scale.setScalar(goalScale * SCALE_IN_FROM);

      awaySince = null;
      requestHitTest(activeSession);
      return true;
    }

    const onFrame = (time: number, frame: ArFrame) => {
      if (stopped) return;
      frameHandle = session.requestAnimationFrame(onFrame);
      const internals = getArInternals(viewer);
      if (!internals) return;
      trackGesture(internals, frame);
      if (pendingTap) {
        placeAtTap(internals, pendingTap);
        pendingTap = null;
      }
      refineWithHitTest(internals, frame);

      frameCount += 1;
      if (frameCount % CHECK_EVERY_FRAMES !== 0) return;
      const scene = presentedScene(internals);
      const blocked =
        !scene ||
        touches > 0 ||
        gesture !== null ||
        isInteracting(internals) ||
        hitSource !== null ||
        viewer.getAttribute('ar-status') !== 'object-placed' ||
        viewer.getAttribute('ar-tracking') === 'not-tracking';
      const outOfView = !blocked && scene !== null && modelOutOfView(scene);
      const step = stepAwayTimer(awaySince, outOfView, blocked, time);
      awaySince = step.awaySince;
      if (step.recenter) recenter();
    };

    const onClick = () => {
      recenter();
    };

    function stop() {
      if (stopped) return;
      stopped = true;
      session?.cancelAnimationFrame(frameHandle);
      cancelHitTest();
      transientSource?.cancel();
      transientSource = null;
      session?.removeEventListener('selectstart', onSelectStart);
      session?.removeEventListener('selectend', onSelectEnd);
      session?.removeEventListener('end', stop);
      button.removeEventListener('click', onClick);
      delete viewer.dataset.recenter;
      stopSession = null;
    }

    session.addEventListener('selectstart', onSelectStart);
    session.addEventListener('selectend', onSelectEnd);
    session.addEventListener('end', stop);
    button.addEventListener('click', onClick);
    frameHandle = session.requestAnimationFrame(onFrame);
    viewer.dataset.recenter = 'on';
    stopSession = stop;
  }

  viewer.addEventListener('ar-status', (event) => {
    const status = (event as CustomEvent<{ status: string }>).detail?.status;
    if (status === 'session-started') {
      // El visor vive oculto en la página; durante AR su capa DOM debe verse.
      viewer.style.opacity = '1';
      stopSession?.();
      start();
    } else if (status === 'not-presenting' || status === 'failed') {
      viewer.style.opacity = '0';
      stopSession?.();
    }
  });
}
