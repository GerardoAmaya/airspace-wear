'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import {
  Color,
  CustomBlending,
  type Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  SrcAlphaFactor,
} from 'three';
import { useThemeStore } from '@/lib/theme';
import type { ShoeDims } from './geometry';
import type { HeroRig } from './rig';

// Humo de la primera entrada de la portada: la bocanada de polvo que
// levanta el zapato al aterrizar. Partículas propias, sin dependencias: dos mallas instanciadas
// de cuadros que miran a la cámara, con la forma de bocanada hecha en el
// shader (sin textura). Todo el movimiento ocurre en la GPU: cada partícula
// lleva su origen, desplazamiento, tamaño, vida y giro, y por cuadro solo se
// escriben tres uniformes desde el rig (nunca estado de React).
//
// Capas: el humo de atrás se dibuja antes que el zapato (pasada opaca, con
// mezcla propia y sin prueba de profundidad) y el zapato lo tapa; el de
// adelante se dibuja al final, encima de todo. Así ningún cuadro corta el
// zapato con un borde duro.
//
// Vive solo mientras dura la entrada: se monta con la escena (así gl.compile
// y los dos primeros cuadros ya compilan su shader) y se desmonta al
// terminar, liberando geometría y material.

interface Particle {
  origin: [number, number, number];
  velocity: [number, number, number];
  size: [number, number];
  time: [number, number];
  spin: [number, number, number];
  fade: [number, number];
}

// Generador con semilla: el mismo humo en cada recarga (comparable).
function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cantidad de partículas (atrás y adelante del zapato).
const SMOKE_COUNT = { back: 24, front: 28 };

// Bocanada de polvo al tocar el piso. Nace en un anillo alrededor de la suela
// y se abre hacia afuera, ras del piso, mientras sube un poco.
function landingParticles(side: 1 | -1, count: number, rand: () => number, shoe: ShoeDims): Particle[] {
  const rx = shoe.length * 0.36;
  const rz = shoe.length * 0.18;
  return Array.from({ length: count }, () => {
    const angle = side * (0.06 + rand() * 0.88) * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ring = 0.7 + rand() * 0.35;
    const reach = 0.05 + rand() * 0.07;
    return {
      origin: [cos * rx * ring, 0.004 + rand() * 0.012, sin * rz * ring + side * 0.03],
      velocity: [cos * reach, 0.03 + rand() * 0.05, sin * reach * 0.8],
      size: [0.04 + rand() * 0.03, 0.11 + rand() * 0.07],
      time: [rand() * 0.1, 0.9 + rand() * 0.4],
      spin: [rand() * Math.PI * 2, (rand() - 0.5) * 1.4, 0.5 + rand() * 0.4],
      fade: [0.07, 0.22],
    };
  });
}

