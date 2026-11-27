import { expect, test } from '@playwright/test';
import {
  AWAY_DELAY_MS,
  centerFloorPoint,
  isPlacementTap,
  isSphereOutOfView,
  RECENTER_DEFAULT_DISTANCE,
  RECENTER_MAX_DISTANCE,
  RECENTER_MIN_DISTANCE,
  rayFloorPoint,
  stepAwayTimer,
} from '../components/product/ar-recenter-math';

// Lógica pura de "traer al centro" y "tocar para colocar" en la vista AR
// (WebXR). La sesión AR real no corre en CI: aquí se prueban las decisiones
// (fuera de cuadro, punto del piso al centro, cronómetro, toque vs. gesto).

test.describe('AR recenter math', () => {
  // Proyección simple: escala 1 en x e y (90° de campo).
  const out = (x: number, y: number, w: number, r = 0.15) => isSphereOutOfView({ x, y, w }, r, 1, 1);

  test('a model in front of the camera is in view', () => {
    expect(out(0, 0, 1)).toBe(false);
    // Borde de la imagen con parte de la esfera adentro.
    expect(out(1.1, 0, 1)).toBe(false);
  });

  test('a model fully beside, above or below the view is out of view', () => {
    expect(out(1.2, 0, 1)).toBe(true);
    expect(out(-1.2, 0, 1)).toBe(true);
    expect(out(0, 1.5, 1)).toBe(true);
    expect(out(0, -1.5, 1)).toBe(true);
  });

  test('a model behind the camera is out of view, unless the phone is on top of it', () => {
    expect(out(0, 0, -2)).toBe(true);
    expect(out(0, 0, -0.05)).toBe(false);
  });

  test('center floor point follows the center ray, clamped to a comfortable distance', () => {
    const up = { x: 0, y: 0, z: -1 };
    // Cámara a 1.4 m mirando 45° hacia abajo, hacia -Z: toca el piso a 1.4 m.
    const s = Math.SQRT1_2;
    const p = centerFloorPoint({ x: 0, y: 1.4, z: 0 }, { x: 0, y: -s, z: -s }, up, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-1.4);
    // Mirando al horizonte: distancia por defecto.
    const flat = centerFloorPoint({ x: 0, y: 1.4, z: 0 }, { x: 1, y: 0, z: 0 }, up, 0);
    expect(flat.x).toBeCloseTo(RECENTER_DEFAULT_DISTANCE);
    // Casi sin inclinación: tope máximo.
    const far = centerFloorPoint({ x: 0, y: 1.4, z: 0 }, { x: 0, y: -0.1, z: -0.995 }, up, 0);
    expect(far.z).toBeCloseTo(-RECENTER_MAX_DISTANCE);
    // Mirando en vertical hacia abajo: usa el borde superior de la pantalla y la distancia mínima.
    const down = centerFloorPoint({ x: 0, y: 1.4, z: 0 }, { x: 0, y: -1, z: 0 }, up, 0);
    expect(down.z).toBeCloseTo(-RECENTER_MIN_DISTANCE);
  });

  test('the away timer recenters after the delay and resets on interaction or when seen', () => {
    let state = stepAwayTimer(null, true, false, 0);
    expect(state).toEqual({ awaySince: 0, recenter: false });
    state = stepAwayTimer(state.awaySince, true, false, AWAY_DELAY_MS - 1);
    expect(state.recenter).toBe(false);
    expect(stepAwayTimer(state.awaySince, true, false, AWAY_DELAY_MS).recenter).toBe(true);
    // Dedos en la pantalla: no pelea con la persona.
    expect(stepAwayTimer(0, true, true, 5000)).toEqual({ awaySince: null, recenter: false });
    // Vuelve a verse: se reinicia.
    expect(stepAwayTimer(0, false, false, 5000)).toEqual({ awaySince: null, recenter: false });
  });

  test('only a short, still, one-finger touch off the model is a placement tap', () => {
    const tap = { durationMs: 120, moved: 0.01, maxTouches: 1, onModel: false };
    expect(isPlacementTap(tap)).toBe(true);
    expect(isPlacementTap({ ...tap, onModel: true })).toBe(false);
    expect(isPlacementTap({ ...tap, maxTouches: 2 })).toBe(false);
    expect(isPlacementTap({ ...tap, moved: 0.2 })).toBe(false);
    expect(isPlacementTap({ ...tap, durationMs: 800 })).toBe(false);
  });

  test('the tap ray meets the floor, or nothing when it points up or too far', () => {
    const s = Math.SQRT1_2;
    const p = rayFloorPoint({ x: 0, y: 1.4, z: 0 }, { x: s, y: -s, z: 0 }, 0);
    expect(p?.x).toBeCloseTo(1.4);
    expect(p?.z).toBeCloseTo(0);
    expect(rayFloorPoint({ x: 0, y: 1.4, z: 0 }, { x: 1, y: 0.1, z: 0 }, 0)).toBeNull();
    expect(rayFloorPoint({ x: 0, y: 1.4, z: 0 }, { x: 0.999, y: -0.04, z: 0 }, 0)).toBeNull();
  });
});
