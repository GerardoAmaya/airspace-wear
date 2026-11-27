'use client';

import { accentProps, type ProductAccent } from '@/lib/accent';
import type { Hotspot, Model3D } from '@airspace/contracts';
import { useFormatter, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { type CSSProperties, type KeyboardEvent, type MouseEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { HOME_ANCHORS } from '@/lib/home';
import { gsap, ScrollTrigger, useGSAP } from '@/lib/motion/gsap';
import { SplitText } from '@/lib/motion/split-text';
import { scrollToElement } from '@/lib/motion/scroll';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { useStageActivity } from '@/lib/three/director';
import {
  computePoses,
  DEFAULT_SHOE,
  FOV,
  gripRect,
  heroBox,
  type Layout,
  MOBILE_QUERY,
  orientationFor,
  pixelsPerMeter,
  type Pose,
  shoeRect,
  type ShoeDims,
  type Vec3,
} from './geometry';
import { HeroReticle, TAPE_PX_PER_DEG } from './HeroReticle';
import styles from './HomeHero.module.css';
import { SMOKE_ATLAS, SMOKE_LIFE } from './smoke-config';
import type { HeroRig } from './rig';

// El lienzo 3D solo existe en el cliente y se descarga aparte (three y React
// Three Fiber no entran en el JS inicial de la portada ni en el prefetch de
// la home desde otras páginas). La descarga empieza en cuanto este módulo se
// evalúa en el navegador, en paralelo con la hidratación, no después de ella.
const loadHeroScene = () => import('./HeroScene');
if (typeof window !== 'undefined') void loadHeroScene().catch(() => undefined);
const HeroScene = dynamic(loadHeroScene, { ssr: false });

export interface HeroContent {
  slug: string;
  name: string;
  brand: string;
  reference: string;
  headline: readonly [string, string];
  accent: ProductAccent;
  model: Model3D;
  hotspots: Hotspot[];
  price: string;
  sizes: string | null;
  availability: string;
  availabilityTone: 'alert' | 'primary' | 'muted';
  weightGrams: number | null;
  stackMm: number | null;
  upper: string | null;
  sole: string | null;
}

// Tiempos (segundos), como el prototipo. Con movimiento reducido todo es instantáneo.
const TIMING = { move: 1.15, entrance: 1.5, drift: 4.5, mode: 1.3 };
const GLYPHS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
// Entrada del zapato. Camino normal: mientras carga el modelo la escena queda
// vacía (halo, retícula y texto); al llegar, el zapato aparece con un
// fundido y una leve subida, ya girando desde su primer cuadro visible (la
// curva arranca a toda velocidad y se frena), y se asienta en su pose.
const SHOE_ENTER = { turns: 1, y: -0.03, duration: 2.4, ease: 'power3.out' };
// Camino de respaldo: si el modelo tarda más de POSTER_AFTER segundos se
// muestra el póster. Si después llega el modelo, el póster se apaga y el
// zapato aparece en esa misma vista (el póster se dibuja con el giro de la
// portada pero sin cabeceo ni alabeo) y gira una vuelta hasta su pose.
const POSTER_AFTER = 4;
const SHOE_INTRO = { turns: 1, pitch: -0.09, bank: -0.06, duration: 2.2 };
// Caja del zapato dentro del póster (fracciones de la imagen de 1200 x 800),
// medida sobre los pósters generados: sirve para calzarlo sobre el 3D.
const POSTER_BOX = { left: 0.176, top: 0.155, width: 0.677, aspect: 800 / 1200 };
// Primera entrada con humo ("aterrizaje"), una vez por sesión (ver
// planEntrance): el zapato llega volando en arco, girando, desde fuera de
// cuadro (arriba a la derecha en escritorio; desde la derecha, a la altura
// de la portada, en móvil, sin pasar bajo el encabezado), toca el piso,
// levanta una bocanada de polvo alrededor de la suela y se asienta. Solo en
// el camino normal (sin póster), en la portada, con movimiento y sin modo
// liviano.
const ENTRANCE = {
  // Vuelo hasta el piso (s) y vueltas en el aire.
  flight: 1.15,
  turns: 1,
  // Punto de partida: desvío en fracciones del cuadro, cabeceo y alabeo
  // (rad). En móvil entra casi de costado y con poco cabeceo, para que el
  // zapato no suba hasta el encabezado.
  from: {
    desktop: { x: 0.62, y: 0.42, pitch: 0.55, bank: -0.45 },
    mobile: { x: 1.05, y: 0.035, pitch: 0.2, bank: -0.3 },
  },
  // Acercamiento a la cámara al partir (m).
  z: 0.14,
};
const TAN_HALF_FOV = Math.tan((FOV * Math.PI) / 360);

// Decide si toca la entrada con humo (en cada carga que empieza en la
// portada, también en modo liviano, con el atlas liviano: decisión del dueño
// del proyecto). Sin ella, la entrada normal: movimiento reducido o enlace
// directo a una sección. Las recargas más abajo se saltan aparte (la escena
// no está en la portada).
function planEntrance(reduced: boolean): boolean {
  return !(reduced || window.location.hash);
}

const YAW_PER_PX = 0.009;
const TILT_PER_PX = 0.004;
const MAX_TILT = (12 * Math.PI) / 180;
const KEY_STEP = (15 * Math.PI) / 180;
const TAU = Math.PI * 2;

// Normal aproximada de la superficie en un punto del zapato: la de un
// elipsoide con sus medidas (largo, alto y ancho), centrado a media altura.
// Sirve para saber si un punto queda de espaldas a la cámara.
function surfaceNormal([x, y, z]: Vec3, shoe: ShoeDims): Vec3 {
  const a = shoe.length / 2;
  const b = shoe.height / 2;
  const c = shoe.halfWidth;
  const normal: Vec3 = [x / (a * a), (y - b) / (b * b), z / (c * c)];
  const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  return [normal[0] / length, normal[1] / length, normal[2] / length];
}

// Visibilidad de un punto según cuánto mira a la cámara (ver facing en el
// rig): de canto todavía se ve (está en el borde de la silueta); de
// espaldas queda tenue (floor), pero nunca desaparece ni deja de poder
// tocarse: al elegirlo, el zapato gira para mostrarlo (pedido del dueño,
// sobre todo por el punto de la suela).
const FACING = { hidden: -0.4, shown: -0.15, floor: 0.4 };

const zeroPose = (): Pose => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0, scale: 1, idle: 0, rim: 1, shadow: 1, cx: 0, cy: 0, cz: 1, tx: 0, ty: 0, tz: 0 });
const zeroIntro = () => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 });

interface HeroApi {
  select(index: number): void;
  setStageActive(active: boolean): void;
  onSceneReady(dims: ShoeDims): void;
}

