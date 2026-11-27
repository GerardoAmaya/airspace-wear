'use client';

import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  type Bone,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  type Material,
  type Matrix4,
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
import { type BodyMask, restPositions } from './body-mask';
import { addLegCut, type LegCutData, type LegFrame, lowestOnShin, makeCuttable, SOCK_CUFF } from './leg-cut';

// Vestuario del maniquí (docs/avatar-fitting.md, sección 9). El GLB del
// vestuario trae el mismo esqueleto que el avatar: cada prenda se vuelve a
// enlazar a los huesos del avatar por nombre, así sigue cada clip. La gorra y
// los lentes son rígidos y cuelgan del hueso de la cabeza. El cuerpo que queda
// bajo la ropa visible no se dibuja (mismas reglas que generaron las prendas,
// outfit-rules.json), para que nunca asome en ninguna pose.

const GARMENTS: readonly GarmentKey[] = ['shirt', 'tank', 'shorts', 'pants', 'socks'];
const ACCESSORIES: readonly AccessoryKey[] = ['cap', 'glasses'];
const SLOT_OF: Record<GarmentKey, ColorSlot> = { shirt: 'shirt', tank: 'shirt', shorts: 'bottoms', pants: 'bottoms', socks: 'socks' };

// Color de un token CSS (--color-garment-*) o de un dato (acento del producto).
function readColor(value: string): Color {
  if (!value.startsWith('--')) return new Color(value);
  return new Color(getComputedStyle(document.documentElement).getPropertyValue(value).trim() || 'gray');
}

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
  // Cuerpo que cubre cada prenda (una capa del recorte del cuerpo).
  covers: Record<GarmentKey, Uint8Array[]>;
}

const ownerOf = (object: Object3D, rules: OutfitRules): GarmentKey | AccessoryKey | null => {
  for (let node: Object3D | null = object; node; node = node.parent) {
    for (const key of GARMENTS) if (node.name === rules.garments[key].node) return key;
    for (const key of ACCESSORIES) if (node.name === rules.accessories[key].node) return key;
  }
  return null;
};

function buildRig(
  source: Object3D,
  avatar: Object3D,
  rest: Map<string, Matrix4>,
  lite: boolean,
  mask: BodyMask,
  frames: LegFrame[],
): OutfitRig {
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
    // Medias y pantalón terminan en el corte de la pierna (leg-cut.ts).
    if (key === 'socks' || key === 'pants') makeCuttable(copy, rest, frames, key);
    if (stripe) copy.userData.legCapMaterial = false;
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

  // Corte de la pierna en la media (con las franjas del puño en el borde,
  // del color de las franjas) y en el pantalón. La media y sus franjas,
  // además, se ocultan dentro del pantalón. El short comparte material con
  // el pantalón, pero sin el atributo del corte no se corta.
  addLegCut(materials.socks, { band: materials.stripes.color });
  addLegCut(materials.stripes, { sock: true });
  addLegCut(materials.bottoms);

  const covers = Object.fromEntries(GARMENTS.map((key) => [key, mask.cover(rules.garments[key])])) as Record<GarmentKey, Uint8Array[]>;
  return { holder, garments, accessories, materials, lens, covers };
}

// Escrituras sobre objetos de three.js (fuera de React).
const setVisible = (object: Object3D, visible: boolean) => void (object.visible = visible);
const setColor = (material: MeshStandardMaterial, color: Color) => {
  material.color.copy(color);
  material.userData.colored = true;
};

export interface AvatarOutfitProps {
  url: string;
  look: OutfitLook;
  avatar: Object3D;
  // Matrices de mundo de cada hueso en reposo (antes de animar).
  rest: Map<string, Matrix4>;
  // Recorte del cuerpo bajo la ropa (compartido con las prendas del catálogo).
  mask: BodyMask;
  // Ejes de las canillas para el corte de las piernas.
  frames: LegFrame[];
  lite: boolean;
  reducedMotion: boolean;
  onReady(): void;
}

export function AvatarOutfit({ url, look, avatar, rest, mask, frames, lite, reducedMotion, onReady }: AvatarOutfitProps) {
  const { scene } = useGLTF(url);
  const rig = useMemo(() => buildRig(scene, avatar, rest, lite, mask, frames), [scene, avatar, rest, lite, mask, frames]);
  const get = useThree((state) => state.get);

  // Monta las prendas y el cuerpo recortable; al salir, todo vuelve como estaba.
  useEffect(() => {
    avatar.add(rig.holder);
    // Donde empiezan las franjas de arriba del puño: decide si caben las del corte.
    const stripes = rig.garments.socks.filter((mesh) => mesh.userData.legCapMaterial === false && mesh.userData.legCut);
    SOCK_CUFF.value = Math.min(10, lowestOnShin(stripes.map((mesh) => mesh.userData.legCut as LegCutData)));
    for (const accessory of Object.values(rig.accessories)) accessory?.bone.add(accessory.object);
    // Compila los materiales nuevos antes de mostrarlos.
    const { gl, scene: root, camera } = get();
    gl.compile(root, camera);
    onReady();
    return () => {
      avatar.remove(rig.holder);
      SOCK_CUFF.value = 10;
      for (const accessory of Object.values(rig.accessories)) accessory?.bone.remove(accessory.object);
      for (const key of GARMENTS) mask.setLayer(`base-${key}`, null);
      for (const material of [...Object.values(rig.materials), rig.lens]) {
        gsap.killTweensOf(material.color);
        material.dispose();
      }
    };
  }, [rig, avatar, mask, get, onReady]);

  // Prendas visibles y cuerpo oculto debajo.
  const { shirt, tank, shorts, pants, socks } = look.garments;
  const { cap, glasses } = look.accessories;
  useEffect(() => {
    const shown: Record<GarmentKey, boolean> = { shirt, tank, shorts, pants, socks };
    for (const key of GARMENTS) {
      for (const mesh of rig.garments[key]) setVisible(mesh, shown[key]);
      mask.setLayer(`base-${key}`, shown[key] && rig.garments[key].length ? rig.covers[key] : null);
    }
    if (rig.accessories.cap) setVisible(rig.accessories.cap.object, cap);
    if (rig.accessories.glasses) setVisible(rig.accessories.glasses.object, glasses);
  }, [rig, mask, shirt, tank, shorts, pants, socks, cap, glasses]);

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
