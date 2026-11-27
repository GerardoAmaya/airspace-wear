'use client';

import type { AvatarSlot } from '@airspace/contracts';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Component, type ReactNode, Suspense, useEffect, useMemo, useState } from 'react';
import { type Bone, Group, type Material, type Matrix4, type Mesh, type MeshStandardMaterial, type Object3D, Skeleton, SkinnedMesh } from 'three';
import { CATALOG_FIT, WEAR_SLOTS } from '@/lib/avatar/catalog-fit';
import type { BodyMask } from './body-mask';
import { addLegCut, type LegFrame, makeCuttable } from './leg-cut';

// Intensidad del entorno en la tela del catálogo (la misma de la tela base).
const GARMENT_ENV_INTENSITY = 0.65;

// Prendas del catálogo puestas en el maniquí (pnpm avatar:fit). Cada GLB
// ajustado trae el esqueleto del avatar (solo huesos) y la prenda: las
// sudaderas y pantalones se vuelven a enlazar a los huesos del avatar por
// nombre y siguen cada clip; la gorra y los lentes cuelgan del hueso de la
// cabeza. Conservan sus materiales y colores (sin paleta). Se cargan al
// elegirlas; mientras llega una nueva, la anterior del mismo lugar sigue
// puesta. El cuerpo que cubren no se dibuja (BodyMask).

export interface WornGarment {
  slug: string;
  slot: AvatarSlot;
  url: string;
}

interface Prepared {
  slug: string;
  slot: AvatarSlot;
  // Objetos listos para colgar: de la raíz del avatar o de un hueso.
  parts: Array<{ object: Object3D; parent: Object3D }>;
  cover: Uint8Array[] | null;
  materials: Material[];
}

// Esqueleto en reposo y ejes de las canillas (para el corte de las piernas).
export interface CatalogRest {
  bones: Map<string, Matrix4>;
  frames: LegFrame[];
}

function prepare(source: Object3D, slug: string, avatar: Object3D, mask: BodyMask, rest: CatalogRest): Prepared {
  const item = CATALOG_FIT[slug];
  source.updateMatrixWorld(true);
  const bones = new Map<string, Bone>();
  avatar.traverse((object) => {
    if ((object as Bone).isBone) bones.set(object.name, object as Bone);
  });
  const parts: Prepared['parts'] = [];
  const materials = new Set<Material>();
  if (item.kind === 'skinned') {
    const holder = new Group();
    holder.name = `Catalog_${slug}`;
    source.traverse((object) => {
      const mesh = object as SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      const mapped = mesh.skeleton.bones.map((bone) => bones.get(bone.name));
      if (mapped.some((bone) => !bone)) return;
      const copy = new SkinnedMesh(mesh.geometry, mesh.material);
      copy.name = mesh.name;
      copy.bind(new Skeleton(mapped as Bone[], mesh.skeleton.boneInverses), mesh.bindMatrix);
      // Su caja es la del reposo: sin recorte por cámara, como el cuerpo.
      copy.frustumCulled = false;
      copy.userData.outfit = true;
      // Los pantalones terminan en el corte de la pierna (leg-cut.ts); las
      // prendas que no llegan a la canilla no llevan el atributo.
      makeCuttable(copy, rest.bones, rest.frames, 'catalog');
      if (copy.userData.legCut) for (const material of [mesh.material].flat()) addLegCut(material);
      holder.add(copy);
      for (const material of [mesh.material].flat()) {
        // Tela: el reflejo del entorno de estudio a la misma intensidad que el
        // vestuario base (AvatarOutfit), así una prenda clara no se quema con
        // la luz de borde. Solo la ropa con esqueleto (no zapatos, gorras ni maniquí).
        if ('envMapIntensity' in material) (material as MeshStandardMaterial).envMapIntensity = GARMENT_ENV_INTENSITY;
        materials.add(material);
      }
    });
    parts.push({ object: holder, parent: avatar });
  } else {
    const node = source.getObjectByName(item.node);
    const bone = node?.parent ? bones.get(node.parent.name) : undefined;
    if (node && bone) {
      const object = node.clone(true);
      object.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        mesh.userData.outfit = true;
        for (const material of [mesh.material].flat()) materials.add(material);
      });
      parts.push({ object, parent: bone });
    }
  }
  if (!parts.length) throw new Error(`${slug}: el GLB ajustado no coincide con el esqueleto del avatar`);
  return { slug, slot: item.slot, parts, cover: item.rules ? mask.cover(item.rules) : null, materials: [...materials] };
}

