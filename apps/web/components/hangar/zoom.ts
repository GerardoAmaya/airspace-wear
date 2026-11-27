'use client';

import { type RefObject, useEffect } from 'react';
import { MathUtils } from 'three';
import { now, RESUME_DELAY, type Spin } from '@/components/home/board/rig';
import type { AvatarView, StagePose } from './rig';

// Zoom del escenario del Hangar 360°: pellizco con dos dedos (teléfono),
// Ctrl o Cmd + rueda y pellizco del trackpad (escritorio) y las teclas + y -.
// Es una escala 2D del encuadre actual alrededor de un punto del canvas:
// un punto p del encuadre base se dibuja en p · scale + (x, y). La escala va
// de 1 (el encuadre elegido) al máximo de la vista, y el desplazamiento se
// limita para que lo visible quede siempre dentro del encuadre base (el
// avatar no sale de cuadro). Los valores viven en un ref; la escena los
// suaviza en su bucle de cuadros (nunca estado de React).

export interface StageZoom {
  // Objetivo (lo que pide el gesto).
  scale: number;
  x: number;
  y: number;
  // Lo dibujado en este cuadro (se acerca al objetivo con amortiguación).
  shown: { scale: number; x: number; y: number };
  max: number;
  // Tamaño del escenario en píxeles (para el límite del desplazamiento).
  width: number;
  height: number;
}

// Acercamiento máximo por vista: el primer plano de los zapatos ya es cercano.
export const ZOOM_MAX: Record<AvatarView, number> = { full: 3, feet: 2 };
// Paso de las teclas y del botón de rueda.
const KEY_STEP = 1.25;
// Margen fuera del encuadre base por cada 1x de acercamiento (fracción del lado).
const MARGIN = 0.06;
// Amortiguación por cuadro (más alto, más rápido).
const DAMPING = 18;

export const createZoom = (): StageZoom => ({
  scale: 1,
  x: 0,
  y: 0,
  shown: { scale: 1, x: 0, y: 0 },
  max: ZOOM_MAX.full,
  width: 1,
  height: 1,
});

// Lo visible queda dentro del encuadre base más un margen que crece con la
// escala (en 1x, ninguno): de cerca, los zapatos del borde inferior entran
// enteros. Visible en x: de −x / s a (W − x) / s, en píxeles del encuadre base.
function clampOffset(zoom: StageZoom) {
  zoom.scale = MathUtils.clamp(zoom.scale, 1, zoom.max);
  const s = zoom.scale;
  const mx = zoom.width * MARGIN * (s - 1);
  const my = zoom.height * MARGIN * (s - 1);
  zoom.x = MathUtils.clamp(zoom.x, zoom.width - (zoom.width + mx) * s, mx * s);
  zoom.y = MathUtils.clamp(zoom.y, zoom.height - (zoom.height + my) * s, my * s);
}

// Tamaño del escenario (límite del desplazamiento); si cambia, se reajusta.
function measureZoom(zoom: StageZoom, element: HTMLElement) {
  zoom.width = element.clientWidth || 1;
  zoom.height = element.clientHeight || 1;
  clampOffset(zoom);
}

// Escala hacia `scale` manteniendo fijo el punto (fx, fy) del canvas.
export function zoomTo(zoom: StageZoom, scale: number, fx: number, fy: number) {
  const next = MathUtils.clamp(scale, 1, zoom.max);
  const ratio = next / zoom.scale;
  zoom.x = fx - (fx - zoom.x) * ratio;
  zoom.y = fy - (fy - zoom.y) * ratio;
  zoom.scale = next;
  clampOffset(zoom);
}

// Un paso de teclado (+1 acerca, −1 aleja) hacia el centro del escenario.
export function zoomStep(zoom: StageZoom, direction: 1 | -1) {
  zoomTo(zoom, zoom.scale * KEY_STEP ** direction, zoom.width / 2, zoom.height / 2);
}

export function resetZoom(zoom: StageZoom) {
  zoom.scale = 1;
  zoom.x = 0;
  zoom.y = 0;
}

// Encuadre nuevo: su propio máximo y sin zoom.
export function setZoomView(zoom: StageZoom, view: AvatarView) {
  zoom.max = ZOOM_MAX[view];
  resetZoom(zoom);
}

export const isZoomed = (zoom: StageZoom) => zoom.scale > 1.01;

// Paso por cuadro: lo dibujado se acerca al objetivo (directo con movimiento reducido).
export function stepZoom(zoom: StageZoom, dt: number, reducedMotion: boolean) {
  const shown = zoom.shown;
  if (reducedMotion) {
    shown.scale = zoom.scale;
    shown.x = zoom.x;
    shown.y = zoom.y;
    return;
  }
  shown.scale = MathUtils.damp(shown.scale, zoom.scale, DAMPING, dt);
  shown.x = MathUtils.damp(shown.x, zoom.x, DAMPING, dt);
  shown.y = MathUtils.damp(shown.y, zoom.y, DAMPING, dt);
  // Cerca del objetivo, se asienta (así el atributo de prueba llega a 1 exacto).
  if (Math.abs(shown.scale - zoom.scale) < 1e-4) shown.scale = zoom.scale;
}

