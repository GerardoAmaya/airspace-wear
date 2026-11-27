'use client';

import { useEffect } from 'react';
import { Group, type Material, Matrix4, Mesh, type Object3D, Vector3 } from 'three';
import { capGeometry, cutBasis, type LegCutData, type LegFrame, type LegLayer, lowestOnShin, measureSection, SOCK_HIDE } from './leg-cut';

// Tapas del corte de las piernas (leg-cut.ts): una por pierna, hija del hueso
// de la canilla, con la forma de la sección de la capa de más afuera que
// llega al corte (pantalón del catálogo, pantalón base, media o cuerpo) y su
// material. Así la tapa toma el color y la textura de esa capa, y con el
// cuerpo desnudo, el tono de las articulaciones del maniquí (un remate de
// vitrina). Se rearma al cambiar el corte o la ropa; nunca por cuadro.

const LAYERS: readonly LegLayer[] = ['catalog', 'pants', 'socks', 'body'];
// Radio del canto redondeado (m): la tapa baja esto bajo el plano de corte.
export const CAP_ROUND = 0.009;
// La media se oculta desde este margen (m) sobre el ruedo del pantalón: lo
// que queda dentro de la tela nunca asoma a través de ella.
const SOCK_TUCK = 0.02;

// Visible de verdad: la malla y todos sus padres, colgada del avatar.
function shown(object: Object3D, root: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === root) return true;
  }
  return false;
}

export function LegCaps({
  avatar,
  frames,
  height,
  bodyMaterial,
  version,
}: {
  avatar: Object3D;
  frames: LegFrame[];
  // Altura del corte sobre el tobillo (m, a lo largo de la canilla).
  height: number;
  bodyMaterial: Material;
  // Cambia cuando cambia la ropa a la vista (vuelve a medir).
  version: string;
}) {
  useEffect(() => {
    void version;
    // Mallas cortables a la vista, por capa.
    const byLayer = new Map<LegLayer, Array<{ data: LegCutData; material: Material; cap: boolean }>>();
    avatar.traverse((object) => {
      const mesh = object as Mesh;
      const layer = mesh.userData.legLayer as LegLayer | undefined;
      if (!layer || !mesh.isMesh || !shown(mesh, avatar)) return;
      const list = byLayer.get(layer) ?? [];
      // Las franjas de la media (legCapMaterial = false) no prestan su material a la tapa.
      list.push({ data: mesh.userData.legCut as LegCutData, material: [mesh.material].flat()[0], cap: mesh.userData.legCapMaterial !== false });
      byLayer.set(layer, list);
    });
    // Media dentro del pantalón (base o del catálogo): se oculta sobre el ruedo.
    const outer = [...(byLayer.get('pants') ?? []), ...(byLayer.get('catalog') ?? [])].map((source) => source.data);
    SOCK_HIDE.value = Math.min(10, lowestOnShin(outer) + SOCK_TUCK);
    const built: Array<{ bone: Object3D; mount: Group; mesh: Mesh }> = [];
    for (const frame of frames) {
      const bone = avatar.getObjectByName(frame.leg);
      if (!bone) continue;
      for (const layer of LAYERS) {
        const sources = byLayer.get(layer);
        if (!sources?.length) continue;
        const section = measureSection(
          sources.map((source) => source.data),
          frame,
          height,
        );
        if (!section) continue;
        const material = layer === 'body' ? bodyMaterial : (sources.find((source) => source.cap) ?? sources[0]).material;
        const mesh = new Mesh(capGeometry(section, CAP_ROUND), material);
        mesh.userData.outfit = true;
        mesh.frustumCulled = false;
        const mount = new Group();
        mount.matrixAutoUpdate = false;
        const origin = frame.ankle.clone().addScaledVector(frame.axis, height);
        mount.matrix
          .copy(frame.rest)
          .invert()
          .multiply(new Matrix4().compose(origin, cutBasis(frame).align, new Vector3(1, 1, 1)));
        mount.add(mesh);
        bone.add(mount);
        built.push({ bone, mount, mesh });
        break;
      }
    }
    return () => {
      SOCK_HIDE.value = 10;
      for (const part of built) {
        part.bone.remove(part.mount);
        part.mesh.geometry.dispose();
      }
    };
  }, [avatar, frames, height, bodyMaterial, version]);
  return null;
}