function GarmentLoader({
  garment,
  avatar,
  mask,
  rest,
  onLoad,
}: {
  garment: WornGarment;
  avatar: Object3D;
  mask: BodyMask;
  rest: CatalogRest;
  onLoad(url: string, entry: Prepared): void;
}) {
  const { scene } = useGLTF(garment.url);
  const entry = useMemo(() => prepare(scene, garment.slug, avatar, mask, rest), [scene, garment.slug, avatar, mask, rest]);
  useEffect(() => onLoad(garment.url, entry), [onLoad, garment.url, entry]);
  return null;
}

// Cuelga una prenda ya preparada y tapa el cuerpo que cubre; al salir, todo
// vuelve como estaba.
function MountedGarment({ entry, mask }: { entry: Prepared; mask: BodyMask }) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    for (const part of entry.parts) part.parent.add(part.object);
    mask.setLayer(`catalog-${entry.slot}`, entry.cover);
    // Compila los materiales nuevos antes de mostrarlos.
    const { gl, scene, camera } = get();
    gl.compile(scene, camera);
    return () => {
      for (const part of entry.parts) part.parent.remove(part.object);
      mask.setLayer(`catalog-${entry.slot}`, null);
    };
  }, [entry, mask, get]);
  return null;
}

class LoadBoundary extends Component<{ onError(): void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type Shown = Partial<Record<AvatarSlot, string>>;

export interface AvatarCatalogProps {
  wear: WornGarment[];
  avatar: Object3D;
  mask: BodyMask;
  rest: CatalogRest;
  // Prendas a la vista, por lugar (slug): la escena oculta su pieza base.
  onShown(shown: Shown): void;
}

export function AvatarCatalog({ wear, avatar, mask, rest, onShown }: AvatarCatalogProps) {
  const [entries, setEntries] = useState(() => new Map<string, Prepared>());
  const [failed, setFailed] = useState(() => new Set<string>());
  const onLoad = useMemo(
    () => (url: string, entry: Prepared) =>
      setEntries((map) => {
        if (map.get(url) === entry) return map;
        const next = new Map(map);
        next.set(url, entry);
        return next;
      }),
    [],
  );

  // Por lugar: la pedida si ya cargó; si no, la que estaba (si sigue en el
  // mismo lugar). Sin pedido, nada (vuelve la pieza base).
  const requested = useMemo(() => Object.fromEntries(wear.map((item) => [item.slot, item.url])) as Shown, [wear]);
  const [shownUrls, setShownUrls] = useState<Shown>({});
  const next: Shown = {};
  for (const slot of WEAR_SLOTS) {
    const url = requested[slot];
    if (!url || failed.has(url)) continue;
    if (entries.has(url)) next[slot] = url;
    else if (shownUrls[slot]) next[slot] = shownUrls[slot];
  }
  const changed = WEAR_SLOTS.some((slot) => next[slot] !== shownUrls[slot]);
  if (changed) setShownUrls(next);

  const shown = WEAR_SLOTS.map((slot) => shownUrls[slot] && entries.get(shownUrls[slot]!)).filter((entry): entry is Prepared => !!entry);
  const shownKey = shown.map((entry) => `${entry.slot}:${entry.slug}`).join(',');
  useEffect(() => {
    onShown(Object.fromEntries(shownKey ? shownKey.split(',').map((pair) => pair.split(':')) : []) as Shown);
  }, [onShown, shownKey]);

  return (
    <>
      {shown.map((entry) => (
        <MountedGarment key={entry.slug} entry={entry} mask={mask} />
      ))}
      {wear
        .filter((item) => !entries.has(item.url) && !failed.has(item.url))
        .map((item) => (
          <LoadBoundary key={item.url} onError={() => setFailed((set) => new Set(set).add(item.url))}>
            <Suspense fallback={null}>
              <GarmentLoader garment={item} avatar={avatar} mask={mask} rest={rest} onLoad={onLoad} />
            </Suspense>
          </LoadBoundary>
        ))}
    </>
  );
}
