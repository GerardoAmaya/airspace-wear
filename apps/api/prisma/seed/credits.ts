// Créditos de recursos de terceros: modelos 3D (del manifest), fuentes y
// librerías. La página /credits los lee de la API. Los cambios de cada modelo
// son códigos; la web los traduce (misma lógica que scripts/models/credits.mjs).

import type { CREDIT_CHANGES } from '@airspace/contracts';

export type CreditChange = (typeof CREDIT_CHANGES)[number];

export interface ManifestVariant {
  file: string;
  bytes: number;
  triangles: number;
  drawCalls: number;
  simplified: boolean;
}

export interface ManifestModel {
  slug: string;
  displayName: string;
  source: {
    title: string;
    url: string;
    author: string;
    authorUrl?: string;
    license: { name: string; url?: string; commercialUse: boolean; shareAlike: boolean };
  };
  raw?: { drawCalls?: number };
  pose?: { foot?: 'left' | 'right'; lateralSideFacing?: string; extractedFromPair?: boolean };
  variants: { hero: ManifestVariant; lite: ManifestVariant };
}

export function describeChanges(model: ManifestModel): CreditChange[] {
  const changes: CreditChange[] = [];
  if (model.pose?.extractedFromPair) changes.push('kept_one_shoe');
  changes.push('reoriented_rescaled');
  if ((model.raw?.drawCalls ?? 0) > model.variants.hero.drawCalls) changes.push('meshes_merged');
  if (model.variants.hero.simplified || model.variants.lite.simplified) changes.push('mesh_simplified');
  changes.push('textures_webp', 'meshopt_compression');
  return changes;
}

export interface StaticCredit {
  key: string;
  kind: 'font' | 'library';
  name: string;
  author: string;
  authorUrl: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
}

const OFL = { licenseName: 'SIL Open Font License 1.1', licenseUrl: 'https://openfontlicense.org' };
const MIT = { licenseName: 'MIT', licenseUrl: 'https://opensource.org/license/mit' };

export const STATIC_CREDITS: StaticCredit[] = [
  { key: 'font:hubot-sans', kind: 'font', name: 'Hubot Sans', author: 'GitHub', authorUrl: 'https://github.com', sourceUrl: 'https://github.com/github/hubot-sans', ...OFL },
  { key: 'font:mona-sans', kind: 'font', name: 'Mona Sans', author: 'GitHub', authorUrl: 'https://github.com', sourceUrl: 'https://github.com/github/mona-sans', ...OFL },
  { key: 'font:martian-mono', kind: 'font', name: 'Martian Mono', author: 'Evil Martians', authorUrl: 'https://evilmartians.com', sourceUrl: 'https://github.com/evilmartians/mono', ...OFL },
  { key: 'library:three', kind: 'library', name: 'three.js', author: 'three.js authors', authorUrl: 'https://threejs.org', sourceUrl: 'https://github.com/mrdoob/three.js', ...MIT },
  { key: 'library:react-three-fiber', kind: 'library', name: 'React Three Fiber · drei', author: 'Poimandres', authorUrl: 'https://pmnd.rs', sourceUrl: 'https://github.com/pmndrs/react-three-fiber', ...MIT },
  { key: 'library:gsap', kind: 'library', name: 'GSAP', author: 'GreenSock (Webflow)', authorUrl: 'https://gsap.com', sourceUrl: 'https://gsap.com', licenseName: 'GSAP Standard License', licenseUrl: 'https://gsap.com/standard-license' },
  { key: 'library:lenis', kind: 'library', name: 'Lenis', author: 'darkroom.engineering', authorUrl: 'https://darkroom.engineering', sourceUrl: 'https://github.com/darkroomengineering/lenis', ...MIT },
  { key: 'library:meshoptimizer', kind: 'library', name: 'meshoptimizer', author: 'Arseny Kapoulkine', authorUrl: 'https://github.com/zeux', sourceUrl: 'https://github.com/zeux/meshoptimizer', ...MIT },
  { key: 'library:gltf-transform', kind: 'library', name: 'glTF Transform', author: 'Don McCurdy', authorUrl: 'https://www.donmccurdy.com', sourceUrl: 'https://github.com/donmccurdy/glTF-Transform', ...MIT },
];
