'use client';

/**
 * El robot del estilista IA: la puerta de entrada al chat (portado del
 * asistente "Pregúntale a mi IA" del portafolio del dueño). Con la ropa de
 * la tienda: gorra 59FIFTY con "NY" (la antena sale de su botón), sudadera
 * gris carbón con "IA" en lima y un trébol, y tenis altos estilo Air Jordan 1
 * de frente, en el azul de la gorra.
 *
 * La vida está en los ojos: siguen el cursor por toda la página con un poco
 * de inercia, parpadean (a veces dos veces), se ponen felices cuando alguien
 * se acerca y saluda con el brazo, celebran el clic con estrellas, giran
 * mientras el estilista piensa y se adormecen tras un minuto sin nadie.
 *
 * De vez en cuando habla: un globo con una frase corta, que se cierra solo y
 * abre el chat si se toca. El mismo globo sale al pasarle el mouse por encima
 * o al llegar con el teclado, porque dice qué hace el botón. Se arrastra con
 * mouse o dedo, se pega al borde más cercano y recuerda dónde lo dejaron. Con
 * "reducir movimiento" se queda quieto, mira al frente y solo habla si se lo
 * piden.
 *
 * Los valores de cada cuadro (mirada, arrastre) viven en motion values, nunca
 * en el estado de React. Sin filtros de desenfoque: el halo y la sombra son
 * degradados.
 */
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useSpring, type MotionValue } from 'motion/react';
import { type FocusEvent as ReactFocusEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { BorderBeam } from './BorderBeam';
import { edgeMargin, type Placement, readPlacement, savePlacement } from './placement';
import styles from './Robot.module.css';

// El primer globo espera a que la persona se ubique; después, uno cada 40-65 s.
const FIRST_BUBBLE_MS = 9_000;
const BETWEEN_BUBBLES_MS = 40_000;
const BUBBLE_VISIBLE_MS = 6_500;
// Al quitarle el mouse, el globo espera esto antes de irse: lo justo para
// pasar del robot al globo y tocarlo.
const BUBBLE_GRACE_MS = 280;

// Sin mover el mouse este rato, la mirada vuelve al frente; con mucho más,
// el robot se adormece.
const GAZE_IDLE_MS = 3_000;
const SLEEP_MS = 60_000;

// Cuánto se pueden mover las pupilas dentro del visor, en unidades del dibujo.
const REACH_X = 4.2;
const REACH_Y = 2.8;

// La reacción al clic dura esto; el chat se abre antes de que termine, para
// que la celebración no se sienta como espera.
const REACTION_MS = 420;
const OPEN_AFTER_MS = 220;

/** Lo que dicen los ojos. */
type Mood = 'normal' | 'happy' | 'stars' | 'thinking' | 'asleep' | 'surprised';

/** Lo que tiene abierto el globo a pedido: el mouse (sobre el robot o el globo) y el foco. */
type Holders = { robot: boolean; bubble: boolean; focus: boolean };
const NO_HOLDERS: Holders = { robot: false, bubble: false, focus: false };

// Más de esto con el botón apretado es arrastre, no clic.
const DRAG_THRESHOLD_PX = 5;
// Por debajo del encabezado fijo del sitio.
const TOP_LIMIT_PX = 80;

// Tras un cambio de tamaño de la ventana se espera a que se quede quieta antes
// de reacomodar el robot: al deslizar rápido en el celular la barra del
// navegador aparece y se oculta varias veces por segundo.
const RESIZE_SETTLE_MS = 150;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Entrada de la primera visita: llega caminando desde el borde derecho, da
// una vuelta completa, aterriza con un saltito y se pone feliz (unos 2,2 s).
// Se recuerda en el navegador (comodidad: si el almacenamiento falla, solo
// se repite). Con movimiento reducido o en modo liviano, solo un fundido.
const INTRO_KEY = 'airspace-stylist-robot-intro';
// Desde dónde camina: fuera de la pantalla, a la derecha de su esquina.
const WALK_FROM_PX = 190;
const WALK_S = 1.1;
const SPIN_S = 0.7;
const HOP_S = 0.4;
const CHEER_MS = 1_100;
// En la home espera a que termine la entrada del hero (y al menos 2,5 s
// desde la carga); en las demás páginas, un segundo.
const HOME_PATH = /^\/(es|en)\/?$/;
const STAGE_MIN_HOME_MS = 2_500;
const STAGE_MIN_MS = 1_000;
const STAGE_MAX_WAIT_MS = 9_000;

type Intro = 'walk' | 'fade' | 'none';
type Phase = 'waiting' | 'walking' | 'spinning' | 'landing' | 'done';

function decideIntro(): Intro {
  if (typeof window === 'undefined') return 'none';
  let played = false;
  try {
    played = window.localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    // Sin almacenamiento: se trata como primera visita.
  }
  // Ya vino antes, o ya lo movieron de su esquina: aparece sin más.
  if (played || readPlacement()) return 'none';
  const root = document.documentElement;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || root.classList.contains('lite')) return 'fade';
  return 'walk';
}

function markIntroPlayed() {
  try {
    window.localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // Que no se recuerde solo hace que la entrada se repita.
  }
}

// Espera a que la página esté tranquila antes de entrar: no compite con la
// entrada del hero (data-intro mientras dura) ni con la carga.
function waitForStage(cancelled: () => boolean): Promise<void> {
  const minimum = HOME_PATH.test(window.location.pathname) ? STAGE_MIN_HOME_MS : STAGE_MIN_MS;
  const started = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      if (cancelled()) return;
      const now = performance.now();
      const heroBusy = document.querySelector('[data-intro]') !== null;
      if ((now >= minimum && !heroBusy) || now - started > STAGE_MAX_WAIT_MS) resolve();
      else setTimeout(check, 200);
    };
    check();
  });
}

/**
 * El desplazamiento vertical permitido para un botón de alto `h`: nunca por
 * debajo de su sitio (0) ni por encima del encabezado. Con el tamaño de la
 * ventana y no midiendo la pantalla, así no depende del momento de un scroll.
 */
function clampY(y: number, h: number, lift: number) {
  const homeTop = window.innerHeight - edgeMargin() - lift - h;
  return Math.min(0, Math.max(y, TOP_LIMIT_PX - homeTop));
}

/** Un arrastre en curso, con mouse o con dedo. */
type PointerDrag = {
  id: number;
  startX: number;
  startY: number;
  fromX: number;
  fromY: number;
  /** Ya pasó del umbral: es arrastre y no toque */
  moving: boolean;
  /** Límites del desplazamiento; el máximo de los dos ejes es su esquina (0) */
  minX: number;
  minY: number;
};