// Duración total del humo (segundos de rig.smoke.time): la vida más larga
// de una partícula (retraso de hasta 0,1 s más 1,3 s).
export const SMOKE_LIFE = 1.4;

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute vec3 aOrigin;
attribute vec3 aVelocity;
attribute vec2 aSize;
attribute vec2 aTime;
attribute vec3 aSpin;
attribute vec2 aFade;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  float t = (uTime - aTime.x) / aTime.y;
  vUv = uv;
  vSeed = aSpin.x;
  // Fuera de su vida la partícula se colapsa (sin fragmentos).
  if (t <= 0.0 || t >= 1.0) {
    vAlpha = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // El aire frena el humo: sale rápido y se detiene.
  float travel = 1.0 - pow(1.0 - t, 2.4);
  vec3 point = (aOrigin + aVelocity * travel) * uScale;
  float size = mix(aSize.x, aSize.y, 1.0 - pow(1.0 - t, 1.7)) * uScale;
  float angle = aSpin.x + aSpin.y * aTime.y * t;
  vec2 corner = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * position.xy * size;
  vec4 view = modelViewMatrix * vec4(point, 1.0);
  view.xy += corner;
  gl_Position = projectionMatrix * view;
  vAlpha = aSpin.z * smoothstep(0.0, aFade.x, t) * (1.0 - smoothstep(aFade.y, 1.0, t));
}
`;

// Bocanada blanda: un círculo difuso de borde irregular, con grumos suaves
// adentro. Unas pocas funciones seno por fragmento, sin textura.
const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float edge = 0.82 + 0.06 * sin(a * 2.0 + vSeed * 5.0) + 0.04 * sin(a * 3.0 - vSeed * 3.0 + r * 3.0);
  float mass = 1.0 - smoothstep(0.0, edge, r);
  mass *= mass;
  float lumps = 0.84 + 0.16 * sin(p.x * 3.0 + vSeed * 7.0) * sin(p.y * 2.6 - vSeed * 4.0);
  float alpha = mass * lumps * vAlpha * uOpacity;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

function buildGeometry(particles: Particle[]) {
  const base = new PlaneGeometry(1, 1);
  const geometry = new InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('uv', base.getAttribute('uv'));
  const attribute = (name: string, size: number, pick: (particle: Particle) => readonly number[]) => {
    const data = new Float32Array(particles.length * size);
    particles.forEach((particle, index) => data.set(pick(particle), index * size));
    geometry.setAttribute(name, new InstancedBufferAttribute(data, size));
  };
  attribute('aOrigin', 3, (particle) => particle.origin);
  attribute('aVelocity', 3, (particle) => particle.velocity);
  attribute('aSize', 2, (particle) => particle.size);
  attribute('aTime', 2, (particle) => particle.time);
  attribute('aSpin', 3, (particle) => particle.spin);
  attribute('aFade', 2, (particle) => particle.fade);
  geometry.instanceCount = particles.length;
  return geometry;
}

// Opacidad global por tema: humo claro sobre fondo oscuro, gris suave sobre crema.
const THEME_OPACITY = { dark: 0.62, light: 0.5 } as const;

// Color del humo desde el CSS (--hero-smoke, en HomeHero.module.css): una
// muestra dentro de la portada lee el color ya mezclado con el acento.
function readSmokeColor(host: HTMLElement | null, target: Color) {
  if (!host) return target;
  const probe = document.createElement('span');
  probe.style.color = 'var(--hero-smoke)';
  probe.style.display = 'none';
  host.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  const numbers = (value.match(/-?[\d.]+/g) ?? []).map(Number);
  if (numbers.length < 3 || numbers.some((number) => !Number.isFinite(number))) return target;
  // color(srgb r g b) viene en 0..1; el formato clásico, en 0..255.
  const divisor = value.startsWith('color(') ? 1 : 255;
  return target.setRGB(numbers[0] / divisor, numbers[1] / divisor, numbers[2] / divisor);
}

interface SmokeProps {
  dims: ShoeDims;
  rig: RefObject<HeroRig>;
}

export function HeroSmoke({ dims, rig }: SmokeProps) {
  const group = useRef<Group>(null);
  const front = useRef<Mesh>(null);
  const theme = useThemeStore((state) => state.theme);
  const domElement = useThree((state) => state.gl.domElement);

  const layers = useMemo(() => {
    const rand = random(7);
    const uniforms = { uTime: { value: -1 }, uScale: { value: 1 }, uColor: { value: new Color() }, uOpacity: { value: 0 } };
    const material = (front: boolean) =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        // Atrás: pasada opaca con mezcla propia (se dibuja antes que el zapato).
        // Adelante: transparente y al final.
        transparent: front,
        blending: CustomBlending,
        blendSrc: SrcAlphaFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneMinusSrcAlphaFactor,
        depthTest: false,
        depthWrite: false,
      });
    return {
      uniforms,
      back: { geometry: buildGeometry(landingParticles(-1, SMOKE_COUNT.back, rand, dims)), material: material(false) },
      front: { geometry: buildGeometry(landingParticles(1, SMOKE_COUNT.front, rand, dims)), material: material(true) },
    };
  }, [dims]);

  // Se libera todo al desmontar: después de la entrada el humo no cuesta nada.
  useEffect(
    () => () => {
      for (const layer of [layers.back, layers.front]) {
        layer.geometry.dispose();
        layer.material.dispose();
      }
    },
    [layers],
  );

  // Color por tema (y si cambia el tema a mitad de la entrada).
  // Los uniformes (compartidos por las dos capas) se escriben a través del
  // material de la malla, en un ref: nunca estado de React.
  const uniformsOf = () => (front.current?.material as ShaderMaterial | undefined)?.uniforms;
  useEffect(() => {
    const uniforms = (front.current?.material as ShaderMaterial | undefined)?.uniforms;
    if (uniforms) readSmokeColor(domElement.parentElement, uniforms.uColor.value as Color);
  }, [theme, domElement, layers]);

  useFrame(() => {
    const node = group.current;
    const uniforms = uniformsOf();
    if (!node || !uniforms) return;
    const { pose, smoke } = rig.current;
    // El humo queda en el lugar de la portada (sin la flotación ni la entrada).
    node.position.set(pose.x, pose.y - (dims.height / 2) * pose.scale, pose.z);
    uniforms.uTime.value = smoke.time;
    uniforms.uScale.value = pose.scale;
    // Si se baja a los detalles a mitad de la entrada, el humo se apaga con la portada.
    uniforms.uOpacity.value = THEME_OPACITY[theme] * pose.idle;
  });

  return (
    <group ref={group}>
      <mesh geometry={layers.back.geometry} material={layers.back.material} renderOrder={-1} frustumCulled={false} />
      <mesh ref={front} geometry={layers.front.geometry} material={layers.front.material} renderOrder={10} frustumCulled={false} />
    </group>
  );
}
