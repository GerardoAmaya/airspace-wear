'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type AnimationAction, type AnimationMixer, Color, type Mesh, ShaderMaterial } from 'three';
import { useThemeStore } from '@/lib/theme';

// Cinta bajo el maniquí al caminar. El clip de caminar es en el lugar: sin
// una referencia, el pie apoyado parece patinar hacia atrás sobre la
// plataforma quieta. Unas líneas finas (estilo HUD) corren hacia atrás a la
// misma velocidad que el pie apoyado y se leen como una cinta de correr.
// Cuelga de la plataforma, así que gira con ella y siempre corre en la
// dirección en que mira el avatar. Aparece y se va con el peso del clip
// (el cruce entre clips); con movimiento reducido no se dibuja, y fuera de
// vista el canvas no dibuja, así que no avanza.

// Velocidad del pie apoyado en el clip de Mixamo, en el tiempo del clip
// (m/s, medida en /hangar/dev); se multiplica por la velocidad del clip.
const BELT_SPEED = 1.5;
// Separación entre líneas (m) y tamaño de la cinta (ancho en X, largo en Z).
const SPACING = 0.07;
const WIDTH = 0.62;
const LENGTH = 1.3;
// Opacidad de las líneas en su punto más fuerte (sutil).
const STRENGTH = 0.28;

const VERTEX = /* glsl */ `
varying vec2 vFloor;
void main() {
  vFloor = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Líneas de un píxel (fwidth) que se apagan hacia los bordes de una elipse.
const FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float offset;
uniform float opacity;
uniform vec2 extent;
uniform float spacing;
varying vec2 vFloor;
void main() {
  float u = (vFloor.y - offset) / spacing;
  float line = 1.0 - min(abs(fract(u - 0.5) - 0.5) / (fwidth(u) * 1.2), 1.0);
  float edge = length(vFloor / extent);
  float mask = 1.0 - smoothstep(0.35, 1.0, edge);
  float alpha = line * mask * opacity;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

// Escritura sobre el material de three.js (fuera de React).
const setUniform = (material: ShaderMaterial, name: string, value: number) => void (material.uniforms[name].value = value);

const tokenColor = (name: string) => new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'gray');

export function WalkBelt({ walk, mixer, reducedMotion }: { walk: AnimationAction | null; mixer: AnimationMixer; reducedMotion: boolean }) {
  const theme = useThemeStore((state) => state.theme);
  const mesh = useRef<Mesh>(null);
  // Avance de las líneas (m, da la vuelta en cada línea): por cuadro, en un ref.
  const offset = useRef(0);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          color: { value: new Color() },
          offset: { value: 0 },
          opacity: { value: 0 },
          extent: { value: [WIDTH / 2, LENGTH / 2] },
          spacing: { value: SPACING },
        },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  // Color de las líneas: el texto del tema (sobre el fondo, como las líneas HUD).
  useEffect(() => {
    void theme;
    (material.uniforms.color.value as Color).copy(tokenColor('--color-text'));
  }, [material, theme]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    const node = mesh.current;
    if (!node) return;
    const weight = !reducedMotion && walk?.isRunning() ? walk.getEffectiveWeight() : 0;
    node.visible = weight > 0.01;
    setUniform(material, 'opacity', STRENGTH * weight);
    if (!node.visible) return;
    const dt = Math.min(0.05, delta || 0);
    const speed = BELT_SPEED * walk!.getEffectiveTimeScale() * mixer.timeScale;
    // Hacia atrás (−Z de la plataforma, +Y del plano): el valor da la vuelta en cada línea.
    offset.current = (offset.current + speed * dt) % SPACING;
    setUniform(material, 'offset', offset.current);
  });

  return (
    <mesh ref={mesh} material={material} rotation-x={-Math.PI / 2} position={[0, 0.0003, 0]} renderOrder={-1} visible={false} frustumCulled={false}>
      <planeGeometry args={[WIDTH, LENGTH]} />
    </mesh>
  );
}
