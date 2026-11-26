// Revisa que ningún estilo ni componente use colores o fuentes sueltos: todo
// pasa por los tokens de styles/tokens.css (regla de CLAUDE.md, "Brand").
// Uso: pnpm --filter @airspace/web lint:tokens
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCAN = ['app', 'components', 'styles', 'lib'];
// Excepciones con motivo: la fuente de los tokens, el ícono del sitio y el
// color inicial de la barra del navegador (metadatos, no estilos).
const ALLOWED_FILES = new Set(['styles/tokens.css', 'app/icon.svg']);
const ALLOWED_LINES = [/themeColor: '#0e0e10'/];

const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const FONT_NAME = /['"](Hubot Sans|Mona Sans|Martian Mono)['"]/;

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.(css|tsx?|svg)$/.test(entry.name)) yield full;
  }
}

const problems = [];
for (const dir of SCAN) {
  for await (const file of files(path.join(ROOT, dir))) {
    const relative = path.relative(ROOT, file);
    if (ALLOWED_FILES.has(relative)) continue;
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (ALLOWED_LINES.some((pattern) => pattern.test(line))) return;
      // En TS/TSX solo se miran estilos en línea y cadenas, no ids como #contenido en href.
      const isCode = /\.tsx?$/.test(file);
      const colorHit = COLOR.test(line) && !(isCode && /href=|#[a-z-]+['"`]/.test(line) && !/#[0-9a-fA-F]{6}\b/.test(line));
      if (colorHit) problems.push(`${relative}:${index + 1} color fuera de los tokens: ${line.trim()}`);
      if (FONT_NAME.test(line) && !relative.startsWith('app/[locale]/layout')) problems.push(`${relative}:${index + 1} nombre de fuente fuera de los tokens: ${line.trim()}`);
    });
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Tokens: sin colores ni fuentes sueltos.');
