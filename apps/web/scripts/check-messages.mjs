// Revisa los mensajes: mismas llaves en es y en (base y cada sección), sin
// valores vacíos ni rayas largas. Uso: pnpm --filter @airspace/web lint:messages
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '../messages');
const flat = (object, prefix = '') =>
  Object.entries(object).flatMap(([key, value]) => (value && typeof value === 'object' ? flat(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]));

const files = ['es.json', ...(await readdir(path.join(DIR, 'home'))).filter((name) => name.endsWith('.es.json')).map((name) => `home/${name}`)];
const problems = [];
let keys = 0;
for (const file of files) {
  const es = new Map(flat(JSON.parse(await readFile(path.join(DIR, file), 'utf8'))));
  const enFile = file.replace(/es\.json$/, 'en.json');
  const en = new Map(flat(JSON.parse(await readFile(path.join(DIR, enFile), 'utf8'))));
  keys += es.size;
  for (const key of es.keys()) if (!en.has(key)) problems.push(`${enFile}: falta ${key}`);
  for (const key of en.keys()) if (!es.has(key)) problems.push(`${file}: falta ${key}`);
  for (const [name, map] of [[file, es], [enFile, en]]) {
    for (const [key, value] of map) {
      if (value === '') problems.push(`${name}: ${key} está vacío`);
      if (String(value).includes('—')) problems.push(`${name}: ${key} tiene raya larga`);
    }
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Mensajes: ${keys} llaves parejas en es y en, sin rayas largas.`);