// Pose de cámara con el zoom aplicado: escala k y mueve el ancla (ax, ay).
export function applyZoom(pose: StagePose, zoom: StageZoom, out: StagePose): StagePose {
  const { scale, x, y } = zoom.shown;
  out.ax = pose.ax * scale + x;
  out.ay = pose.ay * scale + y;
  out.k = pose.k * scale;
  out.elevation = pose.elevation;
  out.target = pose.target;
  return out;
}

// Gestos sobre el escenario. Un dedo sigue siendo del giro (useSpinDrag) y
// del scroll vertical (touch-action: pan-y); con dos dedos el pellizco
// acerca hacia el punto entre ellos y moverlos juntos desplaza la vista. El
// zoom del navegador no entra: pan-y lo excluye y, además, el gesto de dos
// dedos cancela el scroll. Fuera del escenario, el pellizco de página sigue
// igual. Doble toque (o doble clic) vuelve a 1x.
export function useStageZoom(element: HTMLElement | null, zoom: RefObject<StageZoom>, spin: RefObject<Spin>) {
  useEffect(() => {
    if (!element) return;
    const pinch = { active: false, distance: 1, scale: 1, x: 0, y: 0, mx: 0, my: 0 };
    const tap = { downAt: 0, x: 0, y: 0, lastAt: 0, lastX: 0, lastY: 0, multi: false };

    const measure = () => measureZoom(zoom.current, element);
    const local = (touches: TouchList) => {
      const rect = element.getBoundingClientRect();
      const a = touches[0];
      const b = touches[1];
      return {
        mx: (a.clientX + b.clientX) / 2 - rect.left,
        my: (a.clientY + b.clientY) / 2 - rect.top,
        distance: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
      };
    };

    // Dos dedos: el giro suelta la plataforma (sin inercia) y empieza el pellizco.
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      if (event.cancelable) event.preventDefault();
      tap.multi = true;
      const state = spin.current;
      if (state.dragging) {
        state.dragging = false;
        state.velocity = 0;
        state.resumeAt = now() + RESUME_DELAY;
        delete element.dataset.dragging;
      }
      measure();
      const z = zoom.current;
      Object.assign(pinch, { active: true, ...local(event.touches), scale: z.scale, x: z.x, y: z.y });
      element.dataset.pinching = '';
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!pinch.active || event.touches.length < 2) return;
      if (event.cancelable) event.preventDefault();
      const current = local(event.touches);
      const z = zoom.current;
      // El punto del encuadre base que estaba bajo los dedos sigue bajo los dedos.
      const scale = MathUtils.clamp((pinch.scale * current.distance) / pinch.distance, 1, z.max);
      const baseX = (pinch.mx - pinch.x) / pinch.scale;
      const baseY = (pinch.my - pinch.y) / pinch.scale;
      z.scale = scale;
      z.x = current.mx - baseX * scale;
      z.y = current.my - baseY * scale;
      clampOffset(z);
      spin.current.resumeAt = now() + RESUME_DELAY;
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!pinch.active || event.touches.length >= 2) return;
      pinch.active = false;
      delete element.dataset.pinching;
    };

    // Doble toque: dos toques cortos y quietos, cerca uno del otro.
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as Element).closest('a, button, select')) return;
      if (event.isPrimary) {
        tap.multi = false;
        Object.assign(tap, { downAt: performance.now(), x: event.clientX, y: event.clientY });
      } else tap.multi = true;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType === 'mouse' || tap.multi) return;
      const time = performance.now();
      const still = Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 12;
      if (!still || time - tap.downAt > 280) {
        tap.lastAt = 0;
        return;
      }
      const double = time - tap.lastAt < 320 && Math.hypot(event.clientX - tap.lastX, event.clientY - tap.lastY) < 32;
      if (double) {
        resetZoom(zoom.current);
        tap.lastAt = 0;
      } else Object.assign(tap, { lastAt: time, lastX: event.clientX, lastY: event.clientY });
    };
    const onDoubleClick = () => resetZoom(zoom.current);

    // Escritorio: Ctrl o Cmd + rueda (y el pellizco del trackpad, que llega
    // como rueda con ctrlKey). La rueda sola sigue desplazando la página.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      measure();
      const rect = element.getBoundingClientRect();
      const delta = MathUtils.clamp(event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY, -60, 60);
      const z = zoom.current;
      zoomTo(z, z.scale * Math.exp(-delta * 0.01), event.clientX - rect.left, event.clientY - rect.top);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener('touchstart', onTouchStart, { passive: false });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd);
    element.addEventListener('touchcancel', onTouchEnd);
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('dblclick', onDoubleClick);
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('dblclick', onDoubleClick);
      element.removeEventListener('wheel', onWheel);
    };
  }, [element, zoom, spin]);
}
