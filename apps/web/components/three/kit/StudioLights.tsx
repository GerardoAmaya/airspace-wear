'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Color } from 'three';
import { type Theme, useThemeStore } from '@/lib/theme';

// Iluminación por tema, igual que el prototipo (design/prototype/core/stage.js,
// LIGHT_PRESETS). En oscuro, la luz de contorno (kicker) y el contraluz de
// marca dibujan los bordes de los zapatos negros; en claro se baja el
// contraluz lima (no se lee sobre crema).
export const LIGHT_PRESETS: Record<Theme, { environment: number; exposure: number; key: number; fill: number; rim: number; kicker: number; shadow: number }> = {
  dark: { environment: 1, exposure: 1.05, key: 1.7, fill: 0.45, rim: 1.3, kicker: 1.8, shadow: 0.9 },
  light: { environment: 0.85, exposure: 1, key: 1.5, fill: 0.3, rim: 0.45, kicker: 0.9, shadow: 0.7 },
};

// Posición de la luz principal (la dirección desde la que ilumina). El humo
// de la portada la lee para iluminar sus bocanadas del mismo lado.
export const KEY_LIGHT_POSITION: [number, number, number] = [0.6, 1.2, 1];

// Color de marca desde los tokens (nunca un hex en el componente).
const tokenColor = (name: string) => new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'white');

export function StudioLights() {
  const theme = useThemeStore((state) => state.theme);
  const preset = LIGHT_PRESETS[theme];
  // get() lee el estado de R3F fuera del render: la exposición y la
  // intensidad del entorno son propiedades del renderizador y de la escena.
  const get = useThree((state) => state.get);
  const rimColor = useMemo(() => tokenColor('--color-primary-fill'), []);

  useEffect(() => {
    const { gl, scene, invalidate } = get();
    gl.toneMappingExposure = preset.exposure;
    scene.environmentIntensity = preset.environment;
    invalidate();
  }, [get, preset]);

  return (
    <>
      <directionalLight position={KEY_LIGHT_POSITION} intensity={preset.key} />
      <directionalLight position={[-1, 0.3, 0.8]} intensity={preset.fill} />
      <directionalLight position={[-0.8, 0.6, -1.2]} intensity={preset.rim} color={rimColor} />
      <directionalLight position={[0.9, 1, -1]} intensity={preset.kicker} />
    </>
  );
}
