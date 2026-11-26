'use client';

import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  type Bone,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  type Material,
  Matrix4,
  type Mesh,
  MeshStandardMaterial,
  type Object3D,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three';
import {
  type AccessoryKey,
  COLOR_SLOTS,
  type ColorSlot,
  type GarmentKey,
  LENS_TOKEN,
  OUTFIT_RULES,
  type OutfitLook,
  type OutfitRules,
} from '@/lib/avatar/outfit';
import { gsap } from '@/lib/motion/gsap';
import { DURATION, EASE } from '@/lib/motion/tokens';

// Vestuario del maniquí (docs/avatar-fitting.md, sección 9). El GLB del
// vestuario trae el mismo esqueleto que el avatar: cada prenda se vuelve a
// enlazar a los huesos del avatar por nombre, así sigue cada clip. La gorra y
// los lentes son rígidos y cuelgan del hueso de la cabeza. El cuerpo que queda
// bajo la ropa visible no se dibuja (mismas reglas que generaron las prendas,
// outfit-rules.json), para que nunca asome en ninguna pose.

const GARMENTS: readonly GarmentKey[] = ['shirt', 'tank', 'shorts', 'pants', 'socks'];
const ACCESSORIES: readonly AccessoryKey[] = ['cap', 'glasses'];
const SLOT_OF: Record<GarmentKey, ColorSlot> = { shirt: 'shirt', tank: 'shirt', shorts: 'bottoms', pants: 'bottoms', socks: 'socks' };
const BIT_OF: Record<GarmentKey, number> = { shirt: 1, tank: 2, shorts: 4, pants: 8, socks: 16 };

// Color de un token CSS (--color-garment-*) o de un dato (acento del producto).
function readColor(value: string): Color {
  if (!value.startsWith('--')) return new Color(value);
  return new Color(getComputedStyle(document.documentElement).getPropertyValue(value).trim() || 'gray');
}

// Nombre base del hueso: "mixamorigLeftArm" -> "LeftArm".
const boneBase = (name: string) => name.replace(/^mixamorig\d*/, '');

// ---------- Tejido procedural ----------

// Relieve de tejido de punto en el shader: costillas finas sobre la posición
// de la tela en reposo (se mueve con la prenda). Cuesta cero bytes y se apaga
// de lejos, donde el patrón sería más fino que un píxel. Solo fuera del modo liviano.
const KNIT_GLSL = /* glsl */ `
varying vec3 vKnit;
float knitHeight(vec3 p) {
  vec3 q = p * 1400.0;
  return 0.6 * sin(q.y + 0.6 * sin(q.x * 0.5)) + 0.4 * sin(q.x * 0.9 + q.z * 0.9);
}
vec3 knitNormal(vec3 n, float faceDirection) {
  float h = knitHeight(vKnit);
  float cycles = length(fwidth(vKnit * 1400.0)) / 6.2832;
  float fade = 1.0 - smoothstep(0.18, 0.55, cycles);
  vec2 dHdxy = vec2(dFdx(h), dFdy(h)) * 0.06 * fade;
  vec3 sx = normalize(dFdx(-vViewPosition));
  vec3 sy = normalize(dFdy(-vViewPosition));
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * n - grad);
}
`;

