'use client';

import type { Model3D } from '@airspace/contracts';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import styles from './ArButton.module.css';

// "Ver en tu espacio": carga model-viewer solo al tocar el botón y abre la
// vista de realidad aumentada del teléfono (Scene Viewer en Android, Quick
// Look en iOS, que genera el USDZ desde el GLB). Los modelos ya están a
// tamaño real, así que la escala queda fija.
type ArState = 'idle' | 'loading' | 'unsupported';

interface ModelViewerElement extends HTMLElement {
  updateComplete: Promise<unknown>;
  canActivateAR: boolean;
  activateAR(): Promise<void>;
}

export function ArButton({ model, name }: { model: Model3D; name: string }) {
  const t = useTranslations('Product.ar');
  const [state, setState] = useState<ArState>('idle');

  async function open() {
    setState('loading');
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
    viewer.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
    viewer.setAttribute('ar-scale', 'fixed');
    viewer.setAttribute('alt', name);
    viewer.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.append(viewer);
    // Primero se pregunta si el equipo puede abrir AR (no depende del modelo):
    // en escritorio se avisa al instante sin descargar nada más.
    await viewer.updateComplete;
    if (!viewer.canActivateAR) {
      setState('unsupported');
      viewer.remove();
      return;
    }
    await new Promise<void>((resolve) => {
      viewer.addEventListener('load', () => resolve(), { once: true });
      setTimeout(resolve, 8000);
    });
    await viewer.activateAR();
    setState('idle');
    viewer.remove();
  }

  return (
    <div className={styles.block}>
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
