'use client';

import { useEffect, useMemo } from 'react';
import { Color, Group, LatheGeometry, Matrix4, Mesh, MeshStandardMaterial, type Object3D, Quaternion, Vector2, Vector3 } from 'three';
import type { BodyMask } from './body-mask';

// Relleno del tobillo: el maniquí tiene el tobillo mucho más fino que la
// abertura de cualquier zapato, y entre el puño del pantalón (o la media) y
// el cuello se veía un palito. Un tubo torneado, hijo del hueso de la pierna,
// va del interior del zapato hasta un poco por encima del cuello: ahí llena
// la abertura medida en el zapato (collarRing) y después se angosta hasta el
// grosor de la pierna. Lleva el color de la media o, sin medias, el del
// maniquí. Se arma una vez por par; nada se calcula por cuadro.

export interface AnkleCollar {
  // Altura del borde del cuello sobre el piso del avatar en reposo (m) y radio (m).
  height: number;
  radius: number;
}

const SIDES = [
  { leg: 'mixamorigLeftLeg', foot: 'mixamorigLeftFoot', bones: new Set(['LeftLeg', 'LeftFoot']) },
  { leg: 'mixamorigRightLeg', foot: 'mixamorigRightFoot', bones: new Set(['RightLeg', 'RightFoot']) },
] as const;

// Arriba el relleno termina apenas sobre la pierna, por dentro de la media
// (que ya tiene su grosor): no se ve un escalón.
const SOCK = 0.002;
// Tramo en el que se angosta, desde un poco por debajo del borde del cuello.
const TAPER = 0.035;
const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function readColor(value: string): Color {
  if (!value.startsWith('--')) return new Color(value);
  return new Color(getComputedStyle(document.documentElement).getPropertyValue(value).trim() || 'gray');
}

export function AnkleFill({
  avatar,
  rest,
  mask,
  collar,
  color,
  theme,
}: {
  avatar: Object3D;
  rest: Map<string, Matrix4>;
  mask: BodyMask;
  collar: AnkleCollar;
  // Token CSS (--color-...) o color de datos.
  color: string;
  theme: string;
}) {
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.85, metalness: 0, envMapIntensity: 0.65 }), []);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    void theme;
    material.color.copy(readColor(color));
  }, [material, color, theme]);

  const parts = useMemo(() => {
    const built: Array<{ bone: Object3D; mount: Group; geometry: LatheGeometry }> = [];
    for (const side of SIDES) {
      const bone = avatar.getObjectByName(side.leg);
      const legRest = rest.get(side.leg);
      const footRest = rest.get(side.foot);
      if (!bone || !legRest || !footRest) continue;
      const ankle = new Vector3().setFromMatrixPosition(footRest);
      const knee = new Vector3().setFromMatrixPosition(legRest);
      const axis = knee.clone().sub(ankle).normalize();
      // Alto del cuello sobre el tobillo, sobre el eje de la pierna.
      const neck = collar.height - ankle.y;
      const start = neck - 0.01;
      const top = Math.max(start + TAPER, 0.05);
      const fill = Math.min(0.06, collar.radius * 0.8);
      const points: Vector2[] = [];
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const h = -0.035 + ((top + 0.035) * i) / steps;
        const leg = (mask.radiusAt(side.bones, ankle, axis, Math.max(h, 0)) ?? 0.035) + SOCK;
        const base = Math.max(fill, leg);
        const radius = h <= start ? base : base + (leg - base) * smooth((h - start) / TAPER);
        points.push(new Vector2(radius, h));
      }
      // Tapa abajo (dentro del zapato) y abierto arriba, metido en la pierna.
      points.unshift(new Vector2(0, -0.035));
      const geometry = new LatheGeometry(points, 28);
      const mount = new Group();
      mount.matrixAutoUpdate = false;
      const align = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axis);
      mount.matrix.copy(legRest).invert().multiply(new Matrix4().compose(ankle, align, new Vector3(1, 1, 1)));
      built.push({ bone, mount, geometry });
    }
    return built;
  }, [avatar, rest, mask, collar.height, collar.radius]);

  useEffect(() => {
    for (const part of parts) {
      const mesh = new Mesh(part.geometry, material);
      mesh.userData.outfit = true;
      mesh.frustumCulled = false;
      part.mount.add(mesh);
      part.bone.add(part.mount);
    }
    return () => {
      for (const part of parts) {
        part.bone.remove(part.mount);
        part.mount.clear();
        part.geometry.dispose();
      }
    };
  }, [parts, material]);

  return null;
}