function addKnit(material: MeshStandardMaterial, metersPerUnit: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.knitScale = { value: metersPerUnit };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float knitScale;\nvarying vec3 vKnit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKnit = position * knitScale;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${KNIT_GLSL}`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = knitNormal(normal, faceDirection);');
  };
  material.customProgramCacheKey = () => `knit-${metersPerUnit.toFixed(5)}`;
}

const fabric = () => new MeshStandardMaterial({ roughness: 0.84, metalness: 0, side: DoubleSide, envMapIntensity: 0.65 });

// ---------- Cuerpo bajo la ropa ----------

interface BodyMask {
  mesh: SkinnedMesh;
  original: BufferGeometry;
  wrapper: BufferGeometry;
  triangles: ArrayLike<number>;
  // Bits de las prendas que cubren cada vértice (BIT_OF).
  covered: Uint8Array;
}

// Posición en reposo de cada vértice (m, espacio del avatar): skinning en la
// CPU con las matrices de reposo de los huesos, medidas antes de animar.
function restPositions(mesh: SkinnedMesh, geometry: BufferGeometry, rest: Map<string, Matrix4>): Float32Array {
  const position = geometry.getAttribute('position');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  const joint = mesh.skeleton.bones.map((bone, index) => {
    const world = rest.get(bone.name) ?? bone.matrixWorld;
    return new Matrix4().multiplyMatrices(world, mesh.skeleton.boneInverses[index]).multiply(mesh.bindMatrix);
  });
  const out = new Float32Array(position.count * 3);
  const vertex = new Vector3();
  const part = new Vector3();
  const sum = new Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    sum.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const weight = skinWeight.getComponent(i, k);
      if (!weight) continue;
      part.copy(vertex).applyMatrix4(joint[skinIndex.getComponent(i, k)]).multiplyScalar(weight);
      sum.add(part);
    }
    out.set([sum.x, sum.y, sum.z], i * 3);
  }
  return out;
}

// Marca, por vértice, qué prendas lo cubren: el hueso dominante está en la
// lista de la prenda y el vértice queda dentro de los cortes y fuera de las
// aberturas con un margen (hideInset). Mismo criterio que outfit.py.
function coverage(mesh: SkinnedMesh, geometry: BufferGeometry, rest: Map<string, Matrix4>, rules: OutfitRules): Uint8Array {
  const points = restPositions(mesh, geometry, rest);
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  const names = mesh.skeleton.bones.map((bone) => boneBase(bone.name));
  const restOf = new Map<string, Vector3>();
  for (const [name, matrix] of rest) restOf.set(boneBase(name), new Vector3().setFromMatrixPosition(matrix));
  const head = (name: string) => restOf.get(name) ?? new Vector3();
  const hips = head('Hips');
  const forward = new Vector3(...rules.forward);
  const inset = rules.hideInset;

  const garments = GARMENTS.map((key) => {
    const garment = rules.garments[key];
    return {
      bit: BIT_OF[key],
      bones: new Set(garment.bones),
      cuts: garment.cuts.map((cut) => {
        const a = head(cut.from);
        const axis = head(cut.to).clone().sub(a);
        const length = axis.length() || 1;
        const side = cut.from.startsWith('Left') ? 1 : cut.from.startsWith('Right') ? -1 : 0;
        const limit = cut.keep === 'below' ? cut.t - inset / length : cut.t + inset / length;
        return { a, axis, lengthSq: length * length, side, keep: cut.keep, limit };
      }),
      holes: garment.holes.map((hole) => {
        const a = head(hole.from);
        const axis = head(hole.to).clone().sub(a);
        const length = axis.length() || 1;
        return {
          center: a.clone().addScaledVector(forward, hole.forward ?? 0),
          direction: axis.clone().normalize(),
          length,
          minT: hole.minT ?? -1,
          radius: hole.radius + inset,
        };
      }),
    };
  });

  const covered = new Uint8Array(points.length / 3);
  const point = new Vector3();
  const relative = new Vector3();
  for (let i = 0; i < covered.length; i++) {
    point.fromArray(points, i * 3);
    let best = 0;
    let dominant = '';
    for (let k = 0; k < 4; k++) {
      const weight = skinWeight.getComponent(i, k);
      if (weight > best) {
        best = weight;
        dominant = names[skinIndex.getComponent(i, k)] ?? '';
      }
    }
    let bits = 0;
    for (const garment of garments) {
      if (!garment.bones.has(dominant)) continue;
      const inside = garment.cuts.every((cut) => {
        if (cut.side && (point.x - hips.x) * cut.side <= 0) return true;
        const t = relative.copy(point).sub(cut.a).dot(cut.axis) / cut.lengthSq;
        return cut.keep === 'below' ? t <= cut.limit : t >= cut.limit;
      });
      if (!inside) continue;
      const open = garment.holes.some((hole) => {
        relative.copy(point).sub(hole.center);
        const along = relative.dot(hole.direction);
        if (along / hole.length < hole.minT) return false;
        return relative.addScaledVector(hole.direction, -along).length() < hole.radius;
      });
      if (!open) bits |= garment.bit;
    }
    covered[i] = bits;
  }
  return covered;
}

// Copia de la geometría del cuerpo con su propio índice (los atributos se
// comparten): así el cuerpo del caché de drei queda intacto.
function wrap(original: BufferGeometry): { wrapper: BufferGeometry; triangles: ArrayLike<number> } {
  const wrapper = new BufferGeometry();
  for (const [name, attribute] of Object.entries(original.attributes)) wrapper.setAttribute(name, attribute);
  const source = original.getIndex();
  const count = original.getAttribute('position').count;
  const triangles = source ? source.array : Uint32Array.from({ length: count }, (_, index) => index);
  const Kind = count > 65535 ? Uint32Array : Uint16Array;
  wrapper.setIndex(new BufferAttribute(new Kind(triangles.length), 1));
  for (const group of original.groups) wrapper.addGroup(group.start, group.count, group.materialIndex);
  wrapper.boundingBox = original.boundingBox;
  wrapper.boundingSphere = original.boundingSphere;
  return { wrapper, triangles };
}

// Deja en el índice solo los triángulos que no quedan del todo bajo una
// prenda visible. Se hace una vez por cambio de prenda, nunca por cuadro.
function applyMask(mask: BodyMask, visible: number) {
  const index = mask.wrapper.getIndex();
  if (!index) return;
  const target = index.array as Uint16Array | Uint32Array;
  const { triangles, covered } = mask;
  let kept = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i];
    const b = triangles[i + 1];
    const c = triangles[i + 2];
    if (covered[a] & visible && covered[b] & visible && covered[c] & visible) continue;
    target[kept++] = a;
    target[kept++] = b;
    target[kept++] = c;
  }
  index.needsUpdate = true;
  mask.wrapper.setDrawRange(0, kept);
}

// ---------- Armado ----------

interface Rigid {
  object: Object3D;
  bone: Object3D;
}

interface OutfitRig {
  holder: Group;
  garments: Record<GarmentKey, SkinnedMesh[]>;
  accessories: Record<AccessoryKey, Rigid | null>;
  materials: Record<ColorSlot, MeshStandardMaterial>;
  lens: MeshStandardMaterial;
  body: BodyMask[];
}

const ownerOf = (object: Object3D, rules: OutfitRules): GarmentKey | AccessoryKey | null => {
  for (let node: Object3D | null = object; node; node = node.parent) {
    for (const key of GARMENTS) if (node.name === rules.garments[key].node) return key;
    for (const key of ACCESSORIES) if (node.name === rules.accessories[key].node) return key;
  }
  return null;
};

function buildRig(source: Object3D, avatar: Object3D, rest: Map<string, Matrix4>, lite: boolean): OutfitRig {
  const rules = OUTFIT_RULES;
  source.updateMatrixWorld(true);
  const bones = new Map<string, Bone>();
  avatar.traverse((object) => {
    if ((object as Bone).isBone) bones.set(object.name, object as Bone);
  });

  const materials = Object.fromEntries(COLOR_SLOTS.map((slot) => [slot, fabric()])) as Record<ColorSlot, MeshStandardMaterial>;
  materials.glasses.roughness = 0.35;
  materials.glasses.side = FrontSide;
  // Short y pantalón de tela deportiva, con algo de brillo: con la camiseta
  // del mismo color (negro sobre negro en el tema claro) se leen como dos piezas.
  materials.bottoms.roughness = 0.7;
  materials.bottoms.envMapIntensity = 0.8;
  // Las medias ceden ante el zapato: si una cara queda casi en el mismo
  // lugar que el cuello del zapato, gana el zapato.
  for (const material of [materials.socks, materials.stripes]) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 4;
  }
  const lens = new MeshStandardMaterial({ roughness: 0.12, metalness: 0.4, color: readColor(LENS_TOKEN), envMapIntensity: 1 });

  const holder = new Group();
  holder.name = 'Outfit';
  const garments: OutfitRig['garments'] = { shirt: [], tank: [], shorts: [], pants: [], socks: [] };
  const accessories: OutfitRig['accessories'] = { cap: null, glasses: null };
  let skinnedScale = 0;

  source.traverse((object) => {
    const mesh = object as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const key = ownerOf(mesh, rules) as GarmentKey | null;
    if (!key || !(key in garments)) return;
    const mapped = mesh.skeleton.bones.map((bone) => bones.get(bone.name));
    if (mapped.some((bone) => !bone)) return;
    // Las franjas del puño de las medias tienen material propio.
    const stripe = (mesh.material as Material).name === 'outfit-stripe';
    const copy = new SkinnedMesh(mesh.geometry, stripe ? materials.stripes : materials[SLOT_OF[key]]);
    copy.name = mesh.name;
    copy.bind(new Skeleton(mapped as Bone[], mesh.skeleton.boneInverses), mesh.bindMatrix);
    // Su caja es la del reposo: sin recorte por cámara, como el cuerpo.
    copy.frustumCulled = false;
    copy.userData.outfit = true;
    holder.add(copy);
    garments[key].push(copy);
    // Metros por unidad del atributo (la cuantización cambia la escala): se
    // mide con dos vértices en reposo, para el relieve del tejido.
    if (!skinnedScale) {
      const points = restPositions(mesh, mesh.geometry, rest);
      const position = mesh.geometry.getAttribute('position');
      const far = position.count - 1;
      const a = new Vector3().fromBufferAttribute(position, 0);
      const b = new Vector3().fromBufferAttribute(position, far);
      const meters = new Vector3().fromArray(points, 0).distanceTo(new Vector3().fromArray(points, far * 3));
      skinnedScale = a.distanceTo(b) > 0 ? meters / a.distanceTo(b) : 0;
    }
  });

  for (const key of ACCESSORIES) {
    const node = source.getObjectByName(rules.accessories[key].node);
    const bone = node?.parent ? bones.get(node.parent.name) : undefined;
    if (!node || !bone) continue;
    const object = node.clone(true);
    let scale = 0;
    object.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const name = (mesh.material as Material).name;
      mesh.material = key === 'cap' ? materials.cap : name === 'outfit-lens' ? lens : materials.glasses;
      mesh.userData.outfit = true;
    });
    node.traverse((child) => {
      if ((child as Mesh).isMesh && !scale) scale = child.matrixWorld.getMaxScaleOnAxis();
    });
    if (key === 'cap' && !lite && scale) addKnit(materials.cap, scale);
    accessories[key] = { object, bone };
  }
  if (!lite && skinnedScale) {
    addKnit(materials.shirt, skinnedScale);
    addKnit(materials.bottoms, skinnedScale);
    addKnit(materials.socks, skinnedScale);
  }

  // Cuerpo: las mallas con esqueleto del avatar (superficie y articulaciones).
  const body: BodyMask[] = [];
  avatar.traverse((object) => {
    const mesh = object as SkinnedMesh;
    if (!mesh.isSkinnedMesh || mesh.userData.outfit) return;
    const original = (mesh.userData.outfitOriginal as BufferGeometry | undefined) ?? mesh.geometry;
    const { wrapper, triangles } = wrap(original);
    body.push({ mesh, original, wrapper, triangles, covered: coverage(mesh, original, rest, rules) });
  });

  return { holder, garments, accessories, materials, lens, body };
}

// Escrituras sobre objetos de three.js (fuera de React).
const setVisible = (object: Object3D, visible: boolean) => void (object.visible = visible);
const setColor = (material: MeshStandardMaterial, color: Color) => {
  material.color.copy(color);
  material.userData.colored = true;
};
const setGeometry = (mesh: SkinnedMesh, geometry: BufferGeometry, original?: BufferGeometry) => {
  mesh.geometry = geometry;
  if (original) mesh.userData.outfitOriginal = original;
  else delete mesh.userData.outfitOriginal;
};

export interface AvatarOutfitProps {
  url: string;
  look: OutfitLook;
  avatar: Object3D;
  // Matrices de mundo de cada hueso en reposo (antes de animar).
  rest: Map<string, Matrix4>;
  lite: boolean;
  reducedMotion: boolean;
  onReady(): void;
}

export function AvatarOutfit({ url, look, avatar, rest, lite, reducedMotion, onReady }: AvatarOutfitProps) {
  const { scene } = useGLTF(url);
  const rig = useMemo(() => buildRig(scene, avatar, rest, lite), [scene, avatar, rest, lite]);
  const get = useThree((state) => state.get);

  // Monta las prendas y el cuerpo recortable; al salir, todo vuelve como estaba.
  useEffect(() => {
    avatar.add(rig.holder);
    for (const accessory of Object.values(rig.accessories)) accessory?.bone.add(accessory.object);
    for (const mask of rig.body) setGeometry(mask.mesh, mask.wrapper, mask.original);
    // Compila los materiales nuevos antes de mostrarlos.
    const { gl, scene: root, camera } = get();
    gl.compile(root, camera);
    onReady();
    return () => {
      avatar.remove(rig.holder);
      for (const accessory of Object.values(rig.accessories)) accessory?.bone.remove(accessory.object);
      for (const mask of rig.body) setGeometry(mask.mesh, mask.original);
      for (const material of [...Object.values(rig.materials), rig.lens]) {
        gsap.killTweensOf(material.color);
        material.dispose();
      }
    };
  }, [rig, avatar, get, onReady]);

  // Prendas visibles y cuerpo oculto debajo.
  const { shirt, tank, shorts, pants, socks } = look.garments;
  const { cap, glasses } = look.accessories;
  useEffect(() => {
    const shown: Record<GarmentKey, boolean> = { shirt, tank, shorts, pants, socks };
    let bits = 0;
    for (const key of GARMENTS) {
      for (const mesh of rig.garments[key]) setVisible(mesh, shown[key]);
      if (shown[key] && rig.garments[key].length) bits |= BIT_OF[key];
    }
    for (const mask of rig.body) applyMask(mask, bits);
    if (rig.accessories.cap) setVisible(rig.accessories.cap.object, cap);
    if (rig.accessories.glasses) setVisible(rig.accessories.glasses.object, glasses);
  }, [rig, shirt, tank, shorts, pants, socks, cap, glasses]);

  // Color de cada prenda: un fundido corto (GSAP sobre el color del material,
  // fuera de React); con movimiento reducido, directo. La primera vez, directo.
  const { shirt: shirtColor, bottoms: bottomsColor, socks: socksColor, stripes: stripesColor, cap: capColor, glasses: glassesColor } =
    look.colors;
  useEffect(() => {
    const colors: Record<ColorSlot, string> = {
      shirt: shirtColor,
      bottoms: bottomsColor,
      socks: socksColor,
      stripes: stripesColor,
      cap: capColor,
      glasses: glassesColor,
    };
    for (const slot of COLOR_SLOTS) {
      const material = rig.materials[slot];
      const target = readColor(colors[slot]);
      gsap.killTweensOf(material.color);
      if (reducedMotion || !material.userData.colored) {
        setColor(material, target);
      } else {
        gsap.to(material.color, { r: target.r, g: target.g, b: target.b, duration: DURATION.ui, ease: EASE.out.gsap });
      }
    }
  }, [rig, shirtColor, bottomsColor, socksColor, stripesColor, capColor, glassesColor, reducedMotion]);

  return null;
}
