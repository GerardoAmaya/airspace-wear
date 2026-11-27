import {
  BufferAttribute,
  BufferGeometry,
  type Material,
  Matrix4,
  Quaternion,
  type SkinnedMesh,
  Vector3,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three';
import { type BodyMask, boneBase, restPositions } from './body-mask';

// Corte de las piernas del maniquí (presentación de zapato flotante,
// docs/avatar-fitting.md, sección 11). El cuerpo termina en la parte baja de
// la canilla con una tapa redondeada, como un maniquí de vitrina, y el
// sneaker sigue colgado del hueso del pie, a la vista entero, con un hueco
// limpio entre la pierna y el cuello del zapato.
//
// Cómo se corta: cada vértice de la pierna (cuerpo, medias y pantalones)
// lleva un atributo `shin` con su lado (1 izquierda, 2 derecha, 0 resto) y
// su altura en reposo sobre el tobillo, medida a lo largo de la canilla.
// El shader descarta lo que queda por debajo de la altura de corte (un
// uniform compartido): el borde es un plano limpio que sigue a la pierna en
// cada clip, sin trabajo por cuadro. Las mallas sin el atributo leen (0, 0)
// y nunca se cortan. La tapa se arma con la sección real de la capa de
// afuera (pantalón, media o cuerpo) a esa altura.

// Huesos que se cortan, por lado (nombre base, sin el prefijo de Mixamo).
const SIDE_BONES = [
  new Set(['LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToe_End']),
  new Set(['RightLeg', 'RightFoot', 'RightToeBase', 'RightToe_End']),
] as const;

export type Side = 0 | 1;

// Eje de cada canilla en reposo (espacio del avatar, m): del tobillo a la rodilla.
export interface LegFrame {
  side: Side;
  leg: string;
  ankle: Vector3;
  axis: Vector3;
  rest: Matrix4;
}

export function legFrames(rest: Map<string, Matrix4>): LegFrame[] {
  const frames: LegFrame[] = [];
  (['Left', 'Right'] as const).forEach((name, side) => {
    const leg = `mixamorig${name}Leg`;
    const legRest = rest.get(leg);
    const footRest = rest.get(`mixamorig${name}Foot`);
    if (!legRest || !footRest) return;
    const ankle = new Vector3().setFromMatrixPosition(footRest);
    const axis = new Vector3().setFromMatrixPosition(legRest).sub(ankle).normalize();
    frames.push({ side: side as Side, leg, ankle, axis, rest: legRest });
  });
  return frames;
}

// Altura del corte sobre el tobillo (m, a lo largo de la canilla) para una
// altura en el espacio del avatar en reposo.
export const heightOnShin = (frames: LegFrame[], y: number): number => {
  const frame = frames[0];
  return frame ? (y - frame.ankle.y) / Math.max(0.5, frame.axis.y) : 0;
};

// Hueso dominante de cada vértice (nombre base).
export function dominantBones(mesh: SkinnedMesh, geometry: BufferGeometry = mesh.geometry): string[] {
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  const names = mesh.skeleton.bones.map((bone) => boneBase(bone.name));
  const dominant: string[] = [];
  for (let i = 0; i < skinIndex.count; i++) {
    let best = 0;
    let name = '';
    for (let k = 0; k < 4; k++) {
      const weight = skinWeight.getComponent(i, k);
      if (weight > best) {
        best = weight;
        name = names[skinIndex.getComponent(i, k)] ?? '';
      }
    }
    dominant.push(name);
  }
  return dominant;
}

// Atributo `shin` (lado, altura) de cada vértice a partir de su posición en reposo.
export function shinValues(points: Float32Array, dominant: string[], frames: LegFrame[]): Float32Array {
  const values = new Float32Array(dominant.length * 2);
  const point = new Vector3();
  for (let i = 0; i < dominant.length; i++) {
    const frame = frames.find((item) => SIDE_BONES[item.side].has(dominant[i]));
    if (!frame) continue;
    point.fromArray(points, i * 3).sub(frame.ankle);
    values[i * 2] = frame.side + 1;
    values[i * 2 + 1] = point.dot(frame.axis);
  }
  return values;
}

// Datos de corte que cada malla cortable guarda en userData.legCut: posición
// en reposo, atributo shin y triángulos (para medir la sección).
export interface LegCutData {
  points: Float32Array;
  shin: Float32Array;
  triangles: ArrayLike<number>;
  uv: BufferGeometry['attributes'][string] | undefined;
}

// Capa de la tapa: la de más afuera que llega al corte gana.
export type LegLayer = 'catalog' | 'pants' | 'socks' | 'body';

const trianglesOf = (geometry: BufferGeometry): ArrayLike<number> =>
  geometry.getIndex()?.array ?? Uint32Array.from({ length: geometry.getAttribute('position').count }, (_, index) => index);

// Copia de la geometría (atributos e índice compartidos) con el atributo
// `shin`: la geometría del caché de drei queda intacta. Marca la malla como
// cortable con su capa.
export function makeCuttable(mesh: SkinnedMesh, rest: Map<string, Matrix4>, frames: LegFrame[], layer: LegLayer) {
  const source = mesh.geometry;
  const points = restPositions(mesh, source, rest);
  const shin = shinValues(points, dominantBones(mesh, source), frames);
  if (!shin.some((value, index) => index % 2 === 0 && value > 0)) return;
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(source.getIndex());
  for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.boundingBox = source.boundingBox;
  geometry.boundingSphere = source.boundingSphere;
  geometry.setAttribute('shin', new BufferAttribute(shin, 2));
  mesh.geometry = geometry;
  const data: LegCutData = { points, shin, triangles: trianglesOf(source), uv: source.getAttribute('uv') };
  mesh.userData.legCut = data;
  mesh.userData.legLayer = layer;
}

// El cuerpo del maniquí: el atributo va en la copia recortable de cada
// malla (la que dibuja BodyMask), con todos sus triángulos para la sección.
export function makeBodyCuttable(mask: BodyMask, frames: LegFrame[]) {
  for (const part of mask.cuttable()) {
    const shin = shinValues(part.points, part.dominant, frames);
    part.wrapper.setAttribute('shin', new BufferAttribute(shin, 2));
    const data: LegCutData = { points: part.points, shin, triangles: part.triangles, uv: undefined };
    part.mesh.userData.legCut = data;
    part.mesh.userData.legLayer = 'body';
  }
}

// ---------- Shader ----------

// Altura de corte compartida por todos los materiales cortables (m sobre el
// tobillo). Un solo Hangar dibuja a la vez, así que basta un uniform del
// módulo. Muy negativo: no corta nada.
export const LEG_CUT = { value: -10 };

// Media: altura en reposo (m sobre el tobillo) donde empiezan las franjas
// de arriba del puño, y altura sobre la que la media se oculta porque queda
// dentro del pantalón (el ruedo más un margen). 10: sin dato, no limita.
export const SOCK_CUFF = { value: 10 };
export const SOCK_HIDE = { value: 10 };
// Media a la vista (m, del corte a las franjas del puño o al ruedo) mínima
// para dibujar las dos franjas del corte: con una caña alta queda poca media
// y cuatro franjas en pocos centímetros se ven recargadas; quedan solo las de arriba.
const BAND_ROOM = 0.035;

// Franjas del puño en el borde cortado de la media (m sobre el corte).
const BAND_GLSL = /* glsl */ `
if (vShin.x > 0.5 && min(sockCuff, sockHide) - shinCut > ${BAND_ROOM.toFixed(3)}) {
  float cuff = vShin.y - shinCut;
  if ((cuff > 0.004 && cuff < 0.011) || (cuff > 0.016 && cuff < 0.021)) diffuseColor.rgb = shinBand;
}
`;

// Agrega el corte al material. En la media (`sock`), además, oculta lo que
// queda dentro del pantalón (así nunca asoma a través de la tela) y, con
// `band`, dibuja las franjas del puño en el borde cortado. Se suma a lo que
// ya tuviera onBeforeCompile (el relieve del tejido). Una sola vez por material.
export function addLegCut(material: Material, options: { band?: { r: number; g: number; b: number }; sock?: boolean } = {}) {
  if (material.userData.legCut) return;
  material.userData.legCut = true;
  const { band, sock = !!band } = options;
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    previous(shader, renderer);
    shader.uniforms.shinCut = LEG_CUT;
    if (sock) {
      shader.uniforms.sockCuff = SOCK_CUFF;
      shader.uniforms.sockHide = SOCK_HIDE;
    }
    if (band) shader.uniforms.shinBand = { value: band };
    const sockUniforms = sock ? '\nuniform float sockCuff;\nuniform float sockHide;' : '';
    const discard = sock
      ? 'if (vShin.x > 0.5 && (vShin.y < shinCut || vShin.y > sockHide)) discard;'
      : 'if (vShin.x > 0.5 && vShin.y < shinCut) discard;';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 shin;\nvarying vec2 vShin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShin = shin;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float shinCut;\nvarying vec2 vShin;${sockUniforms}${band ? '\nuniform vec3 shinBand;' : ''}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${discard}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${band ? BAND_GLSL : ''}`);
  };
  material.customProgramCacheKey = () => `${previousKey()}|leg-cut${sock ? '-sock' : ''}${band ? '-band' : ''}`;
  material.needsUpdate = true;
}

// Altura en reposo (m sobre el tobillo) del punto más bajo de la pierna en
// varias mallas cortables: el ruedo de un pantalón o el borde de abajo de
// las franjas del puño. Infinity si ninguna llega a la canilla.
export function lowestOnShin(sources: LegCutData[]): number {
  let lowest = Infinity;
  for (const { shin } of sources) {
    for (let i = 0; i < shin.length; i += 2) if (shin[i] > 0 && shin[i + 1] < lowest) lowest = shin[i + 1];
  }
  return lowest;
}

// ---------- Sección y tapa ----------

const BINS = 64;

export interface Section {
  // Radio por ángulo (m) alrededor del eje de la canilla y su uv (si hay).
  radius: Float32Array;
  uv: Float32Array | null;
}

// Base del plano de corte: el eje de la canilla pasa a +Y; U y V son las
// imágenes de +X y +Z.
export function cutBasis(frame: LegFrame) {
  const align = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), frame.axis);
  return { align, u: new Vector3(1, 0, 0).applyQuaternion(align), v: new Vector3(0, 0, 1).applyQuaternion(align) };
}

// Sección de varias mallas en el plano de corte de una pierna: cada arista
// que cruza la altura de corte aporta un punto; por sector de ángulo se queda
// el más alejado del eje. Null si nada cruza el plano.
export function measureSection(sources: LegCutData[], frame: LegFrame, height: number): Section | null {
  const { u, v } = cutBasis(frame);
  const origin = frame.ankle.clone().addScaledVector(frame.axis, height);
  const radius = new Float32Array(BINS).fill(-1);
  const withUv = sources.some((source) => !!source.uv);
  const uvs = withUv ? new Float32Array(BINS * 2) : null;
  const a = new Vector3();
  const b = new Vector3();
  const point = new Vector3();
  const flag = frame.side + 1;
  let found = 0;
  for (const source of sources) {
    const { points, shin, triangles, uv } = source;
    const cross = (i: number, j: number) => {
      if (shin[i * 2] !== flag || shin[j * 2] !== flag) return;
      const hi = shin[i * 2 + 1] - height;
      const hj = shin[j * 2 + 1] - height;
      if ((hi < 0) === (hj < 0)) return;
      const t = hi / (hi - hj);
      a.fromArray(points, i * 3);
      b.fromArray(points, j * 3);
      point.copy(a).lerp(b, t).sub(origin);
      const x = point.dot(u);
      const z = point.dot(v);
      const r = Math.hypot(x, z);
      const angle = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
      const bin = Math.min(BINS - 1, Math.floor((angle / (Math.PI * 2)) * BINS));
      if (r <= radius[bin]) return;
      radius[bin] = r;
      found++;
      if (uvs && uv) {
        uvs[bin * 2] = uv.getX(i) + (uv.getX(j) - uv.getX(i)) * t;
        uvs[bin * 2 + 1] = uv.getY(i) + (uv.getY(j) - uv.getY(i)) * t;
      }
    };
    for (let k = 0; k + 2 < triangles.length; k += 3) {
      const i0 = triangles[k];
      const i1 = triangles[k + 1];
      const i2 = triangles[k + 2];
      cross(i0, i1);
      cross(i1, i2);
      cross(i2, i0);
    }
  }
  if (found < 6) return null;
  // Sectores vacíos: interpolación entre los vecinos con dato (en círculo).
  const filled = Array.from(radius, (value, index) => (value >= 0 ? index : -1)).filter((index) => index >= 0);
  const out = new Float32Array(BINS);
  for (let bin = 0; bin < BINS; bin++) {
    if (radius[bin] >= 0) {
      out[bin] = radius[bin];
      continue;
    }
    let before = filled[filled.length - 1];
    let after = filled[0];
    for (const index of filled) {
      if (index < bin) before = index;
      else {
        after = index;
        break;
      }
    }
    const span = (after - before + BINS) % BINS || BINS;
    const t = ((bin - before + BINS) % BINS) / span;
    out[bin] = radius[before] + (radius[after] - radius[before]) * t;
    if (uvs) {
      uvs[bin * 2] = uvs[before * 2] + (uvs[after * 2] - uvs[before * 2]) * t;
      uvs[bin * 2 + 1] = uvs[before * 2 + 1] + (uvs[after * 2 + 1] - uvs[before * 2 + 1]) * t;
    }
  }
  return { radius: out, uv: uvs };
}

// Tapa del corte: el borde sigue la sección (apenas por fuera, para tapar la
// arista) y baja con un canto redondeado de radio `round` hasta un fondo
// plano. Espacio local: el eje de la canilla es +Y y el plano de corte, y = 0.
const RING_STEPS = 5;
export const CAP_EDGE = 0.0007;

export function capGeometry(section: Section, round: number): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let ring = 0; ring <= RING_STEPS; ring++) {
    const phi = (ring / RING_STEPS) * (Math.PI / 2);
    const depth = round * Math.sin(phi);
    const inset = round * (1 - Math.cos(phi));
    for (let bin = 0; bin < BINS; bin++) {
      const angle = ((bin + 0.5) / BINS) * Math.PI * 2;
      const r = Math.max(0.002, section.radius[bin] + CAP_EDGE - inset);
      positions.push(Math.cos(angle) * r, -depth, Math.sin(angle) * r);
      uvs.push(section.uv?.[bin * 2] ?? 0, section.uv?.[bin * 2 + 1] ?? 0);
    }
  }
  for (let ring = 0; ring < RING_STEPS; ring++) {
    for (let bin = 0; bin < BINS; bin++) {
      const next = (bin + 1) % BINS;
      const a = ring * BINS + bin;
      const b = ring * BINS + next;
      const c = (ring + 1) * BINS + bin;
      const d = (ring + 1) * BINS + next;
      index.push(a, b, c, b, d, c);
    }
  }
  // Fondo plano: abanico al centro.
  const center = positions.length / 3;
  let u = 0;
  let w = 0;
  for (let bin = 0; bin < BINS; bin++) {
    u += section.uv?.[bin * 2] ?? 0;
    w += section.uv?.[bin * 2 + 1] ?? 0;
  }
  positions.push(0, -round, 0);
  uvs.push(u / BINS, w / BINS);
  const last = RING_STEPS * BINS;
  for (let bin = 0; bin < BINS; bin++) index.push(last + bin, last + ((bin + 1) % BINS), center);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
