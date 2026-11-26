// Genera la sección de modelos 3D de CREDITS.md a partir del manifest.
// Solo reescribe lo que está entre los marcadores; el resto del archivo se
// edita a mano (avatar, fuentes, imágenes y otros recursos).
//
// Uso: pnpm models:credits

import { readFile, writeFile } from 'node:fs/promises';
import { PATHS } from './config.mjs';
import { markdownTable, readManifest } from './shared.mjs';

const START_MARKER = '<!-- models:start -->';
const END_MARKER = '<!-- models:end -->';

const TEMPLATE = `# Credits

AIRSPACE Wear is a portfolio project. It is not affiliated with, endorsed by or sponsored by any brand shown. Product names, logos and designs belong to their respective owners and appear only to illustrate the project.

## 3D models

${START_MARKER}
${END_MARKER}
`;

// Describe qué se cambió respecto del original (lo exigen las licencias CC BY).
function describeChanges(model) {
  const changes = [];
  if (model.pose?.extractedFromPair) changes.push('kept one shoe of the original pair');
  changes.push('reoriented and rescaled to real size');
  if (model.variants && model.raw?.drawCalls > model.variants.hero?.drawCalls) changes.push('meshes merged');
  if (Object.values(model.variants ?? {}).some((variant) => variant.simplified)) changes.push('mesh simplified');
  changes.push('textures converted to WebP', 'Meshopt compression');
  const text = changes.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

const link = (text, url) => (url ? `[${text}](${url})` : text);

const manifest = await readManifest();
const models = Object.values(manifest.models).filter((model) => model.source);

const rows = models.map((model) => {
  const { source } = model;
  return [
    model.displayName,
    link(source.title, source.url),
    link(source.author, source.authorUrl),
    link(source.license.name, source.license.url),
    describeChanges(model),
  ];
});

const notes = models
  .filter((model) => !model.source.license.commercialUse || model.source.license.shareAlike)
  .map((model) => {
    const { license } = model.source;
    const terms = [
      !license.commercialUse && 'non-commercial use only',
      license.shareAlike && `the modified version is shared under the same license (${license.name})`,
    ].filter(Boolean);
    return `- ${model.displayName}: ${terms.join('; ')}.`;
  });

const origin = models.every((model) => model.source.provider === 'sketchfab')
  ? 'All models were downloaded from Sketchfab and optimized'
  : 'All models were optimized';

const section = [
  markdownTable(['Product', 'Original model', 'Author', 'License', 'Changes'], rows),
  '',
  `${origin} for the web with this repository's pipeline (\`pnpm models\`). Each one is published in two versions: a full version and a lighter one for low-end devices.`,
  ...(notes.length ? ['', '**License notes**', '', ...notes] : []),
].join('\n');

let content;
try {
  content = await readFile(PATHS.credits, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  content = TEMPLATE;
}

const start = content.indexOf(START_MARKER);
const end = content.indexOf(END_MARKER);
if (start === -1 || end === -1 || end < start) {
  throw new Error(`CREDITS.md no tiene los marcadores ${START_MARKER} y ${END_MARKER}.`);
}

const updated = `${content.slice(0, start + START_MARKER.length)}\n${section}\n${content.slice(end)}`;
await writeFile(PATHS.credits, updated);
console.log(`CREDITS.md actualizado con ${rows.length} modelo(s).`);
