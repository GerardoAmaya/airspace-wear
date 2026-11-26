'use client';

import type { Model3D } from '@airspace/contracts';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import styles from './ArButton.module.css';

// "Ver en tu espacio": abre la vista de realidad aumentada del teléfono (Scene
// Viewer en Android, Quick Look en iOS, que genera el USDZ desde el GLB). Los
// modelos ya están a tamaño real, así que la escala queda fija.
//
// Los navegadores solo abren AR en respuesta directa a un toque: si antes del
// activateAR() hay esperas largas (descargar model-viewer, el modelo, decidir
// el modo), el gesto caduca y Android no abre nada. Por eso en pantallas
// táctiles el visor se prepara cuando el botón entra en vista, y al tocar se
// activa de inmediato. En escritorio se prepara al tocar y solo se avisa.
type ArState = 'idle' | 'loading' | 'unsupported';

interface ModelViewerElement extends HTMLElement {
  updateComplete: Promise<unknown>;
  canActivateAR: boolean;
  activateAR(): Promise<void>;
}

async function createViewer(model: Model3D, name: string): Promise<ModelViewerElement> {
  // Decodificador Meshopt propio: model-viewer no trae uno y los modelos
  // optimizados lo necesitan (ver CLAUDE.md). Debe fijarse antes de importar.
  (self as unknown as { ModelViewerElement?: Record<string, string> }).ModelViewerElement = {
    ...(self as unknown as { ModelViewerElement?: Record<string, string> }).ModelViewerElement,
    meshoptDecoderLocation: '/vendor/meshopt_decoder.cjs',
  };
  await import('@google/model-viewer');
  const viewer = document.createElement('model-viewer') as ModelViewerElement;
  viewer.setAttribute('src', model.heroUrl);
  viewer.setAttribute('ar', '');
  // Scene Viewer primero en Android: es la app nativa y no depende de WebXR.
  viewer.setAttribute('ar-modes', 'scene-viewer quick-look webxr');
  viewer.setAttribute('ar-scale', 'fixed');
  viewer.setAttribute('alt', name);
  viewer.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.append(viewer);
  await viewer.updateComplete;
  // model-viewer decide el modo AR de forma asíncrona y updateComplete puede
  // llegar antes: se espera hasta 2 s en teléfonos. En escritorio es inmediato.
  if (!viewer.canActivateAR && /android|iphone|ipad/i.test(navigator.userAgent)) {
    const deadline = performance.now() + 2000;
    while (!viewer.canActivateAR && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return viewer;
}

export function ArButton({ model, name }: { model: Model3D; name: string }) {
  const t = useTranslations('Product.ar');
  const [state, setState] = useState<ArState>('idle');
  const block = useRef<HTMLDivElement>(null);
  const prepared = useRef<Promise<ModelViewerElement> | null>(null);
  const ready = useRef<ModelViewerElement | null>(null);

  // En pantallas táctiles se prepara el visor al acercarse el botón.
  useEffect(() => {
    const element = block.current;
    if (!element || !matchMedia('(pointer: coarse)').matches) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || prepared.current) return;
        observer.disconnect();
        prepared.current = createViewer(model, name);
        void prepared.current.then((viewer) => {
          if (cancelled) viewer.remove();
          else ready.current = viewer;
        });
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
      ready.current?.remove();
      ready.current = null;
      prepared.current = null;
    };
  }, [model, name]);

  async function open() {
    const viewer = ready.current;
    // Camino rápido: visor listo, se activa dentro del mismo gesto.
    if (viewer?.canActivateAR) {
      void viewer.activateAR();
      return;
    }
    if (viewer) {
      setState('unsupported');
      return;
    }
    setState('loading');
    const created = await (prepared.current ?? (prepared.current = createViewer(model, name)));
    ready.current = created;
    if (!created.canActivateAR) {
      setState('unsupported');
      return;
    }
    // El visor tardó en prepararse: se intenta igual (iOS suele permitirlo); si
    // el navegador lo bloquea, el siguiente toque ya va por el camino rápido.
    setState('idle');
    void created.activateAR();
  }

  return (
    <div ref={block} className={styles.block}>
      <button type="button" className={styles.button} onClick={open} disabled={state === 'loading'}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" d="m8 1.8 5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9L8 1.8Z" />
          <path fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" d="M2.6 4.9 8 8l5.4-3.1M8 8v6.2" />
        </svg>
        {state === 'loading' ? t('loading') : t('button')}
      </button>
      <p className={styles.note} role="status">
        {state === 'unsupported' ? t('unsupported', { name }) : ''}
      </p>
    </div>
  );
}
