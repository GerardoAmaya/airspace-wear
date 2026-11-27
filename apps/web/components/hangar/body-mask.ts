import { BufferAttribute, BufferGeometry, Matrix4, type Object3D, type SkinnedMesh, Vector3 } from 'three';
import type { OutfitCut, OutfitHole } from '@/lib/avatar/outfit';

// Cuerpo del maniquí bajo la ropa (docs/avatar-fitting.md, sección 9). Cada
// prenda puesta (del vestuario base o del catálogo) es una capa con los
// vértices del cuerpo que cubre; los triángulos con sus tres vértices
// cubiertos por alguna capa no se dibujan. Las capas salen de las mismas
// reglas que cortaron las prendas (huesos, cortes y aberturas), con un margen
// (hideInset) para que dentro de cada abertura se siga viendo cuerpo.
// Todo se calcula al cambiar de prenda, nunca por cuadro.

export interface CoverRule {
  bones: readonly string[];
  cuts: readonly OutfitCut[];
  holes: readonly OutfitHole[];
}

export interface BodyPart {
  mesh: SkinnedMesh;
  original: BufferGeometry;
  wrapper: BufferGeometry;
  triangles: ArrayLike<number>;
  // Posición en reposo (m, espacio del avatar) y hueso dominante por vértice.
  points: Float32Array;
  dominant: string[];
}

// Nombre base del hueso: "mixamorigLeftArm" -> "LeftArm".
export const boneBase = (name: string) => name.replace(/^mixamorig\d*/, '');

// Posición en reposo de cada vértice: skinning en la CPU con las matrices de
// reposo de los huesos, medidas antes de animar.
export function restPositions(mesh: SkinnedMesh, geometry: BufferGeometry, rest: Map<string, Matrix4>): Float32Array {
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

// Copia de la geometría con su propio índice (los atributos se comparten):
// el cuerpo del caché de drei queda intacto.
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

export class BodyMask {
  private parts: BodyPart[] = [];
  private layers = new Map<string, Uint8Array[]>();
  private restOf = new Map<string, Vector3>();

  constructor(
    avatar: Object3D,
    rest: Map<string, Matrix4>,
    private hideInset: number,
    private forward: Vector3,
  ) {
    for (const [name, matrix] of rest) this.restOf.set(boneBase(name), new Vector3().setFromMatrixPosition(matrix));
    avatar.traverse((object) => {
      const mesh = object as SkinnedMesh;
      if (!mesh.isSkinnedMesh || mesh.userData.outfit) return;
      const original = mesh.geometry;
      const { wrapper, triangles } = wrap(original);
      const skinIndex = original.getAttribute('skinIndex');
      const skinWeight = original.getAttribute('skinWeight');
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
      this.parts.push({ mesh, original, wrapper, triangles, points: restPositions(mesh, original, rest), dominant });
    });
  }

  // Partes del cuerpo para el corte de las piernas (leg-cut.ts).
  cuttable(): ReadonlyArray<Readonly<BodyPart>> {
    return this.parts;
  }

  // El cuerpo pasa a dibujarse con el índice recortable (y vuelve al salir).
  mount() {
    for (const part of this.parts) part.mesh.geometry = part.wrapper;
    this.apply();
  }

  unmount() {
    for (const part of this.parts) part.mesh.geometry = part.original;
  }

  // Vértices de cada parte del cuerpo cubiertos por una prenda con estas reglas.
  cover(rule: CoverRule): Uint8Array[] {
    const head = (name: string) => this.restOf.get(name) ?? new Vector3();
    const hips = head('Hips');
    const inset = this.hideInset;
    const bones = new Set(rule.bones);
    const cuts = rule.cuts.map((cut) => {
      const a = head(cut.from);
      const axis = head(cut.to).clone().sub(a);
      const length = axis.length() || 1;
      const side = cut.from.startsWith('Left') ? 1 : cut.from.startsWith('Right') ? -1 : 0;
      const limit = cut.keep === 'below' ? cut.t - inset / length : cut.t + inset / length;
      return { a, axis, lengthSq: length * length, side, keep: cut.keep, limit };
    });
    const holes = rule.holes.map((hole) => {
      const a = head(hole.from);
      const axis = head(hole.to).clone().sub(a);
      const length = axis.length() || 1;
      return {
        center: a.clone().addScaledVector(this.forward, hole.forward ?? 0),
        direction: axis.clone().normalize(),
        length,
        minT: hole.minT ?? -1,
        radius: hole.radius + inset,
      };
    });
    const point = new Vector3();
    const relative = new Vector3();
    return this.parts.map((part) => {
      const covered = new Uint8Array(part.dominant.length);
      for (let i = 0; i < covered.length; i++) {
        if (!bones.has(part.dominant[i])) continue;
        point.fromArray(part.points, i * 3);
        const inside = cuts.every((cut) => {
          if (cut.side && (point.x - hips.x) * cut.side <= 0) return true;
          const t = relative.copy(point).sub(cut.a).dot(cut.axis) / cut.lengthSq;
          return cut.keep === 'below' ? t <= cut.limit : t >= cut.limit;
        });
        if (!inside) continue;
        const open = holes.some((hole) => {
          relative.copy(point).sub(hole.center);
          const along = relative.dot(hole.direction);
          if (along / hole.length < hole.minT) return false;
          return relative.addScaledVector(hole.direction, -along).length() < hole.radius;
        });
        if (!open) covered[i] = 1;
      }
      return covered;
    });
  }

  // Radio del cuerpo en reposo alrededor de un eje (por ejemplo, la pierna
  // a cierta altura sobre el tobillo): el mayor de los vértices de esos
  // huesos dentro de una franja de `band` metros. Null si no hay vértices.
  radiusAt(bones: ReadonlySet<string>, origin: Vector3, direction: Vector3, along: number, band = 0.012): number | null {
    const point = new Vector3();
    const relative = new Vector3();
    let radius: number | null = null;
    for (const part of this.parts) {
      for (let i = 0; i < part.dominant.length; i++) {
        if (!bones.has(part.dominant[i])) continue;
        point.fromArray(part.points, i * 3);
        relative.copy(point).sub(origin);
        const height = relative.dot(direction);
        if (Math.abs(height - along) > band) continue;
        const distance = relative.addScaledVector(direction, -height).length();
        if (radius === null || distance > radius) radius = distance;
      }
    }
    return radius;
  }

  // Capa de una prenda puesta (null la quita). Se aplica al momento.
  setLayer(key: string, covered: Uint8Array[] | null) {
    if (covered) this.layers.set(key, covered);
    else this.layers.delete(key);
    this.apply();
  }

  // Deja en el índice solo los triángulos que no quedan del todo bajo una
  // prenda visible.
  private apply() {
    const layers = [...this.layers.values()];
    this.parts.forEach((part, partIndex) => {
      const index = part.wrapper.getIndex();
      if (!index) return;
      const target = index.array as Uint16Array | Uint32Array;
      const { triangles } = part;
      const hidden = (vertex: number) => layers.some((layer) => layer[partIndex][vertex] === 1);
      let kept = 0;
      for (let i = 0; i < triangles.length; i += 3) {
        const a = triangles[i];
        const b = triangles[i + 1];
        const c = triangles[i + 2];
        if (layers.length && hidden(a) && hidden(b) && hidden(c)) continue;
        target[kept++] = a;
        target[kept++] = b;
        target[kept++] = c;
      }
      index.needsUpdate = true;
      part.wrapper.setDrawRange(0, kept);
    });
  }
}
