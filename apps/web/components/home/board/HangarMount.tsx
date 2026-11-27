'use client';

import { useState } from 'react';
import { HANGAR_ENABLED } from '@/lib/avatar/avatar';
import { HOME_HANGAR_TEASER } from '@/lib/home';
import { useMotionStore } from '@/lib/motion/store';
import { HangarAvatarTeaser, type TeaserLook } from './HangarAvatarTeaser';
import { HangarTeaser } from './HangarTeaser';
import { createSpin } from './rig';
import type { BoardProduct } from './types';

// Monta el adelanto del Hangar 360° que elige HOME_HANGAR_TEASER (lib/home.ts):
// el maniquí caminando con el look de fábrica ('avatar') o el par girando
// solo en la plataforma ('shoe'). Sin avatar publicado o sin look armado,
// el del zapato.
export function HangarMount({ product, look }: { product: BoardProduct; look: TeaserLook | null }) {
  const reducedMotion = useMotionStore((state) => state.reducedMotion);
  const lite = useMotionStore((state) => state.lite);
  // Un objeto estable entre renders, como lo espera HangarTeaser (RefObject).
  const [spin] = useState(() => ({ current: createSpin() }));
  if (HOME_HANGAR_TEASER === 'avatar' && HANGAR_ENABLED && look) return <HangarAvatarTeaser look={look} lite={lite} reducedMotion={reducedMotion} />;
  return <HangarTeaser product={product} spin={spin} lite={lite} reducedMotion={reducedMotion} />;
}
