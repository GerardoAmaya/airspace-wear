'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import {
  Color,
  CustomBlending,
  type Group,
  type Mesh,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  NoColorSpace,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  SrcAlphaFactor,
  type Texture,
  TextureLoader,
  Vector2,
  Vector3,
} from 'three';
import { KEY_LIGHT_POSITION } from '@/components/three/kit/StudioLights';
import { useThemeStore } from '@/lib/theme';
import type { ShoeDims } from './geometry';
import type { HeroRig } from './rig';

// Humo de la primera entrada de la portada: el polvo que levanta el zapato
// al aterrizar. Partículas propias (dos mallas instanciadas de cuadros que
// miran a la cámara) con una textura de humo real: un atlas de 8 x 8 cuadros
// (flipbook) de una bocanada que se enrosca y se deshilacha, generado con
// scripts/fx/smoke-atlas.mjs (obra propia, sin licencias de terceros).
//
// Dos familias de partículas:
// - polvo: un estallido rápido, bajo y radial, a ras del piso alrededor de
//   la suela, que se frena enseguida (ease-out fuerte);
// - bocanadas: unas pocas más grandes que suben despacio, se abren y se
//   disipan en unos 2 s.
//
// Todo el movimiento ocurre en la GPU: cada partícula lleva su origen,
// desplazamiento, tamaño, vida, giro, cuadros del atlas y turbulencia, y por
// cuadro solo se escriben unos uniformes desde el rig (nunca estado de React).
//
// Luz: el shader compara la densidad del punto con la de un punto vecino
// hacia la luz principal (en pantalla): el lado que da a la luz se aclara y
// el opuesto se oscurece con un toque del acento. Sin texturas de normales.
//
// Capas: el humo de atrás se dibuja antes que el zapato (pasada opaca, con
// mezcla propia y sin prueba de profundidad) y el zapato lo tapa; el de
// adelante se dibuja al final, encima de todo. Así ningún cuadro corta el
// zapato con un borde duro. Cerca del piso (y = 0) el humo se desvanece
// (partícula blanda por altura): nunca se ve un borde recto bajo la suela.
//
// Vive solo mientras dura la entrada: se monta con la escena (así gl.compile
// ya compila su shader) y se desmonta al terminar, liberando geometría,
// material y textura.

// Atlas del humo: 8 x 8 cuadros. El liviano (512 px) es para el modo liviano
// (que hoy salta la entrada, pero queda listo).
export const SMOKE_ATLAS = { hero: '/fx/smoke-atlas.webp', lite: '/fx/smoke-atlas-lite.webp' } as const;
const ATLAS_GRID = 8;