export function HeroClient({ content }: { content: HeroContent }) {
  const t = useTranslations('HomeHero');
  const format = useFormatter();
  const { hotspots, model, headline } = content;
  const total = hotspots.length;
  const pad = (value: number, digits = 2) => format.number(value, { minimumIntegerDigits: digits, useGrouping: false });

  const root = useRef<HTMLElement>(null);
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);
  const active = useStageActivity(stageElement);
  const [mounted, setMounted] = useState(false);
  // El lienzo se monta apenas la escena está a la vista: así la decodificación
  // del GLB y la compilación de shaders ocurren antes (o al inicio) de la
  // entrada del texto, con el lienzo todavía oculto.
  if (active && !mounted) setMounted(true);
  const lite = useMotionStore((state) => state.lite);
  const [ready, setReady] = useState(false);
  // Entrada con humo planeada o en curso (monta las partículas en la
  // escena); false cuando no toca o ya terminó.
  const [entrance, setEntrance] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [visited, setVisited] = useState<number[]>([]);
  const complete = total > 0 && visited.length === total;
  const titleId = useId();

  const rig = useRef<HeroRig>({
    pose: zeroPose(),
    intro: zeroIntro(),
    smoke: { time: -1 },
    follow: 1,
    spin: { yaw: 0, tilt: 0 },
    pointer: { x: 0, y: 0, targetX: 0, targetY: 0 },
    turn: 0,
    reducedMotion: false,
    onFrame: null,
    invalidate: null,
  });
  const api = useRef<HeroApi | null>(null);
  // Señales que sobreviven a un efecto repetido (Fast Refresh, StrictMode):
  // medidas del modelo ya cargado y si la entrada ya se reprodujo.
  const sceneDims = useRef<ShoeDims | null>(null);
  const introPlayed = useRef(false);
  // Lectura de movimiento reducido al montar (el store lo llena MotionRoot,
  // cuyo efecto corre después que los de sus hijos).
  const [reducedMotion, setReducedMotion] = useState(false);
  // Formateador y textos para los callbacks por cuadro (se leen fuera del render).
  const formatRef = useRef(format);
  const tRef = useRef(t);
  useEffect(() => {
    formatRef.current = format;
    tRef.current = t;
  }, [format, t]);

  const orientation = orientationFor(model.lateralSideFacing ?? '+z');

  useGSAP(
    (_context, contextSafe) => {
      const section = root.current;
      if (!section || !contextSafe) return;
      const q = <T extends Element = HTMLElement>(part: string) => section.querySelector<T>(`[data-part="${part}"]`);
      const qa = <T extends Element = HTMLElement>(part: string) => Array.from(section.querySelectorAll<T>(`[data-part="${part}"]`));
      const stage = q('stage');
      const halo = q('halo');
      const reticle = q('reticle');
      const reticleInner = q('reticle-inner');
      const tapeStrip = q<SVGSVGElement>('tape');
      const title = q('title');
      const grip = q('grip');
      const turnText = q('turn');
      const turnInspect = q('turn-inspect');
      const linesSvg = q<SVGSVGElement>('lines');
      const details = q('details');
      const cover = q('cover');
      const cue = q('cue');
      if (!stage || !halo || !reticle || !reticleInner || !tapeStrip || !title || !grip || !details || !cover || !linesSvg) return;
      const poster = q('poster');
      const leaders = qa<SVGPathElement>('leader');
      const marks = qa('mark');
      const spots = qa<HTMLButtonElement>('spot');
      const labels = qa('label');

      const reduced = !document.documentElement.classList.contains('motion-ok');
      const state = rig.current;
      // Descarga anticipada del GLB (solo red, sin decodificar): cuando se
      // monte el lienzo, useGLTF lo toma de la caché del navegador.
      const modelUrl = document.documentElement.classList.contains('lite') ? model.liteUrl : model.heroUrl;
      void fetch(modelUrl).catch(() => {});
      state.reducedMotion = reduced;
      setReducedMotion(reduced);
      setHydrated(true);

      // El zapato parte de su pose; la entrada (si toca) se arma en showModel,
      // justo antes de mostrar el 3D. Un efecto que se vuelve a ejecutar (Fast
      // Refresh) no puede dejarlo fuera de cuadro esperando una señal que ya pasó.
      state.intro = zeroIntro();
      state.smoke = { time: -1 };
      state.follow = 1;
      stage.removeAttribute('data-entrance');
      state.spin.yaw = 0;
      state.spin.tilt = 0;
      // Estado DOM que no maneja React: se reinicia por si el efecto corre de nuevo.
      section.dataset.slot = 'hero';
      stage.removeAttribute('data-callouts');
      stage.removeAttribute('data-spots');

      // Si el modelo ya estaba listo (useGLTF en caché, efecto repetido), se
      // usan sus medidas sin esperar a que la escena avise otra vez.
      let dims: ShoeDims = sceneDims.current ?? DEFAULT_SHOE;
      let layout: Layout = { width: 1, height: 1, aspect: 1, mobile: false };
      let poses: Record<string, Pose> = {};
      let poseName = 'hero';
      let mode: 'hero' | 'inspect' | 'away' = 'hero';
      let reticleOn = true;
      // Mientras se restaura el scroll (recarga, enlace profundo), los cambios
      // de modo son instantáneos: la página aparece ya en su estado correcto.
      let settling = true;
      let stageActive = true;
      let current = -1;
      let specsCounted = false;
      let moveTimeline: gsap.core.Timeline | null = null;
      let drift: gsap.core.Tween | null = null;
      // Zona alineada de los detalles (el bloque llegó arriba): recién ahí
      // aparecen marca, guía y etiqueta. aboveAlign: todavía no se llegó.
      let aligned = false;
      let aboveAlign = true;
      // El 3D ya se mostró (puede venir de una ejecución anterior del efecto).
      let shown = stage.hasAttribute('data-shown');
      // Entrada con humo: se decide una vez, con el 3D todavía sin mostrar.
      const entrancePlan = !shown && planEntrance(reduced);
      setEntrance(entrancePlan);
      // El atlas del humo se descarga junto con el modelo (solo red).
      if (entrancePlan) void fetch(document.documentElement.classList.contains('lite') ? SMOKE_ATLAS.lite : SMOKE_ATLAS.hero).catch(() => {});
      let entranceTimeline: gsap.core.Timeline | null = null;
      // Centro y escala del halo en la pose de portada (sin flotación): ahí
      // esperan halo y retícula mientras el zapato llega volando.
      const rest = { x: 0, y: 0, scale: 1 };
      const reticleBox = { width: 0, height: 0, tape: 0 };
      const anchors = hotspots.map(() => ({ x: 0, y: 0, side: 1 }));
      // Puntos sobre el zapato: normal de cada uno (se recalcula con las
      // medidas del modelo), última opacidad escrita y si está tapado.
      let normals = hotspots.map((spot) => surfaceNormal(spot.position as Vec3, dims));
      const spotOpacity = hotspots.map(() => -1);
      const spotHidden = hotspots.map(() => false);
      // Todos los puntos a la vista (modo detalle y zona alineada).
      let spotsOn = false;
      const leaderDraw = hotspots.map(() => ({ value: 0 }));
      // Rótulos de los detalles. live: los que se muestran (o están entrando);
      // tracked: los que todavía hay que posicionar (incluye los que salen).
      // Cada entrada tiene su propia línea de tiempo, fuera del movimiento de
      // cámara: detener la cámara nunca deja un rótulo a medio mostrar.
      const live = new Set<number>();
      const tracked = new Set<number>();
      const calloutTimelines = new Map<number, gsap.core.Timeline>();
      const gripRects: Record<string, ReturnType<typeof gripRect>> = {};
      const requestRender = () => state.invalidate?.();

      // ---------- Medidas (solo al refrescar, nunca por cuadro) ----------

      // Titular: las dos líneas comparten un tamaño que hace entrar la más
      // larga en la columna del texto (en escritorio, hasta la retícula menos
      // un respiro; en móvil, el ancho de la pantalla). offsetWidth no se ve
      // afectado por los giros de la entrada.
      function fitHeadline(boxLeft: number) {
        if (!title) return;
        title.style.removeProperty('--name-size');
        const size = parseFloat(getComputedStyle(title).fontSize);
        const left = title.getBoundingClientRect().left;
        const right = layout.mobile ? layout.width - left : boxLeft - 32;
        const widest = Math.max(...qa('line-inner').map((line) => line.offsetWidth));
        if (!widest || right - left <= 0) return;
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const fitted = Math.min((layout.mobile ? 5 : 7.5) * rem, (size * (right - left)) / widest) * 0.98;
        title.style.setProperty('--name-size', `${fitted.toFixed(1)}px`);
      }

      function measureAnchors() {
        labels.forEach((label, index) => {
          const side = label.dataset.side === 'right' ? 1 : -1;
          anchors[index] = { side, x: side > 0 ? label.offsetLeft - 12 : label.offsetLeft + label.offsetWidth + 12, y: label.offsetTop + 22 };
        });
        linesSvg?.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
      }

      // Retícula y halo en su lugar de la portada sin esperar al 3D (póster).
      function placeStatic(box: ReturnType<typeof heroBox>) {
        const hero = poses.hero;
        const distance = Math.hypot(hero.cx - hero.x, hero.cy - hero.y, hero.cz - hero.z);
        rest.x = box.centerX;
        rest.y = box.centerY;
        rest.scale = 1 / distance;
        halo!.style.transform = `translate3d(${box.centerX.toFixed(1)}px, ${box.centerY.toFixed(1)}px, 0) scale(${(1 / distance).toFixed(4)})`;
        halo!.dataset.placed = '';
        reticle!.style.transform = `translate3d(${(box.centerX - reticleBox.width / 2).toFixed(1)}px, ${(box.centerY - reticleBox.height / 2).toFixed(1)}px, 0)`;
        if (poster) {
          // El póster se calza sobre la vista en la que aparece el 3D (la pose
          // de portada sin cabeceo ni alabeo), así el relevo no salta.
          const hero = poses.hero;
          const rect = shoeRect({ ...hero, pitch: hero.pitch + SHOE_INTRO.pitch, bank: hero.bank + SHOE_INTRO.bank }, layout, dims);
          const width = (rect.right - rect.left) / POSTER_BOX.width;
          poster.style.width = `${Math.round(width)}px`;
          poster.style.transform = `translate3d(${(rect.left - POSTER_BOX.left * width).toFixed(1)}px, ${(rect.top - POSTER_BOX.top * width * POSTER_BOX.aspect).toFixed(1)}px, 0)`;
          poster.dataset.placed = '';
        }
      }

      // Columna libre del escritorio entre el texto (izquierda) y los datos
      // (derecha), como readLayout del prototipo. Solo coordenadas X.
      function measureFree() {
        if (layout.mobile) return null;
        const rects = (parts: string[]) =>
          parts.map((part) => q(part)?.getBoundingClientRect()).filter((rect): rect is DOMRect => !!rect && rect.width > 0);
        const from = Math.max(0, ...rects(['lead', 'actions', 'readout-list', 'details-head']).map((rect) => rect.right)) + 32;
        const to = Math.min(layout.width, ...rects(['cue', 'status']).map((rect) => rect.left)) - 32;
        return to - from > 280 ? { from, to } : null;
      }

      function relayout() {
        // Pestaña oculta o sin tamaño: no se mide (valores en cero dejarían
        // poses y escalas no finitas). Se vuelve a medir al volver.
        const width = stage!.clientWidth;
        const height = stage!.clientHeight;
        if (document.hidden || !width || !height) return;
        layout = { width, height, aspect: width / height, mobile: window.matchMedia(MOBILE_QUERY).matches, free: null };
        layout.free = measureFree();
        poses = computePoses(layout, dims, orientation, hotspots);
        normals = hotspots.map((spot) => surfaceNormal(spot.position as Vec3, dims));
        section!.toggleAttribute('data-mobile', layout.mobile);
        const box = heroBox(poses, layout, dims);
        // Móvil: el texto de la portada empieza debajo de la retícula.
        if (layout.mobile) section!.style.setProperty('--hero-stage', `${Math.round(box.bottom + 18)}px`);
        else section!.style.removeProperty('--hero-stage');
        fitHeadline(box.left);

        reticleBox.width = Math.round(box.width);
        reticleBox.height = Math.round(box.height);
        reticleBox.tape = Math.round(Math.min(box.width * 0.6, 300));
        reticle!.style.width = `${reticleBox.width}px`;
        reticle!.style.height = `${reticleBox.height}px`;
        reticle!.style.setProperty('--tape-width', `${reticleBox.tape}px`);
        // Halo: tamaño base a un metro; cada cuadro escala por 1 / distancia.
        const perMeter = pixelsPerMeter(layout);
        halo!.style.setProperty('--halo-width', `${Math.round(0.8 * perMeter)}px`);
        halo!.style.setProperty('--halo-height', `${Math.round(0.52 * perMeter)}px`);
        placeStatic(box);
        measureAnchors();
        for (const name of ['hero', 'transit', ...hotspots.map((_, index) => `spot${index}`)]) if (poses[name]) gripRects[name] = gripRect(poses[name], layout, dims);
        // Con el nuevo tamaño, la pose actual se recalcula sin reiniciar nada.
        if (!gsap.isTweening(state.pose) && poses[poseName]) Object.assign(state.pose, poses[poseName]);
        placeGrip();
        requestRender();
      }

      // ---------- Lecturas y rótulos que siguen al zapato ----------

      let lastTurn = -1;
      let lastAria = -1;
      let dragging = false;
      function updateTurn() {
        if (state.turn === lastTurn) return;
        lastTurn = state.turn;
        const text = formatRef.current.number(state.turn, { minimumIntegerDigits: 3, useGrouping: false });
        if (turnText) turnText.textContent = text;
        if (turnInspect) turnInspect.textContent = text;
      }
      // El valor del control es el mismo giro que muestra la lectura "Giro".
      function updateAria() {
        if (state.turn === lastAria) return;
        lastAria = state.turn;
        grip!.setAttribute('aria-valuenow', String(state.turn));
        grip!.setAttribute('aria-valuetext', tRef.current('gripValue', { degrees: state.turn }));
      }

      // Guía en codo: diagonal a 45° desde el punto y luego horizontal hasta la etiqueta.
      function drawLeader(index: number, x0: number, y0: number) {
        const { x: ax, y: ay, side } = anchors[index];
        let x1 = x0 + side * Math.abs(ay - y0);
        if (side * (ax - x1) < 28) x1 = ax - side * 28;
        const length = Math.hypot(x1 - x0, ay - y0) + Math.abs(ax - x1);
        const path = leaders[index];
        path.setAttribute('d', `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${ay.toFixed(1)}H${ax.toFixed(1)}`);
        path.style.strokeDasharray = `${length.toFixed(1)} ${(length + 1).toFixed(1)}`;
        path.style.strokeDashoffset = (length * (1 - leaderDraw[index].value)).toFixed(1);
      }

      // Un punto de espaldas a la cámara queda tenue (data-occluded), pero
      // sigue recibiendo clics y foco. Solo se escribe al DOM cuando el valor
      // cambia de verdad.
      function applyFacing(index: number, facing: number) {
        const amount = Math.min(1, Math.max(0, (facing - FACING.hidden) / (FACING.shown - FACING.hidden)));
        const opacity = FACING.floor + (1 - FACING.floor) * amount * amount * (3 - 2 * amount);
        if (Math.abs(opacity - spotOpacity[index]) > 0.02 || (opacity !== spotOpacity[index] && (opacity === 0 || opacity === 1))) {
          spotOpacity[index] = opacity;
          spots[index].style.opacity = opacity.toFixed(2);
        }
        const hidden = amount < 0.5;
        if (hidden === spotHidden[index]) return;
        spotHidden[index] = hidden;
        spots[index].toggleAttribute('data-occluded', hidden);
      }

      // Muestra u oculta todos los puntos (compuerta data-spots del CSS).
      function syncSpots() {
        const on = mode === 'inspect' && aligned;
        if (on === spotsOn) return;
        spotsOn = on;
        stage!.toggleAttribute('data-spots', on);
        requestRender();
      }

      state.onFrame = (project, distance, facing) => {
        const center = project([0, dims.height / 2, 0]);
        let cx = center.x;
        let cy = center.y;
        // Nunca se escriben transformaciones no finitas (NaN deja la escena vacía).
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(distance) || distance <= 0) return;
        let haloScale = state.pose.scale / distance;
        // Durante el vuelo de la entrada, halo y retícula esperan en la
        // portada y se suman al zapato cuando aterriza.
        const follow = Math.min(1, Math.max(0, state.follow));
        if (follow < 1) {
          cx = rest.x + (cx - rest.x) * follow;
          cy = rest.y + (cy - rest.y) * follow;
          haloScale = rest.scale + (haloScale - rest.scale) * follow;
        }
        halo!.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) scale(${haloScale.toFixed(4)})`;
        if (reticleOn) {
          reticle!.style.transform = `translate3d(${(cx - reticleBox.width / 2).toFixed(1)}px, ${(cy - reticleBox.height / 2).toFixed(1)}px, 0)`;
          tapeStrip!.style.transform = `translate3d(${(reticleBox.tape / 2 - (state.turn + 60) * TAPE_PX_PER_DEG).toFixed(1)}px, 0, 0)`;
        }
        updateTurn();
        if (dragging || document.activeElement === grip || gsap.isTweening(state.spin)) updateAria();
        // Cada punto sigue al zapato (también el activo, con su guía).
        if (!spotsOn && tracked.size === 0) return;
        for (let index = 0; index < spots.length; index++) {
          const isTracked = tracked.has(index);
          if (!spotsOn && !isTracked) continue;
          const position = hotspots[index].position as Vec3;
          const point = project(position);
          const x = point.x;
          const y = point.y;
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          spots[index].style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          if (isTracked && !layout.mobile) drawLeader(index, x, y);
          applyFacing(index, facing(position, normals[index]));
        }
      };

      // ---------- Poses y recorrido "Pieza por pieza" ----------

      function stopMotion() {
        moveTimeline?.kill();
        drift?.kill();
        moveTimeline = drift = null;
        gsap.killTweensOf(state.pose);
      }

      function moveTo(name: string, duration: number) {
        stopMotion();
        poseName = name;
        if (reduced || duration === 0) {
          Object.assign(state.pose, poses[name]);
          requestRender();
          return;
        }
        gsap.to(state.pose, { ...poses[name], duration, ease: EASE.inOut.gsap });
      }

      function calloutIn(index: number, instant: boolean, delay = 0) {
        const mark = marks[index];
        const label = labels[index];
        const leader = leaders[index];
        calloutTimelines.get(index)?.kill();
        gsap.killTweensOf([mark, mark.children, label, leader, leaderDraw[index]]);
        live.add(index);
        tracked.add(index);
        if (reduced || instant) {
          leaderDraw[index].value = 1;
          gsap.set([mark, leader, label], { opacity: 1, x: 0 });
          gsap.set(mark.children, { scale: 1 });
          requestRender();
          return;
        }
        leaderDraw[index].value = 0;
        const side = label.dataset.side === 'right' ? 1 : -1;
        calloutTimelines.set(
          index,
          gsap
            .timeline({ delay })
            .set([mark, leader], { opacity: 1 })
            .fromTo(mark.children, { scale: 0 }, { scale: 1, duration: 0.45, ease: 'back.out(2)', stagger: 0.06 }, 0)
            .to(leaderDraw[index], { value: 1, duration: 0.6, ease: 'power2.inOut' }, 0.15)
            .fromTo(label, { opacity: 0, x: 18 * side }, { opacity: 1, x: 0, duration: 0.6, ease: EASE.out.gsap }, 0.5),
        );
      }

      function calloutsOut(except = -1) {
        for (const index of [...tracked]) {
          if (index === except) continue;
          const parts = [marks[index], labels[index], leaders[index]];
          calloutTimelines.get(index)?.kill();
          calloutTimelines.delete(index);
          gsap.killTweensOf([...parts, leaderDraw[index]]);
          live.delete(index);
          if (reduced) {
            gsap.set(parts, { opacity: 0 });
            tracked.delete(index);
          } else {
            gsap.to(parts, { opacity: 0, duration: 0.3, ease: 'power1.out', onComplete: () => tracked.delete(index) });
          }
        }
        requestRender();
      }

      // Todos los rótulos fuera, sin animar (portada, recarga, efecto repetido).
      function resetCallouts() {
        for (const timeline of calloutTimelines.values()) timeline.kill();
        calloutTimelines.clear();
        const parts = [...marks, ...labels, ...leaders];
        gsap.killTweensOf([...parts, ...leaderDraw]);
        gsap.set(parts, { opacity: 0 });
        live.clear();
        tracked.clear();
        // Los rótulos solo existen fuera de la portada (ver data-callouts en el CSS).
        stage!.removeAttribute('data-callouts');
      }

      function startDrift(name: string) {
        if (reduced) return;
        drift = gsap.fromTo(state.pose, { ...poses[name] }, { ...poses[`${name}b`], duration: TIMING.drift, ease: 'sine.inOut', repeat: -1, yoyo: true });
        // La deriva es un bucle: solo corre con el lienzo a la vista.
        if (!stageActive || mode !== 'inspect') drift.pause();
      }

      // Presenta el detalle activo: cámara por tiempo y luego su rótulo.
      // Pose del detalle según la zona: tránsito (escritorio, mientras los
      // bloques se cruzan) o primer plano.
      const poseFor = (index: number) => (aboveAlign && !layout.mobile && poses.transit ? 'transit' : `spot${index}`);

      function present({ entrance = false, instant = false } = {}) {
        syncSpots();
        if (mode !== 'inspect' || current < 0) return;
        const name = poseFor(current);
        const showCallout = aligned;
        calloutsOut(showCallout ? current : -1);
        stopMotion();
        poseName = name;
        placeGrip();
        if (reduced || instant) {
          Object.assign(state.pose, poses[name]);
          if (showCallout) calloutIn(current, true);
          if (name.startsWith('spot')) startDrift(name);
          requestRender();
          return;
        }
        const duration = entrance ? TIMING.entrance : TIMING.move;
        moveTimeline = gsap.timeline().to(state.pose, { ...poses[name], duration, ease: EASE.inOut.gsap }, 0);
        if (showCallout && !live.has(current)) calloutIn(current, false, Math.max(0, duration - 0.45));
        // En primer plano, un vaivén lento mantiene vivo el plano mientras se lee.
        if (name.startsWith('spot')) moveTimeline.add(() => startDrift(name));
      }

      // Zona alineada: los rótulos aparecen o se van (por tiempo) y la pose se ajusta.
      function setAligned(isAligned: boolean, isAbove: boolean) {
        if (isAligned === aligned && isAbove === aboveAlign) return;
        aligned = isAligned;
        aboveAlign = isAbove;
        syncSpots();
        if (mode !== 'inspect') {
          if (!aligned) calloutsOut();
          return;
        }
        if (!aligned) {
          calloutsOut();
          // Bajando más allá de la zona, el zapato se queda en su plano (ya se
          // mueve junto con el bloque); subiendo, vuelve a la columna libre.
          if (aboveAlign && !layout.mobile) present({ instant: settling });
          return;
        }
        present({ instant: settling });
      }

      // Las especificaciones cuentan desde cero la primera vez, como un
      // instrumento que se estabiliza (el dato real ya está en el HTML).
      function countSpecs() {
        if (specsCounted || reduced || settling) {
          specsCounted = true;
          return;
        }
        specsCounted = true;
        for (const element of qa('spec-count')) {
          const target = Number(element.dataset.value);
          const digits = Number(element.dataset.digits) || 2;
          const counter = { value: 0 };
          gsap.to(counter, {
            value: target,
            duration: 1.2,
            ease: 'power2.out',
            onUpdate: () => {
              element.textContent = formatRef.current.number(Math.round(counter.value), { minimumIntegerDigits: digits, useGrouping: false });
            },
          });
        }
      }

      function setInspectMode(instant: boolean) {
        mode = 'inspect';
        // Fuera de la portada el póster no corresponde a la pose: si el 3D
        // todavía no llegó, no se muestra (nunca dos zapatos en lugares distintos).
        stage!.setAttribute('data-poster-off', '');
        stage!.setAttribute('data-callouts', '');
        reticleOn = false;
        gsap.to(reticle, { opacity: 0, duration: reduced || instant ? 0 : 0.4, overwrite: true });
        countSpecs();
      }

      // Escritorio: la escena es sticky (se queda arriba mientras se cruzan
      // portada y detalles) y el zapato viaja hacia abajo por tiempo. Móvil:
      // como el prototipo, la escena va en el lugar de la portada o en el de
      // los detalles y se desplaza con su bloque; el cambio es un fundido corto.
      let slot: 'hero' | 'details' = 'hero';
      function updateSlot(instant: boolean) {
        const next = layout.mobile && mode !== 'hero' ? 'details' : 'hero';
        if (next === slot) return;
        slot = next;
        gsap.killTweensOf(stage);
        const apply = () => {
          section!.dataset.slot = slot;
          // El lienzo cambió de lugar: las anclas de las etiquetas también.
          measureAnchors();
          placeGrip();
          requestRender();
        };
        if (instant || reduced) {
          apply();
          gsap.set(stage, { opacity: 1 });
          return;
        }
        gsap
          .timeline()
          .to(stage, { opacity: 0, duration: 0.18, ease: 'power1.in' })
          .add(apply)
          .to(stage, { opacity: 1, duration: 0.45, ease: 'power1.out' });
      }

      function select(index: number, { entrance = false, instant = false } = {}) {
        if (mode !== 'inspect') {
          setInspectMode(instant);
          updateSlot(instant);
        }
        if (index === current && !entrance && (moveTimeline || drift)) return;
        current = index;
        setActiveIndex(index);
        setVisited((list) => (list.includes(index) ? list : [...list, index]));
        resetSpin(reduced || instant ? 0 : TIMING.move);
        present({ entrance, instant });
      }

      function enterDetails() {
        if (mode === 'inspect') return;
        const instant = settling;
        setInspectMode(instant);
        updateSlot(instant);
        select(Math.max(current, 0), { entrance: true, instant });
      }

      function enterHero() {
        if (mode === 'hero') return;
        const instant = settling || reduced;
        mode = 'hero';
        syncSpots();
        stage!.removeAttribute('data-poster-off');
        updateSlot(instant);
        // En la portada nunca hay rótulos: se cortan de inmediato (y la
        // compuerta del CSS los oculta aunque quedara algún estilo en línea).
        resetCallouts();
        moveTo('hero', instant ? 0 : TIMING.mode);
        resetSpin(instant ? 0 : TIMING.mode);
        placeGrip();
        reticleOn = true;
        gsap.to(reticle, { opacity: 1, duration: instant ? 0 : 0.6, delay: instant ? 0 : 0.7, overwrite: true });
        requestRender();
      }

      // El bloque de detalles quedó atrás: la deriva se pausa.
      function leaveDown() {
        mode = 'away';
        syncSpots();
        drift?.pause();
      }

      // ---------- Giro con el mouse, el dedo o el teclado ----------
      // El área de arrastre cubre solo la caja del zapato: el texto y los
      // botones siguen recibiendo clics. Horizontal gira (360°), vertical
      // inclina (±12°). Al soltar hay inercia suave y, tras 1,5 s sin tocar,
      // vuelve a la pose.
      let spinReturn: gsap.core.Tween | null = null;
      let dimmed = false;
      let lastPointer = { x: 0, y: 0, t: 0 };
      let spinVelocity = 0;
      let keyTarget = 0;
      let keyTween: gsap.core.Tween | null = null;

      function placeGrip() {
        const rect = gripRects[mode === 'hero' ? 'hero' : poseName];
        if (!rect) return;
        grip!.style.width = `${rect.width}px`;
        grip!.style.height = `${rect.height}px`;
        grip!.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
      }

      // Mientras se gira un detalle, su marca, guía y etiqueta se apartan.
      function dimCallout(hide: boolean) {
        if (hide === dimmed) return;
        dimmed = hide;
        if (mode !== 'inspect' || current < 0 || !live.has(current)) return;
        if (!hide) {
          leaderDraw[current].value = 1;
          gsap.set(labels[current], { x: 0 });
          gsap.set(marks[current].children, { scale: 1 });
        }
        gsap.to([marks[current], leaders[current], labels[current]], { opacity: hide ? 0 : 1, duration: reduced ? 0 : hide ? 0.25 : 0.5, overwrite: true });
        requestRender();
      }

      function returnSpin(duration = reduced ? 0 : 1.2, restore = true) {
        spinReturn?.kill();
        spinReturn = null;
        gsap.killTweensOf(state.spin);
        const finish = () => {
          state.spin.yaw = 0;
          state.spin.tilt = 0;
          if (restore) dimCallout(false);
          requestRender();
        };
        if (duration === 0 || (state.spin.yaw === 0 && state.spin.tilt === 0)) {
          finish();
          return;
        }
        // Vuelve por el camino más corto (vueltas completas cuentan como cero).
        gsap.to(state.spin, { yaw: Math.round(state.spin.yaw / TAU) * TAU, tilt: 0, duration, ease: 'power3.inOut', onComplete: finish });
      }

      function resetSpin(duration: number) {
        dimmed = false;
        returnSpin(duration, false);
      }

      const scheduleReturn = () => {
        spinReturn?.kill();
        spinReturn = gsap.delayedCall(1.5, () => returnSpin());
      };

      const onPointerDown = contextSafe((event: PointerEvent) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        dragging = true;
        grip.classList.add(styles.grabbing);
        grip.setPointerCapture?.(event.pointerId);
        spinReturn?.kill();
        gsap.killTweensOf(state.spin);
        lastPointer = { x: event.clientX, y: event.clientY, t: event.timeStamp };
        spinVelocity = 0;
        state.pointer.targetX = 0;
        state.pointer.targetY = 0;
        dimCallout(true);
      });
      const onPointerMove = (event: PointerEvent) => {
        if (!dragging) return;
        const dx = event.clientX - lastPointer.x;
        const dy = event.clientY - lastPointer.y;
        const dt = Math.max(event.timeStamp - lastPointer.t, 1) / 1000;
        state.spin.yaw += dx * YAW_PER_PX;
        state.spin.tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, state.spin.tilt + dy * TILT_PER_PX));
        spinVelocity = spinVelocity * 0.6 + ((dx * YAW_PER_PX) / dt) * 0.4;
        lastPointer = { x: event.clientX, y: event.clientY, t: event.timeStamp };
        requestRender();
      };
      const release = contextSafe((event: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        grip.classList.remove(styles.grabbing);
        // Inercia suave al soltar (solo si el gesto venía en movimiento).
        if (!reduced && event.timeStamp - lastPointer.t < 90 && Math.abs(spinVelocity) > 0.3) {
          const throwBy = Math.max(-2.4, Math.min(2.4, spinVelocity * 0.28));
          gsap.to(state.spin, { yaw: state.spin.yaw + throwBy, duration: 1, ease: 'power3.out' });
        }
        updateAria();
        scheduleReturn();
      });
      // Teclado: flechas giran de a 15°, Inicio vuelve a la pose.
      const onGripKey = contextSafe((event: globalThis.KeyboardEvent) => {
        if (event.key === 'Home') {
          event.preventDefault();
          returnSpin(reduced ? 0 : 0.6);
          return;
        }
        const step = ({ ArrowRight: KEY_STEP, ArrowUp: KEY_STEP, ArrowLeft: -KEY_STEP, ArrowDown: -KEY_STEP } as Record<string, number>)[event.key];
        if (step === undefined) return;
        event.preventDefault();
        spinReturn?.kill();
        dimCallout(true);
        // Pulsaciones seguidas se acumulan aunque el giro anterior no haya terminado.
        keyTarget = (keyTween && keyTween.progress() < 1 ? keyTarget : state.spin.yaw) + step;
        if (reduced) {
          gsap.killTweensOf(state.spin);
          state.spin.yaw = keyTarget;
          requestRender();
        } else {
          keyTween = gsap.to(state.spin, { yaw: keyTarget, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
        }
        scheduleReturn();
      });
      grip.addEventListener('pointerdown', onPointerDown);
      grip.addEventListener('pointermove', onPointerMove);
      grip.addEventListener('pointerup', release);
      grip.addEventListener('pointercancel', release);
      grip.addEventListener('lostpointercapture', release);
      grip.addEventListener('keydown', onGripKey);

      // Paralaje del puntero (solo escritorio y con movimiento): valores en el rig.
      const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const onWindowPointer = (event: PointerEvent) => {
        if (dragging) return;
        state.pointer.targetX = (event.clientX / window.innerWidth) * 2 - 1;
        state.pointer.targetY = (event.clientY / window.innerHeight) * 2 - 1;
      };
      if (!reduced && fine) window.addEventListener('pointermove', onWindowPointer, { passive: true });

      // ---------- Disparadores de modo (sin pin ni scrub) ----------
      // Los detalles se activan cuando su bloque ocupa un 40% de la ventana;
      // ScrollTrigger solo dispara el cambio, la cámara se mueve por tiempo.
      const zone = ScrollTrigger.create({
        trigger: details,
        start: 'top 60%',
        end: 'bottom 50%',
        onEnter: contextSafe(enterDetails),
        onEnterBack: contextSafe(enterDetails),
        onLeave: contextSafe(leaveDown),
        onLeaveBack: contextSafe(enterHero),
      });
      // Zona alineada: el bloque llegó arriba (escritorio: la escena está fija).
      const alignTrigger = ScrollTrigger.create({
        trigger: details,
        start: 'top 12%',
        end: 'bottom 70%',
        onEnter: contextSafe(() => setAligned(true, false)),
        onEnterBack: contextSafe(() => setAligned(true, false)),
        onLeave: contextSafe(() => setAligned(false, false)),
        onLeaveBack: contextSafe(() => setAligned(false, true)),
      });
      // La pista "Baja para ver los detalles" se retira apenas empieza a bajar.
      const cueTrigger = cue
        ? ScrollTrigger.create({
            trigger: section,
            start: () => `top+=${Math.round(window.innerHeight * 0.12)} top`,
            end: 'max',
            onToggle: (self) => gsap.to(cue, { opacity: self.isActive ? 0 : 1, duration: reduced || settling ? 0 : 0.4, overwrite: true }),
          })
        : null;

      const onRefreshInit = () => relayout();
      ScrollTrigger.addEventListener('refreshInit', onRefreshInit);
      relayout();
      // Al volver a la pestaña: se mide de nuevo (solo visible y con tamaño)
      // y se pide un cuadro.
      const onVisibility = () => {
        if (document.hidden) return;
        requestAnimationFrame(() => {
          relayout();
          requestRender();
        });
      };
      document.addEventListener('visibilitychange', onVisibility);
      // Con entrada planeada, el zapato espera en su punto de partida.
      if (entrancePlan) {
        Object.assign(state.intro, entranceStart());
        state.follow = 0;
      }

      // Bucles CSS (barrido de luz, rombo, pulsos) solo con la sección a la vista.
      let heroOnScreen = true;
      let sweepReady = false;
      const syncSweep = () => section.toggleAttribute('data-sweep', sweepReady && heroOnScreen && !reduced);
      const liveObserver = new IntersectionObserver(([entry]) => section.toggleAttribute('data-live', entry.isIntersecting));
      liveObserver.observe(section);
      const coverObserver = new IntersectionObserver(([entry]) => {
        heroOnScreen = entry.isIntersecting;
        syncSweep();
      });
      coverObserver.observe(cover);

      // ---------- Entrada de la portada ----------
      const lineEls = qa('line');
      const firstChars = lineEls[0] ? Array.from(lineEls[0].querySelectorAll<HTMLElement>('[data-char]')) : [];
      const secondChars = lineEls[1] ? Array.from(lineEls[1].querySelectorAll<HTMLElement>('[data-char]')) : [];
      const secondFills = secondChars.map((char) => char.firstElementChild as HTMLElement);
      let heroReveal: gsap.core.Timeline | null = null;
      let leadSplit: SplitText | null = null;
      let introFinished = false;

      function finishIntro() {
        if (introFinished) return;
        introFinished = true;
        introPlayed.current = true;
        leadSplit?.revert();
        leadSplit = null;
        // Cada letra vuelve a la suya (el texto de React nunca cambió de nodo).
        for (const char of firstChars) {
          const node = char.firstElementChild?.firstChild;
          if (node) node.nodeValue = char.dataset.char ?? '';
        }
        setIntroDone(true);
        sweepReady = !reduced;
        syncSweep();
      }

      // Letras tipo tablero: cada una gira sobre su eje horizontal, pasa por
      // un par de caracteres al azar y se asienta. La segunda línea entra como
      // contorno en el acento y luego se rellena.
      function nameTimeline() {
        const timeline = gsap.timeline();
        const flip = { rotationX: -100, opacity: 0, yPercent: 18, transformOrigin: '50% 50% -0.35em' };
        timeline.fromTo(firstChars, flip, { rotationX: 0, opacity: 1, yPercent: 0, duration: 0.5, stagger: 0.04, ease: EASE.out.gsap }, 0);
        firstChars.forEach((char, index) => {
          const node = char.firstElementChild?.firstChild;
          const final = char.dataset.char ?? '';
          if (!node) return;
          let last = '';
          const scramble = { progress: 0 };
          timeline.to(
            scramble,
            {
              progress: 1,
              duration: 0.42,
              ease: 'none',
              onUpdate: () => {
                const next = scramble.progress < 0.65 ? GLYPHS[(Math.floor(scramble.progress * 40) + index * 7) % GLYPHS.length] : final;
                if (next !== last) node.nodeValue = last = next;
              },
              onComplete: () => {
                node.nodeValue = final;
              },
            },
            index * 0.04,
          );
        });
        const secondStart = 0.22 + firstChars.length * 0.02;
        timeline
          .set(secondFills, { opacity: 0 }, 0)
          .fromTo(secondChars, flip, { rotationX: 0, opacity: 1, yPercent: 0, duration: 0.5, stagger: 0.035, ease: EASE.out.gsap }, secondStart)
          .to(secondFills, { opacity: 1, duration: 0.4, stagger: 0.025, ease: 'power1.out' }, secondStart + 0.45);
        return timeline;
      }

      function revealHero() {
        // Se marca al empezar: si el efecto se repite a mitad de la entrada,
        // la segunda vez todo aparece directo en su estado final.
        introPlayed.current = true;
        const lead = q('lead');
        const instruments = q('instruments');
        const timeline = gsap.timeline({
          onComplete: () => {
            heroReveal = null;
            finishIntro();
          },
        });
        timeline
          .fromTo(q('kicker'), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: DURATION.reveal }, 0)
          .add(nameTimeline(), 0.1);
        if (lead) {
          leadSplit = SplitText.create(lead, { type: 'lines', mask: 'lines' });
          timeline.set(lead, { opacity: 1 }, 0.75).from(leadSplit.lines, { yPercent: 110, duration: DURATION.reveal, stagger: 0.08 }, 0.75);
        }
        timeline
          .fromTo(qa('action'), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: DURATION.reveal, stagger: 0.08 }, 0.95)
          .fromTo(instruments, { '--rule-scale': 0 }, { '--rule-scale': 1, duration: DURATION.cinematic, ease: EASE.inOut.gsap }, 0.6)
          .fromTo(qa('reveal-item'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: DURATION.reveal, stagger: 0.05 }, 1)
          .fromTo(reticleInner, { opacity: 0, scale: 1.16 }, { opacity: 1, scale: 1, duration: DURATION.cinematic }, 0.95)
          .fromTo(qa('reticle-text'), { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.1 }, 1.1);
        heroReveal = timeline;
      }

      // Si algo recibe el foco antes de que termine, la entrada se completa al instante.
      const onFocusIn = () => {
        if (heroReveal) heroReveal.progress(1);
        else finishIntro();
      };
      cover.addEventListener('focusin', onFocusIn);

      // Muestra el 3D cuando el modelo está listo y el scroll ya se restauró.
      // El póster se apaga primero (POSTER_OUT) y el lienzo aparece después
      // (CSS, .stage[data-shown]); si toca la entrada, el zapato sale del
      // mismo lugar del póster. Así nunca hay dos zapatos a la vez.
      function showModel() {
        if (shown || !sceneDims.current || settling) return;
        shown = true;
        posterTimer?.kill();
        state.follow = 1;
        const atHero = !reduced && mode === 'hero' && window.scrollY < window.innerHeight * 0.5;
        const posterShown = stage!.hasAttribute('data-poster') && !stage!.hasAttribute('data-poster-off');
        if (atHero && posterShown) {
          // Respaldo: relevo desde el póster, en su misma vista; empieza cuando
          // el lienzo empieza a verse (tras apagarse el póster, ver CSS).
          Object.assign(state.intro, { ...zeroIntro(), yaw: -orientation.yawSign * TAU * SHOE_INTRO.turns, pitch: SHOE_INTRO.pitch, bank: SHOE_INTRO.bank });
          gsap.to(state.intro, { ...zeroIntro(), duration: SHOE_INTRO.duration, delay: DURATION.ui, ease: EASE.inOut.gsap });
        } else if (atHero && entrancePlan) {
          playEntrance();
        } else if (atHero) {
          // Camino normal: entra ya girando, a la vez que el fundido del lienzo.
          Object.assign(state.intro, { ...zeroIntro(), yaw: -orientation.yawSign * TAU * SHOE_ENTER.turns, y: SHOE_ENTER.y });
          gsap.to(state.intro, { ...zeroIntro(), duration: SHOE_ENTER.duration, ease: SHOE_ENTER.ease });
        } else {
          // Fuera de la portada: directo en su pose (por si esperaba una entrada).
          Object.assign(state.intro, zeroIntro());
        }
        // Sin entrada con humo, las partículas se desmontan sin haberse usado.
        if (!entranceTimeline) setEntrance(false);
        stage!.setAttribute('data-shown', '');
        requestRender();
      }

      // Punto de partida de la entrada con humo. Se aplica también mientras
      // carga el modelo: los cuadros de "listo" ya dibujan el zapato fuera de
      // cuadro, así que el primer cuadro visible nunca es un zapato quieto en
      // su pose.
      function entranceStart() {
        const hero = poses.hero;
        const depth = hero ? Math.hypot(hero.cx - hero.x, hero.cy - hero.y, hero.cz - hero.z) : 1;
        const viewHeight = 2 * depth * TAN_HALF_FOV;
        const from = layout.mobile ? ENTRANCE.from.mobile : ENTRANCE.from.desktop;
        return {
          ...zeroIntro(),
          x: from.x * viewHeight * layout.aspect,
          y: from.y * viewHeight,
          z: ENTRANCE.z,
          yaw: -orientation.yawSign * TAU * ENTRANCE.turns,
          pitch: from.pitch,
          bank: from.bank,
        };
      }

      // Entrada con humo (ver ENTRANCE). Todo por tiempo en una línea de
      // GSAP sobre el rig: si la pestaña se oculta a mitad, al volver la
      // línea salta a su final (lagSmoothing(0)) y onComplete deja la escena
      // en su pose, sin humo. Las partículas se desmontan al terminar.
      function playEntrance() {
        // El lienzo se ve sin fundido: el zapato arranca fuera de cuadro, así
        // que el primer cuadro visible ya se mueve.
        stage!.setAttribute('data-entrance', '');
        const finish = () => {
          entranceTimeline = null;
          Object.assign(state.intro, zeroIntro());
          state.smoke.time = -1;
          state.follow = 1;
          stage!.removeAttribute('data-entrance');
          setEntrance(false);
          requestRender();
        };
        const timeline = gsap.timeline({ onComplete: finish });
        Object.assign(state.intro, entranceStart());
        const flight = ENTRANCE.flight;
        state.follow = 0;
        // Arco: avanza rápido hacia la izquierda y cae cada vez más rápido.
        timeline
          .to(state.intro, { x: 0, duration: flight, ease: 'power2.out' }, 0)
          .to(state.intro, { z: 0, duration: flight, ease: 'power1.out' }, 0)
          .to(state.intro, { y: 0, duration: flight, ease: 'power2.in' }, 0)
          .to(state.intro, { yaw: 0, duration: 2.1, ease: 'power3.out' }, 0)
          .to(state.intro, { pitch: 0, bank: 0, duration: 1.5, ease: 'power2.out' }, 0)
          // Toque: un rebote corto y se asienta.
          .to(state.intro, { y: 0.008, duration: 0.16, ease: 'power2.out' }, flight)
          .to(state.intro, { y: 0, duration: 0.4, ease: 'power2.inOut' }, flight + 0.16)
          .fromTo(state.smoke, { time: 0 }, { time: SMOKE_LIFE, duration: SMOKE_LIFE, ease: 'none' }, flight - 0.05)
          .to(state, { follow: 1, duration: 0.7, ease: EASE.inOut.gsap }, flight - 0.3);
        entranceTimeline = timeline;
      }

      // Respaldo (accesibilidad y modelo lento o con error): si el 3D no llegó
      // en POSTER_AFTER segundos, aparece el póster en el lugar del zapato.
      const posterTimer = shown || !poster ? null : gsap.delayedCall(POSTER_AFTER, () => {
        if (!shown) stage!.setAttribute('data-poster', '');
      });

      // Estado correcto tras la restauración del scroll: modo, zona y pose
      // salen de los disparadores, sin animar.
      function syncWithScroll() {
        if (zone.isActive) enterDetails();
        else if (zone.progress === 1 && mode === 'hero') {
          setInspectMode(true);
          updateSlot(true);
          select(Math.max(current, 0), { entrance: true, instant: true });
          leaveDown();
        }
        aligned = alignTrigger.isActive;
        aboveAlign = alignTrigger.progress === 0 && !alignTrigger.isActive;
        if (mode === 'inspect') present({ instant: true });
        syncSpots();
        updateSlot(true);
      }

      // Decide la entrada cuando la página ya tiene su alto final y el scroll
      // restaurado (MotionRoot lo hace tras las fuentes y dos cuadros).
      let killed = false;
      void document.fonts.ready.then(() =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            requestAnimationFrame(
              contextSafe(() => {
                if (killed) return;
                // La entrada se ve una sola vez por montaje real: con movimiento
                // reducido, al recargar más abajo o si el efecto se repite, todo
                // queda directo en su estado final.
                if (reduced || introPlayed.current || window.scrollY > window.innerHeight * 0.5) finishIntro();
                else revealHero();
                syncWithScroll();
                settling = false;
                showModel();
              }),
            ),
          ),
        ),
      );

      // ---------- API para los controles de React ----------
      api.current = {
        select: contextSafe((index: number) => {
          select(index);
          // Si el bloque todavía no llegó arriba, se lo acerca para ver el rótulo.
          if (details.getBoundingClientRect().top > window.innerHeight * 0.25) scrollToElement(details);
        }),
        setStageActive: contextSafe((isActive: boolean) => {
          stageActive = isActive;
          if (isActive && mode === 'inspect') drift?.resume();
          else drift?.pause();
        }),
        onSceneReady: contextSafe((measured: ShoeDims) => {
          dims = measured;
          relayout();
          showModel();
        }),
      };

      return () => {
        killed = true;
        entranceTimeline?.kill();
        state.onFrame = null;
        api.current = null;
        stopMotion();
        zone.kill();
        alignTrigger.kill();
        cueTrigger?.kill();
        leadSplit?.revert();
        ScrollTrigger.removeEventListener('refreshInit', onRefreshInit);
        document.removeEventListener('visibilitychange', onVisibility);
        liveObserver.disconnect();
        coverObserver.disconnect();
        cover.removeEventListener('focusin', onFocusIn);
        grip.removeEventListener('pointerdown', onPointerDown);
        grip.removeEventListener('pointermove', onPointerMove);
        grip.removeEventListener('pointerup', release);
        grip.removeEventListener('pointercancel', release);
        grip.removeEventListener('lostpointercapture', release);
        grip.removeEventListener('keydown', onGripKey);
        window.removeEventListener('pointermove', onWindowPointer);
      };
    },
    { scope: root },
  );

  // El lienzo deja de dibujar cuando otro se ve más: la deriva también se pausa.
  useEffect(() => api.current?.setStageActive(active), [active]);

  // Lista de detalles: el relleno avanza con los vistos.
  useGSAP(
    () => {
      const fill = root.current?.querySelector('[data-part="rail-fill"]');
      if (!fill) return;
      gsap.to(fill, { scaleY: total ? visited.length / total : 0, duration: reducedMotion ? 0 : 0.5, ease: EASE.out.gsap, overwrite: true });
    },
    { scope: root, dependencies: [visited.length, total, reducedMotion] },
  );

  // Tarjeta de móvil: el texto nuevo entra con un fundido corto.
  useGSAP(
    () => {
      if (activeIndex < 0 || reducedMotion) return;
      const parts = root.current?.querySelectorAll('[data-part="card-text"]');
      if (parts?.length) gsap.fromTo(parts, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: DURATION.ui, stagger: 0.04, ease: EASE.out.gsap, overwrite: true });
    },
    { scope: root, dependencies: [activeIndex, reducedMotion] },
  );

  // Recorrido completo: el título final entra una vez.
  useGSAP(
    () => {
      if (!complete || reducedMotion) return;
      const parts = root.current?.querySelectorAll('[data-part="done"] > *');
      if (parts?.length) gsap.fromTo(parts, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: DURATION.reveal, stagger: 0.08, delay: 0.4 });
    },
    { scope: root, dependencies: [complete, reducedMotion] },
  );

  const onSceneReady = useCallback((dims: ShoeDims) => {
    sceneDims.current = dims;
    setReady(true);
    api.current?.onSceneReady(dims);
  }, []);

  const goTo = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    // MotionRoot (AnchorLinks) puede haberlo resuelto ya en captura.
    if (event.defaultPrevented) return;
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    scrollToElement(target);
  };

  // Pasar el puntero (o el foco) por un punto resalta su fila y viceversa:
  // solo un atributo en el DOM, sin estado de React.
  const linkHover = (index: number, on: boolean) => {
    root.current?.querySelectorAll(`[data-detail="${index}"]`).forEach((element) => element.toggleAttribute('data-hover', on));
  };
  const hoverProps = (index: number) => ({
    'data-detail': index,
    onPointerEnter: () => linkHover(index, true),
    onPointerLeave: () => linkHover(index, false),
    onFocus: () => linkHover(index, true),
    onBlur: () => linkHover(index, false),
  });

  // Foco itinerante en la lista: flechas, Inicio y Fin mueven el foco entre filas.
  const onRailKey = (event: KeyboardEvent<HTMLOListElement>) => {
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    let next: number | null = null;
    if (event.key in keys) next = (index + keys[event.key] + rows.length) % rows.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = rows.length - 1;
    if (next === null) return;
    event.preventDefault();
    rows.forEach((row, position) => (row.tabIndex = position === next ? 0 : -1));
    rows[next].focus();
  };

  const [first, second] = headline;
  const longest = Math.max(first.length, second.length);
  const focusIndex = Math.max(activeIndex, 0);
  const progressText = complete ? t('details.complete') : t('details.progress', { seen: pad(visited.length), total: pad(total) });
  const card = activeIndex >= 0 ? hotspots[activeIndex] : null;
  const toneClass = content.availabilityTone === 'alert' ? styles.toneAlert : content.availabilityTone === 'primary' ? styles.tonePrimary : '';

  return (
    <section
      ref={root}
      id={HOME_ANCHORS.hero}
      className={styles.hero}
      aria-label={t('sectionLabel')}
      {...accentProps(content.accent)}
      data-intro={introDone ? undefined : ''}
      data-hydrated={hydrated || undefined}
      data-complete={complete || undefined}
    >
      {/* Portada */}
      <div className={styles.cover} data-part="cover">
        <div className={styles.content}>
          <p className={`${styles.kicker} ${styles.hudLabel}`} data-part="kicker">
            {t('kicker', { brand: content.brand, reference: content.reference })}
          </p>
          <h1 className={styles.title} data-part="title" style={{ '--name-chars': longest } as CSSProperties}>
            <span className="visually-hidden">{`${first} ${second}`}</span>
            <HeadlineLine text={first} />
            <HeadlineLine text={second} second />
          </h1>
          <p className={styles.lead} data-part="lead">
            {t('lead')}
          </p>
          <div className={styles.actions} data-part="actions">
            <a className={`${styles.btn} ${styles.btnPrimary}`} href={`#${HOME_ANCHORS.board}`} onClick={goTo(HOME_ANCHORS.board)} data-part="action">
              {t('ctaCatalog')}
              <ArrowIcon direction="right" />
            </a>
            <a className={`${styles.btn} ${styles.btnGhost}`} href="#detalles" onClick={goTo('detalles')} data-part="action">
              {t('ctaDetails')}
              <ArrowIcon direction="down" />
            </a>
          </div>
        </div>
        <div className={styles.instruments} data-part="instruments">
          <dl className={styles.readouts} data-part="readout-list">
            {/* El giro (grados) no es un dato del producto: vive en el dial del visor. */}
            {content.weightGrams !== null && (
              <div className={`${styles.readout} ${styles.readoutDesk}`} data-part="reveal-item">
                <dt className={styles.hudLabel}>{t('readouts.weight')}</dt>
                <dd className={styles.mono}>
                  {pad(content.weightGrams, 3)}
                  <small>{t('readouts.gramsUnit')}</small>
                </dd>
              </div>
            )}
            <div className={styles.readout} data-part="reveal-item">
              <dt className={styles.hudLabel}>{t('readouts.price')}</dt>
              <dd className={styles.mono}>{content.price}</dd>
            </div>
            {content.sizes && (
              <div className={`${styles.readout} ${styles.readoutMeta}`} data-part="reveal-item">
                <dt className={styles.hudLabel}>{t('readouts.sizes')}</dt>
                <dd className={styles.mono}>{content.sizes}</dd>
              </div>
            )}
            <div className={`${styles.readout} ${styles.readoutStatus} ${toneClass}`} data-part="reveal-item">
              <dt className={styles.hudLabel}>{t('readouts.availability')}</dt>
              <dd className={styles.mono}>
                <span className={styles.statusDot} aria-hidden="true" />
                {content.availability}
              </dd>
            </div>
          </dl>
          <p className={`${styles.cue} ${styles.hudLabel}`} aria-hidden="true" data-part="reveal-item">
            <span data-cue="" data-part="cue">
              <span className={styles.cuePointer}>{t('cuePointer')}</span>
              <span className={styles.cueTouch}>{t('cueTouch')}</span>
            </span>
            <span className={styles.cueLine} />
          </p>
        </div>
      </div>

      {/* Escena: fondo, halo, lienzo, retícula, rótulos y área de arrastre. */}
      {/* Capa de escena del alto de toda la sección: en escritorio la escena
          es sticky dentro de ella (sin pin ni scrub). */}
      <div className={styles.track}>
      <div ref={setStageElement} className={styles.stage} data-part="stage">
        <div className={styles.backdrop} aria-hidden="true">
          <div className={styles.grid} />
          <div className={styles.halo} data-part="halo" />
        </div>
        {model.poster && (
          <div className={styles.poster} data-part="poster" aria-hidden={ready || undefined}>
            <ThemedPoster poster={model.poster} alt={t('posterAlt', { name: content.name })} />
          </div>
        )}
        <div className={styles.canvas}>
          {mounted && (
            <HeroScene model={model} lite={lite} active={active} reducedMotion={reducedMotion} baseYaw={orientation.baseYaw} rig={rig} onReady={onSceneReady} entrance={entrance} />
          )}
        </div>
        <HeroReticle target={t('reticle.target', { reference: content.reference })} lock={t('reticle.lock')} loading={ready ? null : t('loading')} />
        <svg className={styles.lines} aria-hidden="true" data-part="lines">
          {hotspots.map((spot) => (
            <path key={spot.key} className={styles.leader} data-part="leader" />
          ))}
        </svg>
        <div className={styles.labels} aria-hidden="true">
          {hotspots.map((spot, index) => (
            <div
              key={spot.key}
              className={`${styles.label} ${styles.frame}`}
              data-part="label"
              data-side={spot.view.slot.side}
              style={{ '--slot-y': spot.view.slot.y } as CSSProperties}
            >
              <span className={styles.frameCorners} />
              <p className={`${styles.hudLabel} ${styles.hudPrimary}`}>{t('details.counter', { current: pad(index + 1), total: pad(total) })}</p>
              <p className={styles.labelTitle}>{spot.title}</p>
              <p className={styles.labelText}>{spot.text}</p>
            </div>
          ))}
        </div>
        <div
          className={styles.grip}
          data-part="grip"
          role="slider"
          tabIndex={0}
          aria-label={t('gripLabel', { name: content.name })}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={0}
          aria-valuetext={t('gripValue', { degrees: 0 })}
        />
        {/* Puntos sobre el zapato: todos a la vista en los detalles; cada uno es
            un botón que elige su detalle, igual que su fila de la lista. Van
            después del área de arrastre para quedar por encima de ella. */}
        <div className={styles.spots}>
          {hotspots.map((spot, index) => (
            <button
              key={spot.key}
              type="button"
              className={styles.spot}
              data-part="spot"
              aria-label={t('details.spotLabel', { current: pad(index + 1), total: pad(total), title: spot.title })}
              aria-pressed={index === activeIndex}
              data-active={index === activeIndex || undefined}
              data-done={visited.includes(index) || undefined}
              onClick={() => api.current?.select(index)}
              {...hoverProps(index)}
            >
              <span className={styles.spotIdle} aria-hidden="true" />
              <span className={styles.mark} data-part="mark" aria-hidden="true">
                <span className={styles.markRing} />
                <span className={styles.markDot} />
              </span>
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* Pieza por pieza */}
      <section className={styles.details} id="detalles" data-part="details" aria-labelledby={titleId}>
        <div className={styles.detailsUi}>
          <header className={styles.detailsHead} data-part="details-head">
            <p className={styles.hudLabel}>{t('details.headLabel', { reference: content.reference, name: content.name })}</p>
            <h2 className={styles.detailsTitle} id={titleId}>
              {t('details.title')}
            </h2>
          </header>
          <div className={styles.status} data-part="status">
            <p className={styles.hudLabel}>{t('details.progressLabel')}</p>
            <p className={`${styles.state} ${styles.mono}`} aria-hidden="true">
              {progressText}
            </p>
            <p className="visually-hidden" aria-live="polite">
              {visited.length ? progressText : ''}
            </p>
            <p className={`${styles.hudLabel} ${styles.statusTurn}`} aria-hidden="true">
              {t('details.turnLabel')} <span className={styles.mono} data-part="turn-inspect">{pad(0, 3)}</span>
              {t('readouts.degreesUnit')}
            </p>
          </div>
          <div className={styles.rail}>
            <div className={styles.railHead}>
              <p className={styles.hudLabel} id={`${titleId}-rail`}>
                {t('details.railTitle')}
              </p>
              <p className={styles.hudLabel} aria-hidden="true">
                <span className={styles.mono}>{t('details.counter', { current: pad(focusIndex + 1), total: pad(total) })}</span>
              </p>
            </div>
            <p className={styles.railHint} id={`${titleId}-hint`}>
              {t('details.railHint')}
            </p>
            <div className={styles.railBody}>
              <div className={styles.railTrack} aria-hidden="true">
                <span className={styles.railFill} data-part="rail-fill" />
              </div>
              <ol className={styles.railList} aria-labelledby={`${titleId}-rail`} aria-describedby={`${titleId}-hint`} onKeyDown={onRailKey}>
                {hotspots.map((spot, index) => (
                  <li key={spot.key}>
                    <button
                      type="button"
                      className={styles.railItem}
                      aria-pressed={index === activeIndex}
                      tabIndex={index === focusIndex ? 0 : -1}
                      data-active={index === activeIndex || undefined}
                      data-done={visited.includes(index) || undefined}
                      onClick={() => api.current?.select(index)}
                      {...hoverProps(index)}
                    >
                      <span className={`${styles.railIndex} ${styles.mono}`}>
                        <span className="visually-hidden">{t('details.jumpTo')} </span>
                        {pad(index + 1)}
                      </span>
                      <span className={styles.railCopy}>
                        <span className={styles.railName}>{spot.title}</span>
                        <span className={styles.railText}>{spot.text}</span>
                      </span>
                      {/* Marca de visto: un punto pequeño (el texto, para lectores de pantalla). */}
                      <span className={styles.railSeen} aria-hidden="true" />
                      {visited.includes(index) && <span className="visually-hidden"> {t('details.seen')}</span>}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <dl className={styles.specs}>
            {content.weightGrams !== null && (
              <div className={styles.spec}>
                <dt className={styles.hudLabel}>{t('details.specWeight')}</dt>
                <dd className={styles.mono}>
                  <span data-part="spec-count" data-value={content.weightGrams} data-digits={3}>
                    {pad(content.weightGrams, 3)}
                  </span>{' '}
                  {t('details.gramsUnit')}
                </dd>
              </div>
            )}
            {content.stackMm !== null && (
              <div className={styles.spec}>
                <dt className={styles.hudLabel}>{t('details.specStack')}</dt>
                <dd className={styles.mono}>
                  <span data-part="spec-count" data-value={content.stackMm} data-digits={2}>
                    {pad(content.stackMm, 2)}
                  </span>{' '}
                  {t('details.millimetersUnit')}
                </dd>
              </div>
            )}
            {content.upper && (
              <div className={`${styles.spec} ${styles.specText}`}>
                <dt className={styles.hudLabel}>{t('details.specUpper')}</dt>
                <dd>{content.upper}</dd>
              </div>
            )}
            {content.sole && (
              <div className={`${styles.spec} ${styles.specText}`}>
                <dt className={styles.hudLabel}>{t('details.specSole')}</dt>
                <dd>{content.sole}</dd>
              </div>
            )}
          </dl>
          <div className={`${styles.card} ${styles.frame}`} aria-hidden="true" data-visible={card ? '' : undefined}>
            <span className={styles.frameCorners} />
            {card && (
              <>
                <p className={`${styles.hudLabel} ${styles.hudPrimary}`}>{t('details.counter', { current: pad(activeIndex + 1), total: pad(total) })}</p>
                <p className={styles.cardTitle} data-part="card-text">
                  {card.title}
                </p>
                <p className={styles.cardText} data-part="card-text">
                  {card.text}
                </p>
              </>
            )}
          </div>
          <div className={styles.launch}>
            {complete && (
              <div className={styles.done} data-part="done">
                <p className={`${styles.doneLabel} ${styles.hudLabel} ${styles.hudPrimary}`}>
                  <span className={styles.doneTick} aria-hidden="true" />
                  {t('details.complete')}
                </p>
                <p className={styles.doneTitle}>
                  <span className={styles.doneTick} aria-hidden="true" />
                  {t('details.completeTitle')}
                </p>
              </div>
            )}
            <a
              className={`${styles.btn} ${complete ? styles.btnPrimary : styles.btnGhost} ${styles.finish}`}
              href={`#${HOME_ANCHORS.board}`}
              onClick={goTo(HOME_ANCHORS.board)}
            >
              {t('details.ctaFinish')}
              <ArrowIcon direction="up" />
            </a>
          </div>
        </div>
      </section>
    </section>
  );
}

// Una línea del titular: el texto real va en el h1 (oculto a la vista); las
// letras animadas son copias aria-hidden, una por carácter, con data-char
// para el contorno de la segunda línea y data-text para el barrido de luz.
function HeadlineLine({ text, second = false }: { text: string; second?: boolean }) {
  return (
    <span className={`${styles.line} ${second ? styles.lineTwo : ''}`} data-part="line" data-text={text} aria-hidden="true">
      <span className={styles.lineInner} data-part="line-inner">
        {Array.from(text).map((char, index) =>
          char === ' ' ? (
            <span key={index} className={`${styles.char} ${styles.space}`}>
              {' '}
            </span>
          ) : (
            <span key={index} className={styles.char} data-char={char}>
              <span className={styles.charFill}>{char}</span>
            </span>
          ),
        )}
      </span>
    </span>
  );
}

function ArrowIcon({ direction }: { direction: 'right' | 'down' | 'up' }) {
  const d = direction === 'right' ? 'M2 8h11M9 4l4 4-4 4' : direction === 'down' ? 'M8 2v11M4 9l4 4 4-4' : 'M4 12 12 4M5.5 4H12v6.5';
  return (
    <svg className={styles.icon} data-direction={direction} viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
