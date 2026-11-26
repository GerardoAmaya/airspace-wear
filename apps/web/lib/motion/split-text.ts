'use client';

import { SplitText } from 'gsap/SplitText';
import { gsap } from './gsap';

// SplitText solo lo usan las secciones de la home (titulares por letra o
// línea). Se registra aquí, una sola vez, y no en gsap.ts: así no pesa en el
// JS inicial de las demás páginas. Todo código que lo use importa desde aquí.
gsap.registerPlugin(SplitText);

export { SplitText };