interface Particle {
  origin: [number, number, number];
  // Desplazamiento total (m) y potencia de la curva de frenado.
  velocity: [number, number, number];
  size: [number, number];
  // Retraso y vida (s).
  time: [number, number];
  // Ángulo inicial, giro (rad/s) y opacidad.
  spin: [number, number, number];
  // Primer cuadro del atlas y cuántos recorre en su vida.
  frames: [number, number];
  // Turbulencia: amplitud en x, y, z (m) y fase.
  drift: [number, number, number, number];
  // Potencia del frenado, entrada y salida del fundido (fracciones de vida).
  motion: [number, number, number];
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

// Cantidad por familia y por capa (atrás / adelante del zapato): 56 en total.
const COUNT = { dust: { back: 18, front: 22 }, puff: { back: 8, front: 8 } };

// Estallido de polvo: nace en un anillo alrededor de la suela y sale
// disparado hacia afuera, a ras del piso; el aire lo frena enseguida.
function dustParticles(side: 1 | -1, count: number, rand: () => number, shoe: ShoeDims): Particle[] {
  const rx = shoe.length * 0.4;
  const rz = shoe.halfWidth * 1.15;
  return Array.from({ length: count }, () => {
    const angle = side * (0.03 + rand() * 0.94) * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ring = 0.85 + rand() * 0.2;
    // Más alcance hacia las puntas (el aire sale por delante y por detrás).
    const reach = (0.05 + rand() * 0.05) * (0.7 + 0.4 * Math.abs(cos));
    // Adelante del zapato el polvo es más tenue en el centro (no vela la capellada).
    const veil = side > 0 ? 0.45 + 0.55 * Math.abs(cos) : 1;
    return {
      origin: [cos * rx * ring, 0.008 + rand() * 0.01, sin * rz * ring],
      velocity: [cos * reach, 0.008 + rand() * 0.016, sin * reach * 0.7],
      size: [0.028 + rand() * 0.014, 0.07 + rand() * 0.04],
      time: [rand() * 0.05, 0.8 + rand() * 0.5],
      spin: [rand() * Math.PI * 2, (rand() - 0.5) * 1.6, (0.5 + rand() * 0.3) * veil],
      frames: [rand() * 10, 38 + rand() * 18],
      drift: [0.004, 0.003, 0.004, rand() * Math.PI * 2],
      motion: [3.4, 0.04, 0.32],
    };
  });
}

// Bocanadas: más grandes y lentas, sobre todo por las puntas del zapato
// (por los lados taparían la capellada). Suben, se abren y se disipan.
function puffParticles(side: 1 | -1, count: number, rand: () => number, shoe: ShoeDims): Particle[] {
  const rx = shoe.length * 0.42;
  const rz = shoe.halfWidth * 1.1;
  return Array.from({ length: count }, (_, index) => {
    const tip = index % 2 === 0 ? 0 : 1;
    const angle = side * (tip ? 0.72 + rand() * 0.24 : 0.04 + rand() * 0.24) * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ring = 0.8 + rand() * 0.2;
    const reach = 0.02 + rand() * 0.03;
    return {
      origin: [cos * rx * ring, 0.018 + rand() * 0.014, sin * rz * ring],
      velocity: [cos * reach, 0.04 + rand() * 0.04, sin * reach * 0.6],
      size: [0.045 + rand() * 0.02, 0.13 + rand() * 0.05],
      time: [0.04 + rand() * 0.14, 1.5 + rand() * 0.5],
      spin: [rand() * Math.PI * 2, (rand() - 0.5) * 0.7, 0.28 + rand() * 0.14],
      frames: [4 + rand() * 10, 46 + rand() * 13],
      drift: [0.008 + rand() * 0.006, 0.005, 0.008, rand() * Math.PI * 2],
      motion: [1.7, 0.12, 0.3],
    };
  });
}

// Duración total del humo (segundos de rig.smoke.time): la vida más larga
// de una partícula (retraso de hasta 0,18 s más 2 s).
export const SMOKE_LIFE = 2.2;

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform vec2 uLight;
attribute vec3 aOrigin;
attribute vec3 aVelocity;
attribute vec2 aSize;
attribute vec2 aTime;
attribute vec3 aSpin;
attribute vec2 aFrames;
attribute vec4 aDrift;
attribute vec3 aMotion;
varying vec4 vUv;
varying float vBlend;
varying vec2 vLight;
varying float vAlpha;
varying float vHeight;
const float GRID = ${ATLAS_GRID.toFixed(1)};
vec2 cell(float frame) {
  // El atlas se lee con flipY: la fila 0 (arriba en la imagen) es v alta.
  return vec2(mod(frame, GRID), GRID - 1.0 - floor(frame / GRID));
}
void main() {
  float t = (uTime - aTime.x) / aTime.y;
  // Fuera de su vida la partícula se colapsa (sin fragmentos).
  if (t <= 0.0 || t >= 1.0) {
    vAlpha = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // El aire frena el humo: sale rápido y se detiene (ease-out).
  float travel = 1.0 - pow(1.0 - t, aMotion.x);
  // Turbulencia: un vaivén lento que crece con la vida.
  vec3 wobble = aDrift.xyz * sin(aDrift.w + t * vec3(5.1, 3.7, 4.3)) * t;
  vec3 point = aOrigin + aVelocity * travel + wobble;
  float size = mix(aSize.x, aSize.y, 1.0 - pow(1.0 - t, 1.6));
  float angle = aSpin.x + aSpin.y * aTime.y * t;
  mat2 turn = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
  vec2 corner = turn * position.xy * size;
  vec4 view = modelViewMatrix * vec4(point * uScale, 1.0);
  view.xy += corner * uScale;
  gl_Position = projectionMatrix * view;
  // Altura aproximada del fragmento sobre el piso (la cámara casi no cabecea).
  vHeight = point.y + corner.y;
  // Cuadros del atlas: el actual y el siguiente, mezclados.
  float frame = clamp(aFrames.x + aFrames.y * t, 0.0, GRID * GRID - 1.001);
  float first = floor(frame);
  vBlend = frame - first;
  vUv = vec4((cell(first) + uv) / GRID, (cell(min(first + 1.0, GRID * GRID - 1.0)) + uv) / GRID);
  // Dirección de la luz en el espacio del cuadro (deshace el giro), como un
  // pequeño paso dentro del atlas.
  vLight = (uLight * turn) * (0.07 / GRID);
  vAlpha = aSpin.z * smoothstep(0.0, aMotion.y, t) * (1.0 - smoothstep(aMotion.z, 1.0, t));
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uLit;
uniform vec3 uShade;
uniform float uOpacity;
varying vec4 vUv;
varying float vBlend;
varying vec2 vLight;
varying float vAlpha;
varying float vHeight;
float density(vec2 offset) {
  return mix(texture2D(uMap, vUv.xy + offset).r, texture2D(uMap, vUv.zw + offset).r, vBlend);
}
void main() {
  if (vAlpha <= 0.0) discard;
  float d = density(vec2(0.0));
  // Partícula blanda: se desvanece al llegar al piso.
  float floorFade = smoothstep(-0.004, 0.022, vHeight);
  float alpha = d * vAlpha * uOpacity * floorFade;
  if (alpha < 0.004) discard;
  // Luz: más claro donde el vecino hacia la luz es menos denso (borde que
  // mira a la luz), más oscuro del lado opuesto y en lo espeso.
  float toward = density(vLight);
  float lit = clamp(0.62 + (d - toward) * 3.2 - d * 0.22, 0.0, 1.0);
  gl_FragColor = vec4(mix(uShade, uLit, lit), alpha);
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
  attribute('aFrames', 2, (particle) => particle.frames);
  attribute('aDrift', 4, (particle) => particle.drift);
  attribute('aMotion', 3, (particle) => particle.motion);
  geometry.instanceCount = particles.length;
  base.dispose();
  return geometry;
}

// Opacidad global y luz por tema: humo claro sobre fondo oscuro, gris suave
// sobre crema. lit aclara el lado de la luz; shade oscurece el opuesto y
// accent es cuánto acento lleva esa sombra.
const THEME_LOOK = {
  dark: { opacity: 0.7, lit: 1.12, shade: 0.5, accent: 0.2 },
  light: { opacity: 0.62, lit: 1.08, shade: 0.72, accent: 0.14 },
} as const;

// Lee un color del CSS dentro de la portada (--hero-smoke y --hero-accent,
// en HomeHero.module.css): una muestra lee el color ya resuelto.
function readCssColor(host: HTMLElement | null, variable: string, target: Color) {
  if (!host) return target;
  const probe = document.createElement('span');
  probe.style.color = `var(${variable})`;
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
  lite: boolean;
}

export function HeroSmoke({ dims, rig, lite }: SmokeProps) {
  const group = useRef<Group>(null);
  const back = useRef<Mesh>(null);
  const texture = useRef<Texture | null>(null);
  const theme = useThemeStore((state) => state.theme);
  const gl = useThree((state) => state.gl);
  const scratch = useMemo(() => ({ light: new Vector3(), screen: new Vector2() }), []);

  const layers = useMemo(() => {
    const rand = random(11);
    const uniforms = {
      uTime: { value: -1 },
      uScale: { value: 1 },
      uLight: { value: new Vector2(0.45, 0.9).normalize() },
      uMap: { value: null as Texture | null },
      uLit: { value: new Color() },
      uShade: { value: new Color() },
      uOpacity: { value: 0 },
    };
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
    const back = [...dustParticles(-1, COUNT.dust.back, rand, dims), ...puffParticles(-1, COUNT.puff.back, rand, dims)];
    const ahead = [...dustParticles(1, COUNT.dust.front, rand, dims), ...puffParticles(1, COUNT.puff.front, rand, dims)];
    return {
      uniforms,
      back: { geometry: buildGeometry(back), material: material(false) },
      front: { geometry: buildGeometry(ahead), material: material(true) },
    };
  }, [dims]);

  // Los uniformes (compartidos por las dos capas) se escriben a través del
  // material de la malla, en un ref: nunca estado de React.
  const uniformsOf = () => (back.current?.material as ShaderMaterial | undefined)?.uniforms;

  // Atlas: se descarga al montar (la escena se monta antes del vuelo) y se
  // sube a la GPU apenas llega. Si no llegara a tiempo, no se dibuja humo.
  useEffect(() => {
    let alive = true;
    const uniforms = (back.current?.material as ShaderMaterial | undefined)?.uniforms;
    new TextureLoader().load(lite ? SMOKE_ATLAS.lite : SMOKE_ATLAS.hero, (loaded) => {
      if (!alive) {
        loaded.dispose();
        return;
      }
      // Densidad (dato), no color: sin conversión de espacio de color.
      loaded.colorSpace = NoColorSpace;
      // Sin mipmaps: los cuadros del atlas no se mezclan entre sí.
      loaded.generateMipmaps = false;
      loaded.minFilter = LinearFilter;
      loaded.magFilter = LinearFilter;
      gl.initTexture(loaded);
      texture.current = loaded;
      if (uniforms) uniforms.uMap.value = loaded;
    });
    return () => {
      alive = false;
      if (uniforms) uniforms.uMap.value = null;
      texture.current?.dispose();
      texture.current = null;
    };
  }, [gl, lite, layers]);

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

  // Colores por tema (y si cambia el tema a mitad de la entrada): la luz es
  // el humo aclarado; la sombra, el humo oscurecido con un toque del acento.
  useEffect(() => {
    const host = gl.domElement.parentElement;
    const look = THEME_LOOK[theme];
    const smoke = readCssColor(host, '--hero-smoke', new Color());
    const accent = readCssColor(host, '--hero-accent', smoke.clone());
    const uniforms = (back.current?.material as ShaderMaterial | undefined)?.uniforms;
    if (!uniforms) return;
    (uniforms.uLit.value as Color).copy(smoke).multiplyScalar(look.lit);
    (uniforms.uShade.value as Color).copy(smoke).multiplyScalar(look.shade).lerp(accent, look.accent);
  }, [theme, gl, layers]);

  useFrame(({ camera }) => {
    const node = group.current;
    const uniforms = uniformsOf();
    if (!node || !uniforms) return;
    // Sin atlas todavía: nada que dibujar.
    node.visible = uniforms.uMap.value !== null;
    const { pose, smoke } = rig.current;
    // El humo queda en el lugar de la portada (sin la flotación ni la entrada).
    node.position.set(pose.x, pose.y - (dims.height / 2) * pose.scale, pose.z);
    uniforms.uTime.value = smoke.time;
    uniforms.uScale.value = pose.scale;
    // Si se baja a los detalles a mitad de la entrada, el humo se apaga con la portada.
    uniforms.uOpacity.value = THEME_LOOK[theme].opacity * pose.idle;
    // Luz principal llevada a la vista: su dirección en pantalla.
    const light = scratch.light.set(...KEY_LIGHT_POSITION).transformDirection(camera.matrixWorldInverse);
    const screen = scratch.screen.set(light.x, light.y);
    if (screen.lengthSq() > 1e-6) (uniforms.uLight.value as Vector2).copy(screen.normalize());
  });

  return (
    <group ref={group}>
      <mesh ref={back} geometry={layers.back.geometry} material={layers.back.material} renderOrder={-1} frustumCulled={false} />
      <mesh geometry={layers.front.geometry} material={layers.front.material} renderOrder={10} frustumCulled={false} />
    </group>
  );
}