export function Robot({
  onOpen,
  onIntent,
  open,
  thinking,
  label,
  bubbles,
  plate,
  closeLabel,
  lift = 0,
}: {
  onOpen: () => void;
  /** Alguien se acerca (mouse, foco o toque): buen momento para precargar el panel */
  onIntent: () => void;
  open: boolean;
  thinking: boolean;
  /** Nombre accesible del botón */
  label: string;
  /** Frases del globo, ya traducidas; se van turnando */
  bubbles: string[];
  /** Texto de la placa del pecho ("IA" o "AI") */
  plate: string;
  /** Nombre accesible de la X que cierra el globo */
  closeLabel: string;
  /** Altura extra sobre el borde inferior (páginas con controles abajo a la derecha) */
  lift?: number;
}) {
  const reduced = !!useReducedMotion();
  const [hover, setHover] = useState(false);
  const [blink, setBlink] = useState(false);
  const [asleep, setAsleep] = useState(false);
  const [reaction, setReaction] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  // El globo que pide la persona (mouse encima o foco de teclado). Su frase se
  // fija al abrirse para que no cambie ni parpadee mientras sigue ahí.
  const [pinned, setPinned] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Solo decide hacia dónde sale el globo, que nunca está en el primer render
  // (el robot se monta solo en el cliente).
  const [placement, setPlacement] = useState<Placement>(() => (typeof window === 'undefined' ? null : readPlacement()));
  const button = useRef<HTMLButtonElement>(null);
  const dragged = useRef(false);
  const pointer = useRef<PointerDrag | null>(null);
  const holders = useRef<Holders>({ ...NO_HOLDERS });
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Tras cerrar el globo con su X el foco vuelve al robot sin reabrirlo.
  const quietFocus = useRef(false);

  // La entrada de la primera visita (solo en el cliente: el robot no se
  // renderiza en el servidor).
  const [intro] = useState<Intro>(decideIntro);
  const [phase, setPhase] = useState<Phase>(intro === 'walk' ? 'waiting' : 'done');
  const [cheer, setCheer] = useState(false);
  // Recién llegado: su primer globo sale enseguida.
  const greet = useRef(false);
  const walkX = useMotionValue(intro === 'walk' ? WALK_FROM_PX : 0);
  const hopY = useMotionValue(0);
  const spin = useMotionValue(0);
  const spinScale = useMotionValue(1);
  const squash = useMotionValue(1);

  // Desplazamiento respecto de su sitio de siempre: en x, pegado a un lado o
  // al otro; en y, lo que eligió la persona.
  const dx = useMotionValue(0);
  const dy = useMotionValue(0);

  // La mirada: un objetivo que pone el cursor y un resorte que lo persigue, así
  // los ojos llegan con un poco de inercia en vez de saltar.
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const eyeX = useSpring(targetX, { stiffness: 180, damping: 18, mass: 0.6 });
  const eyeY = useSpring(targetY, { stiffness: 180, damping: 18, mass: 0.6 });

  const mood: Mood = dragging ? 'surprised' : thinking ? 'thinking' : reaction ? 'stars' : hover || cheer ? 'happy' : asleep ? 'asleep' : 'normal';
  const entered = phase === 'done';

  // La entrada: caminar hasta la esquina, una vuelta completa (rotateY con
  // perspectiva; de espaldas se ve la parte de atrás, no el frente al revés),
  // un saltito y cara feliz. Se marca como vista al empezar: si la página se
  // recarga a mitad, el robot ya aparece en su sitio.
  useEffect(() => {
    if (intro === 'fade') markIntroPlayed();
    if (intro !== 'walk') return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    void (async () => {
      await waitForStage(isCancelled);
      if (cancelled) return;
      markIntroPlayed();
      setPhase('walking');
      // Mira hacia donde camina.
      targetX.set(-REACH_X);
      await animate(walkX, 0, { duration: WALK_S, ease: [0.3, 0.7, 0.4, 1] });
      if (cancelled) return;
      targetX.set(0);
      setPhase('spinning');
      await Promise.all([
        animate(spin, 360, { duration: SPIN_S, ease: 'easeInOut' }),
        animate(spinScale, [1, 1.08, 1], { duration: SPIN_S, ease: 'easeInOut' }),
        animate(squash, [1, 0.35, 1, 0.35, 1], { duration: SPIN_S, ease: 'easeInOut' }),
      ]);
      if (cancelled) return;
      spin.set(0);
      setPhase('landing');
      await animate(hopY, [0, -12, 0], { duration: HOP_S, ease: 'easeOut' });
      if (cancelled) return;
      greet.current = true;
      setPhase('done');
      setCheer(true);
      timers.current.push(setTimeout(() => setCheer(false), CHEER_MS));
    })();
    return () => {
      cancelled = true;
    };
  }, [intro, walkX, hopY, spin, spinScale, squash, targetX]);

  // Seguir el cursor por toda la página, volver al frente cuando se queda
  // quieto o sale de la ventana, y dormirse tras un minuto sin nadie.
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let sleep: ReturnType<typeof setTimeout> | undefined;
    const lookAhead = () => {
      targetX.set(0);
      targetY.set(0);
    };
    const fallAsleep = () => {
      lookAhead();
      setAsleep(true);
    };
    const wake = () => {
      setAsleep(false);
      clearTimeout(sleep);
      sleep = setTimeout(fallAsleep, SLEEP_MS);
    };
    const move = (event: PointerEvent) => {
      wake();
      clearTimeout(idle);
      idle = setTimeout(lookAhead, GAZE_IDLE_MS);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = button.current?.getBoundingClientRect();
        if (!rect) return;
        const x = event.clientX - (rect.left + rect.width / 2);
        const y = event.clientY - (rect.top + rect.height * 0.4);
        // Normalizado a la pantalla: un cursor en la otra punta lleva los ojos
        // al borde del visor, y uno cerca los mueve poco.
        const nx = clamp(x / (window.innerWidth * 0.45), -1, 1);
        const ny = clamp(y / (window.innerHeight * 0.45), -1, 1);
        targetX.set(nx * REACH_X);
        targetY.set(ny * REACH_Y);
      });
    };
    const leave = (event: MouseEvent) => {
      if (!event.relatedTarget) lookAhead();
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', wake);
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('blur', lookAhead);
    document.addEventListener('mouseout', leave);
    sleep = setTimeout(fallAsleep, SLEEP_MS);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('scroll', wake);
      window.removeEventListener('blur', lookAhead);
      document.removeEventListener('mouseout', leave);
      cancelAnimationFrame(frame);
      clearTimeout(idle);
      clearTimeout(sleep);
    };
  }, [reduced, targetX, targetY]);

  // Parpadeo: cada 2,5-5 s al azar, y una de cada cuatro veces, doble. A ritmo
  // fijo se nota la máquina. Con la pestaña oculta no parpadea (no hay quién lo vea).
  useEffect(() => {
    if (reduced) return;
    const pending: ReturnType<typeof setTimeout>[] = [];
    const close = (at: number) => {
      pending.push(setTimeout(() => setBlink(true), at));
      pending.push(setTimeout(() => setBlink(false), at + 120));
    };
    let next: ReturnType<typeof setTimeout>;
    const schedule = () => {
      next = setTimeout(
        () => {
          pending.length = 0;
          if (document.visibilityState === 'visible') {
            close(0);
            if (Math.random() < 0.25) close(260);
          }
          schedule();
        },
        2500 + Math.random() * 2500,
      );
    };
    schedule();
    return () => {
      clearTimeout(next);
      pending.forEach(clearTimeout);
    };
  }, [reduced]);

  // El globo del turno: de vez en cuando, nunca con el chat abierto ni con
  // movimiento reducido, y solo con la pestaña a la vista.
  const bubblesRef = useRef(bubbles);
  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);
  useEffect(() => {
    if (reduced || open || !entered) return;
    let index = 0;
    let show: ReturnType<typeof setTimeout>;
    let hide: ReturnType<typeof setTimeout>;
    const schedule = (wait: number) => {
      show = setTimeout(() => {
        const list = bubblesRef.current;
        if (document.visibilityState !== 'visible' || !list.length) {
          schedule(BETWEEN_BUBBLES_MS);
          return;
        }
        setBubble(list[index % list.length] ?? null);
        index += 1;
        hide = setTimeout(() => setBubble(null), BUBBLE_VISIBLE_MS);
        schedule(BETWEEN_BUBBLES_MS + Math.random() * 25_000);
      }, wait);
    };
    // Tras la entrada, el primer mensaje sale solo, enseguida.
    schedule(greet.current ? 250 : FIRST_BUBBLE_MS);
    greet.current = false;
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
      // Al abrir el chat, el globo que estuviera se va.
      setBubble(null);
    };
  }, [reduced, open, entered]);

  // Las esperas del clic se cancelan si el robot se desmonta.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Lo que dice el globo: lo que pidió la persona o, si no, el del turno, que no
  // sale con el robot dormido. Ninguno con el chat abierto ni al arrastrarlo.
  const shown = open || dragging ? null : (pinned ?? (asleep ? null : bubble));

  // Cierra el globo, el pedido y el del turno, y olvida quién lo sostenía.
  const dismiss = useCallback(() => {
    holders.current = { ...NO_HOLDERS };
    clearTimeout(holdTimer.current);
    setPinned(null);
    setBubble(null);
  }, []);

  // El globo a pedido sigue abierto mientras algo lo sostenga. Cuando lo suelta
  // todo, espera un poco antes de cerrarse, para que el mouse alcance a pasar
  // del robot al globo.
  const hold = (who: keyof Holders, on: boolean) => {
    if (holders.current[who] === on) return;
    holders.current[who] = on;
    clearTimeout(holdTimer.current);
    if (on) {
      // Si ya hay un globo a la vista se queda ese; si no, la primera frase.
      setPinned((current) => current ?? shown ?? bubbles[0] ?? null);
    } else if (!Object.values(holders.current).some(Boolean)) {
      holdTimer.current = setTimeout(dismiss, BUBBLE_GRACE_MS);
    }
  };

  // Con teclado el foco también lo abre, pero solo el foco visible: tras un
  // clic el foco se queda en el botón y el globo seguiría abierto sin nadie.
  const onFocus = (event: ReactFocusEvent<HTMLButtonElement>) => {
    onIntent();
    if (quietFocus.current) {
      quietFocus.current = false;
      return;
    }
    if (event.currentTarget.matches(':focus-visible')) hold('focus', true);
  };

  // La X del globo: lo cierra sin abrir el chat. Los globos del turno siguen
  // saliendo después; el foco vuelve al robot (sin volver a abrir el globo).
  const closeBubble = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const hadFocus = event.currentTarget === document.activeElement;
    dismiss();
    if (hadFocus) {
      quietFocus.current = true;
      button.current?.focus({ preventScroll: true });
    }
  };
  const onBlur = () => hold('focus', false);

  // Con el chat abierto el robot se esconde y ya no le llegan "pointerleave" ni
  // "blur": al abrir y al cerrar el chat, el globo empieza de cero.
  useEffect(() => dismiss, [open, dismiss]);

  // Escape cierra el globo sin tener que mover el mouse ni el foco.
  const talking = shown !== null;
  useEffect(() => {
    if (!talking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [talking, dismiss]);

  // Coloca el robot donde dice `next`, dentro de la ventana. Se usa al soltarlo,
  // al cargar la página y cuando la ventana cambia de tamaño. Se calcula con el
  // tamaño de la ventana y del botón, sin medir posiciones en pantalla: así el
  // resultado no depende del momento de un scroll en que se mida.
  const place = useCallback(
    (next: Placement, smooth: boolean) => {
      const element = button.current;
      if (!element) return;
      const margin = edgeMargin();
      const x = next?.side === 'left' ? -(window.innerWidth - 2 * margin - element.offsetWidth) : 0;
      const y = clampY(next?.y ?? 0, element.offsetHeight, lift);
      if (smooth && !reduced) {
        animate(dx, x, { type: 'spring', stiffness: 380, damping: 30 });
        animate(dy, y, { type: 'spring', stiffness: 380, damping: 30 });
      } else {
        dx.set(x);
        dy.set(y);
      }
    },
    [dx, dy, reduced, lift],
  );

  // Al montar: recupera dónde lo dejaron, y se reacomoda cuando la ventana
  // termina de cambiar de tamaño (girar el teléfono, redimensionar). Anclado
  // abajo, mientras la barra del navegador sube y baja el robot conserva su
  // distancia al borde inferior sin que haga falta tocarlo.
  useEffect(() => {
    place(readPlacement(), false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!pointer.current) place(readPlacement(), false);
      }, RESIZE_SETTLE_MS);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [place]);

  // Al soltarlo: se pega al borde más cercano con un muelle y se recuerda. Si
  // cae cerca de su esquina de siempre, vuelve a ser "su sitio".
  const drop = useCallback(() => {
    setDragging(false);
    const element = button.current;
    if (!element) return;
    const centerX = window.innerWidth - edgeMargin() - element.offsetWidth / 2 + dx.get();
    const side = centerX < window.innerWidth / 2 ? 'left' : 'right';
    // Se guarda ya acotada: si no, al crecer la ventana (la barra del navegador
    // que se oculta) el robot subía solo hacia la altura sin acotar.
    const y = clampY(dy.get(), element.offsetHeight, lift);
    const next: Placement = side === 'right' && y > -24 ? null : { side, y };
    setPlacement(next);
    savePlacement(next);
    place(next, true);
  }, [dx, dy, place, lift]);

  // Arrastre propio con Pointer Events, igual con mouse que con dedo: más de
  // 5 px con el botón apretado es arrastre y si no, es un toque que abre el chat.
  // No usa el drag de Motion: con límites dados por un elemento, Motion vuelve
  // a medir y reubica lo arrastrado en cada cambio de tamaño de la ventana, y en
  // el celular, al deslizar rápido, la barra del navegador lo dispara una y otra
  // vez.
  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    onIntent();
    dragged.current = false;
    const element = event.currentTarget;
    const margin = edgeMargin();
    // Si todavía se estaba acomodando en el borde, se agarra desde donde está
    dx.stop();
    dy.stop();
    pointer.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      fromX: dx.get(),
      fromY: dy.get(),
      moving: false,
      minX: -(window.innerWidth - 2 * margin - element.offsetWidth),
      minY: TOP_LIMIT_PX - (window.innerHeight - margin - lift - element.offsetHeight),
    };
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Sin captura el arrastre igual funciona mientras el puntero siga encima
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = pointer.current;
    if (!drag || drag.id !== event.pointerId) return;
    const ox = event.clientX - drag.startX;
    const oy = event.clientY - drag.startY;
    if (!drag.moving) {
      if (Math.hypot(ox, oy) <= DRAG_THRESHOLD_PX) return;
      drag.moving = true;
      // Lo que siga ya no es un toque: al soltar no abre el chat
      dragged.current = true;
      setDragging(true);
      // Y el globo se va, sin volver solo al soltarlo
      dismiss();
    }
    dx.set(clamp(drag.fromX + ox, drag.minX, 0));
    dy.set(clamp(drag.fromY + oy, drag.minY, 0));
  };

  const endPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = pointer.current;
    if (!drag || drag.id !== event.pointerId) return;
    pointer.current = null;
    if (drag.moving) drop();
  };

  // El clic: estrellas en los ojos y un "boing", y el chat se abre a los
  // 220 ms, antes de que acabe la celebración. Sin movimiento, abre al instante.
  const openChat = () => {
    dismiss();
    setHover(false);
    if (reduced) {
      onOpen();
      return;
    }
    setReaction(true);
    timers.current.push(setTimeout(onOpen, OPEN_AFTER_MS));
    timers.current.push(setTimeout(() => setReaction(false), REACTION_MS));
  };

  // Un arrastre que termina sobre el botón también dispara "click": ese no abre.
  const onClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    openChat();
  };

  const float = !reduced && !hover && !asleep && !dragging && entered;
  const walking = phase === 'walking';
  // El globo sale hacia donde haya sitio: a la derecha si el robot está a la
  // izquierda, y debajo si lo subieron cerca del encabezado.
  const bubbleRight = placement?.side === 'left';
  const bubbleBelow = placement !== null && typeof window !== 'undefined' && window.innerHeight + placement.y < 360;
  const bubbleClass = [
    styles.bubble,
    bubbleBelow ? styles.bubbleBelow : styles.bubbleAbove,
    bubbleRight ? styles.bubbleToRight : styles.bubbleToLeft,
    bubbleBelow ? (bubbleRight ? styles.tailTopLeft : styles.tailTopRight) : bubbleRight ? styles.tailBottomLeft : styles.tailBottomRight,
  ].join(' ');

  return (
    <motion.div
      className={styles.dock}
      style={{ pointerEvents: open ? 'none' : undefined, ['--robot-lift' as string]: `${lift}px` }}
      // Entra con un pequeño salto cuando se carga (llega después que la página).
      // En la primera visita llega caminando (fuera de la pantalla hasta empezar).
      initial={intro === 'walk' ? false : reduced || intro === 'fade' ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
      animate={{ scale: open && !reduced ? 0.6 : 1, opacity: open ? 0 : 1 }}
      transition={reduced || intro === 'fade' ? { duration: 0.25 } : { type: 'spring', stiffness: 260, damping: 26 }}
      // Con el chat abierto el robot no está: que el lector de pantalla tampoco lo encuentre.
      aria-hidden={open || undefined}
    >
      <motion.div className={styles.mover} style={{ x: dx, y: dy }}>
        <AnimatePresence>
          {shown ? (
            <motion.div
              key={shown}
              // Con el mouse encima sigue abierto, para poder alcanzarlo y tocarlo
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') hold('bubble', true);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') hold('bubble', false);
              }}
              initial={{ opacity: 0, y: bubbleBelow ? -8 : 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: bubbleBelow ? -4 : 4, scale: 0.95 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              // Va suelto sobre el robot para que su ancho no lo empuje al salir.
              className={bubbleClass}
              data-stylist-bubble=""
            >
              {/* El globo no es otro botón "Abrir estilista": su nombre es lo
                  que dice. No se arrastra: su clic siempre abre el chat. */}
              <button type="button" className={styles.bubbleText} onClick={openChat} onFocus={onFocus} onBlur={onBlur} tabIndex={open ? -1 : undefined}>
                {shown}
              </button>
              <button type="button" className={styles.bubbleClose} aria-label={closeLabel} onClick={closeBubble} onFocus={onFocus} onBlur={onBlur} tabIndex={open ? -1 : undefined}>
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M3 3l6 6M9 3 3 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              {/* El borde con brillo, en lima y naranja de marca */}
              {!reduced ? <BorderBeam size={60} duration={3.2} borderWidth={1.5} /> : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* La entrada camina y salta en esta capa; el arrastre mueve la de afuera. */}
        <motion.div className={styles.walker} style={{ x: walkX, y: hopY, pointerEvents: entered ? undefined : 'none' }}>
        <motion.button
          ref={button}
          type="button"
          // Sin title: el tooltip del navegador saldría encima del globo
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          tabIndex={open ? -1 : undefined}
          data-stylist-robot=""
          onClick={onClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onLostPointerCapture={endPointer}
          // Un arrastre soltado fuera del botón no dispara "click": que no se
          // coma el siguiente Enter
          onKeyDown={() => {
            dragged.current = false;
          }}
          // Solo el mouse cuenta como "acercarse": un toque dispara pointerenter
          // sin pointerleave y el robot se quedaba saludando
          onPointerEnter={(event) => {
            const mouse = event.pointerType === 'mouse';
            setHover(mouse);
            if (mouse) {
              onIntent();
              hold('robot', true);
            }
          }}
          onPointerLeave={(event) => {
            setHover(false);
            if (event.pointerType === 'mouse') hold('robot', false);
          }}
          // El foco no saluda: se queda en el botón tras un clic, un arrastre
          // o al cerrar el chat. Con teclado se ven el anillo de foco y el globo.
          onFocus={onFocus}
          onBlur={onBlur}
          className={styles.robot}
          data-dragging={dragging || undefined}
          onContextMenu={(event) => event.preventDefault()}
          // El "boing" del clic.
          animate={reaction ? { scale: [1, 0.86, 1.12, 1] } : { scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {/* Halo suave detrás: separa al robot de lo que tenga abajo, y crece
              cuando alguien se acerca. */}
          <span className={styles.halo} data-active={(hover && !reduced) || undefined} />
          <motion.div
            className={styles.figure}
            animate={
              walking
                ? // Caminando: un pequeño vaivén a cada paso.
                  { y: [0, -2.5, 0], rotate: 0, scale: 1 }
                : float
                ? { y: [0, -6, 0], rotate: 0, scale: 1 }
                : dragging && !reduced
                  ? // Agarrado: se levanta un poco, sin ladearse.
                    { y: -6, rotate: 0, scale: 1.06 }
                  : // Al acercarse alguien, un saltito de saludo.
                    { y: hover && !reduced ? -9 : 0, rotate: 0, scale: 1 }
            }
            transition={
              walking
                ? { duration: 0.32, repeat: Infinity, ease: 'easeInOut' }
                : float
                  ? { duration: 3.6, repeat: Infinity, ease: 'easeInOut' }
                  : { type: 'spring', stiffness: 420, damping: 14 }
            }
          >
            <motion.div className={styles.spinner} style={{ rotateY: spin, scale: spinScale, transformPerspective: 520 }}>
              <div className={styles.face}>
                <RobotDrawing mood={mood} blink={blink && (mood === 'normal' || mood === 'happy')} waving={hover && !reduced} walking={walking} eyeX={eyeX} eyeY={eyeY} reduced={reduced} plate={plate} />
              </div>
              {/* De espaldas (solo durante la vuelta): gorra y sudadera por detrás. */}
              {phase === 'spinning' ? (
                <div className={`${styles.face} ${styles.back}`}>
                  <RobotDrawing mood="normal" blink={false} waving={false} eyeX={eyeX} eyeY={eyeY} reduced={reduced} plate={plate} back />
                </div>
              ) : null}
            </motion.div>
            {/* Las "z" del sueño, saliendo de la cabeza */}
            <AnimatePresence>{mood === 'asleep' && !reduced ? <Zzz /> : null}</AnimatePresence>
          </motion.div>
          {/* La sombra en el suelo se achica cuando el robot sube */}
          <motion.span className={styles.shadowTrack} style={{ scaleX: squash }}>
          <motion.span
            className={styles.shadow}
            animate={float ? { scaleX: [1, 0.8, 1], opacity: [0.6, 0.35, 0.6] } : dragging ? { scaleX: 1.5, opacity: 0.3 } : { scaleX: 1, opacity: 0.6 }}
            transition={float ? { duration: 3.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          />
          </motion.span>
        </motion.button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function Zzz() {
  return (
    <motion.span aria-hidden="true" className={styles.zzz} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className={styles.z}
          style={{ fontSize: 10 + index * 3, right: index * 7 }}
          animate={{ y: [0, -22], x: [0, 6], opacity: [0, 1, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: index * 0.8, ease: 'easeOut' }}
        >
          z
        </motion.span>
      ))}
    </motion.span>
  );
}

/**
 * El mismo robot, chico y sin seguir el cursor, para el panel del chat. Con el
 * chat abierto el flotante se esconde, y es justo cuando el estilista piensa:
 * aquí es donde se ve que piensa.
 */
export function RobotMini({ thinking, plate, className }: { thinking: boolean; plate: string; className?: string }) {
  const reduced = !!useReducedMotion();
  const still = useMotionValue(0);
  return (
    <span className={`${styles.mini} ${className ?? ''}`}>
      <RobotDrawing mood={thinking ? 'thinking' : 'normal'} blink={false} waving={false} eyeX={still} eyeY={still} reduced={reduced} plate={plate} />
    </span>
  );
}

// Los grupos que giran o escalan (brazo, cabeza, tenis, ojos) usan
// transform-box: view-box: Motion pone fill-box en SVG, y con fill-box los
// orígenes en px se miden desde la caja de cada grupo, no desde el dibujo, y
// el brazo giraba alrededor de un punto lejano y se despegaba del cuerpo.
//
// Paleta: tokens --color-robot-* (styles/tokens.css). El metal y la gorra
// cambian con el tema para contrastar con el fondo.
const BODY_TOP = 'var(--color-robot-body-top)';
const BODY_MID = 'var(--color-robot-body-mid)';
const BODY_BOTTOM = 'var(--color-robot-body-bottom)';
const BODY_EDGE = 'var(--color-robot-body-edge)';
const EYE = 'var(--color-robot-eye)';
const STAR = 'var(--color-robot-star)';
const ACCENT = 'var(--color-robot-accent)';
const GLINT = 'var(--color-robot-glint)';
const HOODIE_SHADE = 'var(--color-robot-hoodie-shade)';
const HOODIE_EDGE = 'var(--color-robot-hoodie-edge)';
const CAP_EDGE = 'var(--color-robot-cap-edge)';
const SHOE = 'var(--color-robot-shoe)';
const SHOE_EDGE = 'var(--color-robot-shoe-edge)';
const OVERLAY = 'var(--color-robot-shoe-overlay)';
const SOLE = 'var(--color-robot-shoe-sole)';
const LIGHT = 'var(--color-robot-cap-mark)';
const CENTERS = [31, 49];
const CY = 40;

/**
 * El dibujo, en una caja de 80 x 100: cabeza de robot con visor, gorra
 * 59FIFTY con "NY", sudadera gris carbón con capucha, cordones, bolsillo,
 * "IA" y trébol, y tenis altos estilo Air Jordan 1 de frente.
 */
function RobotDrawing({
  mood,
  blink,
  waving,
  walking = false,
  back = false,
  eyeX,
  eyeY,
  reduced,
  plate,
}: {
  mood: Mood;
  blink: boolean;
  waving: boolean;
  /** Pasos alternados de los tenis (entrada) */
  walking?: boolean;
  /** Vista de espaldas (durante la vuelta de la entrada) */
  back?: boolean;
  eyeX: MotionValue<number>;
  eyeY: MotionValue<number>;
  reduced: boolean;
  plate: string;
}) {
  // Ids propios por dibujo: hay varios robots en la página (el flotante y los
  // del chat) y con ids repetidos los degradados apuntarían al de otro.
  const unique = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string) => `robot-${name}-${unique}`;
  const happy = mood === 'happy' || mood === 'stars';
  // Los tenis: un golpecito de punta al ponerse feliz y un saltito con las
  // estrellas del clic. Quietos con movimiento reducido.
  const tap = !reduced && mood === 'happy';
  const hop = !reduced && mood === 'stars';
  const shoeMotion = (direction: 1 | -1) =>
    walking && !reduced
      ? // Paso: cada tenis se levanta por turno.
        { animate: { y: [0, -3.5, 0, 0], rotate: 0 }, transition: { duration: 0.64, repeat: Infinity, ease: 'easeInOut' as const, delay: direction > 0 ? 0.32 : 0 } }
      : hop
      ? { animate: { y: [0, -3, 0] }, transition: { duration: 0.32, ease: 'easeOut' as const } }
      : tap
        ? { animate: { rotate: [0, 9 * direction, 0, 5 * direction, 0], y: 0 }, transition: { duration: 0.7, ease: 'easeInOut' as const } }
        : { animate: { rotate: 0, y: 0 }, transition: { duration: 0.2 } };

  return (
    <svg viewBox="0 0 80 100" className={styles.drawing} aria-hidden="true">
      <defs>
        <linearGradient id={id('body')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BODY_TOP} />
          <stop offset="0.55" stopColor={BODY_MID} />
          <stop offset="1" stopColor={BODY_BOTTOM} />
        </linearGradient>
        <linearGradient id={id('hoodie')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-robot-hoodie-top)" />
          <stop offset="0.5" stopColor="var(--color-robot-hoodie)" />
          <stop offset="1" stopColor="var(--color-robot-hoodie-bottom)" />
        </linearGradient>
        <linearGradient id={id('cap')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-robot-cap-top)" />
          <stop offset="1" stopColor="var(--color-robot-cap)" />
        </linearGradient>
        <radialGradient id={id('light')}>
          <stop offset="0" stopColor="var(--color-robot-light)" />
          <stop offset="1" stopColor={ACCENT} />
        </radialGradient>
        <radialGradient id={id('pupil')} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="var(--color-robot-eye-light)" />
          <stop offset="0.55" stopColor={EYE} />
          <stop offset="1" stopColor="var(--color-robot-eye-deep)" />
        </radialGradient>
        <radialGradient id={id('visor')} cx="0.5" cy="0.3" r="0.9">
          <stop offset="0" stopColor="var(--color-robot-visor-top)" />
          <stop offset="1" stopColor="var(--color-robot-visor)" />
        </radialGradient>
        <clipPath id={id('clip')}>
          <rect x="18" y="29" width="44" height="22" rx="11" />
        </clipPath>
      </defs>

      {/* Piernas cortas de metal, que entran en los tenis */}
      <rect x="27.6" y="78" width="5.5" height="9" rx="2.2" fill={`url(#${id('body')})`} stroke={BODY_EDGE} strokeWidth="0.8" />
      <rect x="46.9" y="78" width="5.5" height="9" rx="2.2" fill={`url(#${id('body')})`} stroke={BODY_EDGE} strokeWidth="0.8" />

      {/* Tenis altos de frente, con la punta hacia quien mira y un poco
          abiertos hacia afuera. El izquierdo es el derecho espejado (su
          swoosh queda en el borde de afuera). Cada uno se mueve desde la suela. */}
      <motion.g style={{ originX: '30.3px', originY: '98px', transformBox: 'view-box' }} {...shoeMotion(-1)}>
        <g transform="translate(30.3 98) scale(-0.92 0.92) rotate(-7)">
          <Sneaker />
        </g>
      </motion.g>
      <motion.g style={{ originX: '49.7px', originY: '98px', transformBox: 'view-box' }} {...shoeMotion(1)}>
        <g transform="translate(49.7 98) scale(0.92) rotate(-7)">
          <Sneaker />
        </g>
      </motion.g>

      {/* Brazo izquierdo, quieto: manga de la sudadera con su puño */}
      <rect x="11" y="58" width="8" height="16" rx="4" fill={`url(#${id('hoodie')})`} stroke={HOODIE_EDGE} strokeWidth="0.8" />
      <rect x="11" y="70.5" width="8" height="3.5" rx="1.75" fill={HOODIE_SHADE} />
      {/* Brazo derecho: saluda. Gira desde el hombro */}
      <motion.g
        style={{ originX: '66px', originY: '60px', transformBox: 'view-box' }}
        data-robot-arm=""
        animate={waving ? { rotate: [0, -150, -120, -150, -130] } : { rotate: 0 }}
        transition={waving ? { duration: 1.1, ease: 'easeInOut' } : { duration: 0.3 }}
      >
        <rect x="61" y="58" width="8" height="16" rx="4" fill={`url(#${id('hoodie')})`} stroke={HOODIE_EDGE} strokeWidth="0.8" />
        <rect x="61" y="70.5" width="8" height="3.5" rx="1.75" fill={HOODIE_SHADE} />
      </motion.g>

      {/* Sudadera: cuerpo, bolsillo canguro y resorte de la cintura */}
      <rect x="18" y="54" width="44" height="28" rx="12" fill={`url(#${id('hoodie')})`} stroke={HOODIE_EDGE} strokeWidth="0.8" />
      {back ? (
        // De espaldas: la capucha cae sobre la espalda.
        <path d="M26 55 Q 40 52 54 55 Q 54 69 40 70 Q 26 69 26 55 Z" fill={HOODIE_SHADE} stroke={HOODIE_EDGE} strokeWidth="0.8" />
      ) : (
        <>
          <path d="M27.5 80.5 L 29.5 74 L 50.5 74 L 52.5 80.5" fill="none" stroke={HOODIE_EDGE} strokeWidth="0.8" strokeLinejoin="round" />
          {/* Capucha: asoma detrás del cuello, a los lados de la cabeza */}
          <ellipse cx="40" cy="54.5" rx="25" ry="6.5" fill="var(--color-robot-hoodie-top)" stroke={HOODIE_EDGE} strokeWidth="0.8" />
          <ellipse cx="40" cy="56" rx="16" ry="3.6" fill={HOODIE_SHADE} />
          {/* Cordones con sus puntas */}
          <path d="M35.5 56 L 35 61.5 M44.5 56 L 45 61.5" stroke={LIGHT} strokeWidth="1" strokeLinecap="round" />
          <circle cx="35" cy="62" r="0.9" fill={LIGHT} />
          <circle cx="45" cy="62" r="0.9" fill={LIGHT} />
          {/* "IA" en lima al centro del pecho: la marca principal */}
          <text x="40" y="71.6" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="var(--color-primary-fill)" letterSpacing="0.5" style={{ fontFamily: 'var(--font-display)' }}>
            {plate}
          </text>
          {/* Trébol claro en el pecho (izquierda de quien la lleva), secundario */}
          <Trefoil x={54.6} y={61.4} />
        </>
      )}

      {/* La cabeza: ladea al saludar y cabecea cuando duerme */}
      <motion.g
        style={{ originX: '40px', originY: '52px', transformBox: 'view-box' }}
        animate={{ rotate: waving ? -8 : mood === 'asleep' && !reduced ? 6 : 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 14 }}
      >
        {/* Antena con su luz: sale del botón de la gorra, destella, y más
            cuando alguien se acerca */}
        <line x1="40" y1="11" x2="40" y2="6" stroke="var(--color-text)" strokeWidth="1.6" strokeLinecap="round" />
        <motion.circle
          cx="40"
          cy="5"
          r="3.2"
          fill={`url(#${id('light')})`}
          // Se agranda con el radio y no con scale: dentro de un SVG el origen
          // del scale se calcula aparte y la luz se despegaba de la antena.
          animate={reduced ? {} : happy ? { r: [3.2, 4.8, 3.9], opacity: 1 } : mood === 'asleep' ? { opacity: 0.35, r: 3.2 } : { opacity: [1, 0.45, 1], r: 3.2 }}
          transition={reduced ? {} : happy ? { duration: 0.35 } : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
        {!reduced && mood !== 'asleep' ? (
          <motion.circle
            cx="40"
            cy="5"
            r="3.2"
            fill="none"
            stroke={ACCENT}
            strokeWidth="1"
            animate={{ r: [3.2, happy ? 10 : 7.5], opacity: [0.8, 0] }}
            transition={{ duration: happy ? 0.9 : 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
        ) : null}

        {/* Cabeza */}
        <rect x="14" y="17" width="52" height="38" rx="19" fill={`url(#${id('body')})`} stroke={BODY_EDGE} />

        {/* Gorra 59FIFTY: copa con costuras, botón arriba y "NY" al frente */}
        <path d="M15.5 27.5 C 15.5 7, 64.5 7, 64.5 27.5 Z" fill={`url(#${id('cap')})`} stroke={CAP_EDGE} strokeWidth="0.6" />
        <path d="M40 12 L 31 26.5 M40 12 L 49 26.5" stroke={CAP_EDGE} strokeWidth="0.5" strokeOpacity="0.7" fill="none" />
        <circle cx="40" cy="11.6" r="1.6" fill={`url(#${id('cap')})`} stroke={CAP_EDGE} strokeWidth="0.5" />
        {back ? (
          // Por detrás: la copa baja más y no hay visera, ni "NY", ni cara.
          <path d="M15.5 27.5 Q 40 33 64.5 27.5 L 64.5 25 Q 40 30 15.5 25 Z" fill="var(--color-robot-cap)" stroke={CAP_EDGE} strokeWidth="0.6" />
        ) : (
          <>
        <NyMark />
        {/* Visera casi plana, hacia adelante */}
        <path d="M13.5 26.8 Q 40 22.4 66.5 26.8 Q 67.5 30.4 63.5 30.6 Q 40 27.6 16.5 30.6 Q 12.5 30.4 13.5 26.8 Z" fill="var(--color-robot-cap)" stroke={CAP_EDGE} strokeWidth="0.6" />
        <path d="M17 27.6 Q 40 24 63 27.6" stroke="var(--color-robot-cap-mark)" strokeOpacity="0.28" strokeWidth="0.6" fill="none" />

        {/* Visor oscuro con los ojos */}
        <rect x="18" y="29" width="44" height="22" rx="11" fill={`url(#${id('visor')})`} />
        <g clipPath={`url(#${id('clip')})`}>
          <Eyes mood={mood} blink={blink} eyeX={eyeX} eyeY={eyeY} reduced={reduced} id={id} />
        </g>
        {/* Brillo del visor, encima de todo */}
        <path d="M23 33.5 Q 26 31.5 31 31.5" stroke={GLINT} strokeOpacity="0.22" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {/* Mejillas que se encienden cuando está feliz */}
        <AnimatePresence>
          {happy ? (
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ellipse cx="22" cy="49" rx="3" ry="1.6" fill={STAR} opacity="0.55" />
              <ellipse cx="58" cy="49" rx="3" ry="1.6" fill={STAR} opacity="0.55" />
            </motion.g>
          ) : null}
        </AnimatePresence>
          </>
        )}
      </motion.g>
    </svg>
  );
}

/**
 * Un tenis alto estilo Air Jordan 1 visto de frente (el derecho): origen en
 * el centro de la suela, unas 17 x 17 unidades hacia arriba. Paneles
 * blancos; cuello, ojales, puntera y swoosh en el azul de la gorra; suela
 * blanca. El swoosh asoma como una curva en el borde de afuera (+x).
 */
function Sneaker() {
  return (
    <g strokeLinejoin="round">
      {/* Cuello alto acolchado, detrás */}
      <path d="M-5.6 -10 L -5.6 -14 Q -5.6 -15.6 -3.6 -15.6 L 3.6 -15.6 Q 5.6 -15.6 5.6 -14 L 5.6 -10 Z" fill={OVERLAY} stroke={SHOE_EDGE} strokeWidth="0.5" />
      {/* Lengüeta blanca con su etiqueta naranja */}
      <path d="M-2.5 -10 L -2.5 -16.6 Q 0 -17.6 2.5 -16.6 L 2.5 -10 Z" fill={SHOE} stroke={SHOE_EDGE} strokeWidth="0.5" />
      <rect x="-1.2" y="-16" width="2.4" height="1.6" rx="0.4" fill={ACCENT} />
      {/* Corte blanco, más ancho abajo */}
      <path d="M-7.6 -2 Q -7.9 -9.4 -5.8 -12.2 L 5.8 -12.2 Q 7.9 -9.4 7.6 -2 Z" fill={SHOE} stroke={SHOE_EDGE} strokeWidth="0.5" />
      {/* Swoosh: curva en el borde de afuera */}
      <path d="M2.6 -9.8 Q 8.2 -9.4 7.3 -4.2 Q 6.6 -6.6 3.8 -7.9 Z" fill={OVERLAY} />
      {/* Ojales y cordones */}
      <rect x="-2.3" y="-12.2" width="4.6" height="6.8" rx="1" fill={OVERLAY} />
      <path d="M-1.4 -11.1 L 1.4 -10.3 M-1.4 -9.5 L 1.4 -8.7 M-1.4 -7.9 L 1.4 -7.1" stroke={SHOE} strokeWidth="0.6" strokeLinecap="round" />
      {/* Puntera redondeada hacia quien mira, con un brillo */}
      <path d="M-7.5 -2 Q -7.4 -6.9 0 -7 Q 7.4 -6.9 7.5 -2 Z" fill={OVERLAY} stroke={SHOE_EDGE} strokeWidth="0.5" />
      <ellipse cx="-2.4" cy="-5" rx="2.2" ry="0.7" fill={SHOE} opacity="0.28" />
      {/* Entresuela blanca y suela */}
      <rect x="-8.3" y="-2.5" width="16.6" height="1.9" rx="0.9" fill={SHOE} stroke={SHOE_EDGE} strokeWidth="0.5" />
      <rect x="-8" y="-0.8" width="16" height="0.8" rx="0.4" fill={SOLE} />
    </g>
  );
}

/** "NY" entrelazada, en trazos (sin fuente), al frente de la gorra. */
function NyMark() {
  return (
    <g stroke="var(--color-robot-cap-mark)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M36.4 23.4 L 36.4 17.6 L 40.2 23.4 L 40.2 17.6" />
      <path d="M39 17.4 L 41.3 20.6 L 43.6 17.4 M41.3 20.6 L 41.3 24" />
    </g>
  );
}

/** Trébol de tres hojas con su barra, pequeño (secundario a la "IA"). */
function Trefoil({ x, y }: { x: number; y: number }) {
  return (
    <g fill={LIGHT} transform={`translate(${x} ${y}) scale(1.5)`}>
      <ellipse cx="-1.7" cy="-0.4" rx="0.9" ry="1.8" transform="rotate(-40 -1.7 -0.4)" />
      <ellipse cx="0" cy="-1.2" rx="0.9" ry="2" />
      <ellipse cx="1.7" cy="-0.4" rx="0.9" ry="1.8" transform="rotate(40 1.7 -0.4)" />
      <rect x="-2.8" y="1.1" width="5.6" height="0.7" rx="0.3" />
    </g>
  );
}

/** Los ojos, según el gesto. Todo dentro del visor (recortado a su forma). */
function Eyes({
  mood,
  blink,
  eyeX,
  eyeY,
  reduced,
  id,
}: {
  mood: Mood;
  blink: boolean;
  eyeX: MotionValue<number>;
  eyeY: MotionValue<number>;
  reduced: boolean;
  id: (name: string) => string;
}) {
  if (mood === 'thinking') {
    // Pensando: cada ojo es un anillo que gira.
    return (
      <>
        {CENTERS.map((cx) => (
          <motion.circle
            key={cx}
            cx={cx}
            cy={CY}
            r="4.4"
            fill="none"
            stroke={EYE}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="16 12"
            style={{ originX: `${cx}px`, originY: `${CY}px`, transformBox: 'view-box' }}
            animate={reduced ? {} : { rotate: 360 }}
            transition={reduced ? {} : { duration: 0.9, repeat: Infinity, ease: 'linear' }}
          />
        ))}
      </>
    );
  }

  if (mood === 'stars') {
    // El clic: estrellas que aparecen de golpe y giran un poco.
    return (
      <>
        {CENTERS.map((cx) => (
          <motion.path
            key={cx}
            d={star(cx, CY, 6.2, 2.6)}
            fill={STAR}
            style={{ originX: `${cx}px`, originY: `${CY}px`, transformBox: 'view-box' }}
            initial={{ scale: 0.2, rotate: -40 }}
            animate={{ scale: [0.2, 1.25, 1], rotate: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        ))}
      </>
    );
  }

  if (mood === 'happy') {
    // Feliz: ojos en arco, como ^ ^.
    return (
      <>
        {CENTERS.map((cx) => (
          <motion.path
            key={cx}
            d={`M${cx - 5} ${CY + 2.2} Q ${cx} ${CY - 5.5} ${cx + 5} ${CY + 2.2}`}
            fill="none"
            stroke={EYE}
            strokeWidth="2.8"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.18 }}
          />
        ))}
      </>
    );
  }

  if (mood === 'surprised') {
    // Agarrado: ojos muy abiertos, pupila chica en el centro.
    return (
      <>
        {CENTERS.map((cx) => (
          <motion.g
            key={cx}
            style={{ originX: `${cx}px`, originY: `${CY}px`, transformBox: 'view-box' }}
            initial={{ scale: 0.7 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 12 }}
          >
            <circle cx={cx} cy={CY} r="6.6" fill="none" stroke={EYE} strokeWidth="2.2" />
            <circle cx={cx} cy={CY} r="2.4" fill={EYE} />
            <circle cx={cx - 1.6} cy={CY - 1.8} r="1.2" fill={GLINT} />
          </motion.g>
        ))}
      </>
    );
  }

  if (mood === 'asleep') {
    // Dormido: párpados caídos, una línea curva hacia abajo.
    return (
      <>
        {CENTERS.map((cx) => (
          <path key={cx} d={`M${cx - 5} ${CY} Q ${cx} ${CY + 3.2} ${cx + 5} ${CY}`} fill="none" stroke={EYE} strokeOpacity="0.75" strokeWidth="2.2" strokeLinecap="round" />
        ))}
      </>
    );
  }

  // Normal: pupilas grandes con su reflejo, que siguen al cursor y parpadean.
  return (
    <motion.g style={{ x: eyeX, y: eyeY }}>
      {CENTERS.map((cx) => (
        <motion.g key={cx} style={{ originX: `${cx}px`, originY: `${CY}px`, transformBox: 'view-box' }} animate={{ scaleY: blink ? 0.08 : 1 }} transition={{ duration: 0.06, ease: 'easeInOut' }}>
          {/* Resplandor alrededor de la pupila */}
          <circle cx={cx} cy={CY} r="7.5" fill={EYE} opacity="0.18" />
          <circle cx={cx} cy={CY} r="5.4" fill={`url(#${id('pupil')})`} />
          {/* El reflejo: lo que hace que un ojo parezca vivo */}
          <circle cx={cx - 1.9} cy={CY - 2} r="1.7" fill={GLINT} />
          <circle cx={cx + 1.8} cy={CY + 1.9} r="0.7" fill={GLINT} opacity="0.7" />
        </motion.g>
      ))}
    </motion.g>
  );
}

/** Una estrella de cinco puntas centrada en (cx, cy). */
function star(cx: number, cy: number, outer: number, inner: number): string {
  const points: string[] = [];
  for (let index = 0; index < 10; index++) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join(' L')} Z`;
}
