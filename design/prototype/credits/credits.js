// Página de créditos del prototipo (/credits). Lee los modelos 3D desde el
// manifiesto del proceso de modelos (/data/manifest.json) y lista fuentes y
// librerías. Sin animaciones: es una página de consulta.

import { frameCorners } from '/core/hud.js';
import { initThemeToggle } from '/core/theme.js';

const FONTS = [
  {
    name: 'Hubot Sans',
    author: 'GitHub',
    authorUrl: 'https://github.com/github/hubot-sans',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org',
    use: 'Titulares',
    url: 'https://fonts.google.com/specimen/Hubot+Sans',
  },
  {
    name: 'Mona Sans',
    author: 'GitHub',
    authorUrl: 'https://github.com/github/mona-sans',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org',
    use: 'Textos',
    url: 'https://fonts.google.com/specimen/Mona+Sans',
  },
  {
    name: 'Martian Mono',
    author: 'Evil Martians',
    authorUrl: 'https://github.com/evilmartians/mono',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org',
    use: 'Datos y etiquetas',
    url: 'https://fonts.google.com/specimen/Martian+Mono',
  },
];

const LIBRARIES = [
  {
    name: 'three.js',
    author: 'Autores de three.js',
    authorUrl: 'https://threejs.org',
    license: 'MIT',
    licenseUrl: 'https://github.com/mrdoob/three.js/blob/dev/LICENSE',
    use: 'Escenas 3D',
    url: 'https://threejs.org',
  },
  {
    name: 'GSAP',
    author: 'GreenSock (Webflow)',
    authorUrl: 'https://gsap.com',
    license: 'Licencia estándar sin costo',
    licenseUrl: 'https://gsap.com/standard-license',
    use: 'Animaciones',
    url: 'https://gsap.com',
  },
  {
    name: 'Lenis',
    author: 'darkroom.engineering',
    authorUrl: 'https://darkroom.engineering',
    license: 'MIT',
    licenseUrl: 'https://github.com/darkroomengineering/lenis/blob/main/LICENSE',
    use: 'Desplazamiento suave a anclas',
    url: 'https://github.com/darkroomengineering/lenis',
  },
  {
    name: 'meshoptimizer',
    author: 'Arseny Kapoulkine',
    authorUrl: 'https://github.com/zeux',
    license: 'MIT',
    licenseUrl: 'https://github.com/zeux/meshoptimizer/blob/master/LICENSE.md',
    use: 'Compresión de modelos',
    url: 'https://github.com/zeux/meshoptimizer',
  },
  {
    name: 'glTF Transform',
    author: 'Don McCurdy',
    authorUrl: 'https://www.donmccurdy.com',
    license: 'MIT',
    licenseUrl: 'https://github.com/donmccurdy/glTF-Transform/blob/main/LICENSE.md',
    use: 'Optimización de modelos',
    url: 'https://gltf-transform.dev',
  },
];

const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

const link = (url, text) =>
  url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}<span class="visually-hidden"> (se abre en otra pestaña)</span></a>` : escapeHtml(text);

// Cambios hechos a cada modelo: misma lógica que scripts/models/credits.mjs.
function describeChanges(model) {
  const changes = [];
  if (model.pose?.extractedFromPair) changes.push('se conservó un solo zapato del par original');
  changes.push('reorientado y escalado a tamaño real');
  if (model.variants && model.raw?.drawCalls > model.variants.hero?.drawCalls) changes.push('mallas combinadas');
  if (Object.values(model.variants ?? {}).some((variant) => variant.simplified)) changes.push('malla simplificada');
  changes.push('texturas convertidas a WebP', 'compresión Meshopt');
  const text = changes.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function renderModel(model) {
  const { source = {} } = model;
  const license = source.license ?? {};
  const name = model.displayName ?? model.slug;
  return `
    <li class="credits-item">
      <dl class="credits-item__fields">
        <div class="credits-field credits-field--name">
          <dt>Producto</dt>
          <dd><span class="credits-item__name">${escapeHtml(name)}</span><span class="credits-item__brand">${escapeHtml(model.brand ?? '')}</span></dd>
        </div>
        <div class="credits-field">
          <dt>Modelo original</dt>
          <dd>${link(source.url, source.title ?? name)}</dd>
        </div>
        <div class="credits-field">
          <dt>Autor</dt>
          <dd>${link(source.authorUrl, source.author ?? 'Desconocido')}</dd>
        </div>
        <div class="credits-field">
          <dt>Licencia</dt>
          <dd>${link(license.url, license.name ?? 'Sin dato')}${license.commercialUse === false ? '<span class="credits-flag">No comercial</span>' : ''}</dd>
        </div>
        <div class="credits-field credits-field--changes">
          <dt>Cambios</dt>
          <dd>${escapeHtml(describeChanges(model))}</dd>
        </div>
      </dl>
    </li>`;
}

function renderSimple(entry) {
  return `
    <li class="credits-item credits-item--simple">
      <dl class="credits-item__fields">
        <div class="credits-field credits-field--name">
          <dt>Nombre</dt>
          <dd><span class="credits-item__name">${link(entry.url, entry.name)}</span><span class="credits-item__brand">${escapeHtml(entry.use)}</span></dd>
        </div>
        <div class="credits-field">
          <dt>Autor</dt>
          <dd>${link(entry.authorUrl, entry.author)}</dd>
        </div>
        <div class="credits-field">
          <dt>Licencia</dt>
          <dd>${link(entry.licenseUrl, entry.license)}</dd>
        </div>
      </dl>
    </li>`;
}

async function renderModels() {
  const list = document.querySelector('[data-models]');
  const count = document.querySelector('[data-model-count]');
  const note = document.querySelector('[data-models-note]');
  try {
    const response = await fetch('/data/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    const models = Object.values(manifest.models ?? {});
    list.innerHTML = models.map(renderModel).join('');
    count.textContent = `${String(models.length).padStart(2, '0')} modelos`;
    const restricted = models.filter((model) => model.source?.license?.commercialUse === false);
    if (restricted.length) {
      note.insertAdjacentHTML(
        'beforeend',
        ` ${restricted
          .map((model) => `${escapeHtml(model.displayName)}: solo uso no comercial; la versión modificada se comparte con la misma licencia (${escapeHtml(model.source.license.name)}).`)
          .join(' ')}`,
      );
    }
  } catch (error) {
    // Sin manifiesto: se avisa en la página en lugar de dejar la lista vacía.
    count.textContent = 'Sin datos';
    list.innerHTML = `<li class="credits-item credits-item--empty">No se pudo cargar la lista de modelos. La lista completa está en CREDITS.md del repositorio.</li>`;
    console.warn('[credits] manifiesto no disponible:', error.message);
  }
}

document.querySelector('[data-fonts]').innerHTML = FONTS.map(renderSimple).join('');
document.querySelector('[data-libraries]').innerHTML = LIBRARIES.map(renderSimple).join('');
document.querySelectorAll('[data-frame]').forEach(frameCorners);
initThemeToggle(document.querySelector('[data-theme-toggle]'));
await renderModels();
document.documentElement.classList.add('is-ready');
window.__prototypeReady = true;
