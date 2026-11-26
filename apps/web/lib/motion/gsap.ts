'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DURATION, EASE } from './tokens';

// Registro único de plugins de GSAP (CLAUDE.md: "Register GSAP plugins once
// in a client module"). Todo código GSAP importa desde aquí. SplitText, que
// solo usa la home, se registra en split-text.ts para no cargarlo en todas
// las páginas.
gsap.registerPlugin(ScrollTrigger, useGSAP);
gsap.defaults({ ease: EASE.out.gsap, duration: DURATION.reveal });

export { gsap, ScrollTrigger, useGSAP };
