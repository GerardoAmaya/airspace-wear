'use client';

import { useState } from 'react';
import { useMotionStore } from '@/lib/motion/store';
import { HangarTeaser } from './HangarTeaser';
import { createSpin } from './rig';
import type { BoardProduct } from './types';

// Monta el adelanto del Hangar 360° con su propio giro. Antes compartía el
// giro con la vista 3D del tablero; ahora la home no tiene esa vista.
export function HangarMount({ product }: { product: BoardProduct }) {
  const reducedMotion = useMotionStore((state) => state.reducedMotion);
  const lite = useMotionStore((state) => state.lite);
  // Un objeto estable entre renders, como lo espera HangarTeaser (RefObject).
  const [spin] = useState(() => ({ current: createSpin() }));
  return <HangarTeaser product={product} spin={spin} lite={lite} reducedMotion={reducedMotion} />;
}
