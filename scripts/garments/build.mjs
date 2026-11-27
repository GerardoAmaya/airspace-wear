// Genera las prendas propias del proyecto (hoy, el hoodie en dos colores).
//
// Uso:
//   pnpm garments                    geometría (Blender) y texturas
//   pnpm garments --skip-blender     solo texturas (reusa la geometría)
//
// Requisitos: el FBX del Y Bot en assets/avatar/raw (pnpm avatar:build lo usa
// también) y Blender (BLENDER_PATH, PATH o /Applications/Blender.app).
//
// Pasos:
//   1. Blender (hoodie.py): la prenda modelada sobre el cuerpo del maniquí,
//      con UV en un atlas, en dos poses: reposo (T-pose) y exhibición (brazos
//      abajo). También layout.json: islas del atlas, costuras y medidas.
//   2. Aquí: las texturas de cada color (textures.mjs y prints.mjs) y un GLB
//      por producto y pose:
//      - assets/models/raw/<slug>.glb: exhibición, el "original" del pipeline
//        de modelos (pnpm models:optimize --only <slug>);
//      - assets/garments/out/<slug>-rest.glb: reposo, lo que ajusta pnpm
//        avatar:fit (fit.json lo nombra en "source").
//
// Todo es obra propia: geometría derivada del maniquí y texturas dibujadas
// por estos scripts. Los logos de marcas se usan solo para ilustrar este
// proyecto de portafolio, sin afiliación (ver CREDITS.md).

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { createIO } from '../models/shared.mjs';
import { COLORWAYS, GARMENT_PATHS, HOODIE, ROOT_DIR } from './config.mjs';
import { buildTextures } from './textures.mjs';

const execFileAsync = promisify(execFile);
const { values: cli } = parseArgs({ options: { 'skip-blender': { type: 'boolean' } } });

const CHARACTER = path.join(ROOT_DIR, 'assets/avatar/raw/ybot.fbx');
const SCRIPT = path.join(ROOT_DIR, 'scripts/garments/hoodie.py');
const OUT = GARMENT_PATHS.outDir;

async function findBlender() {
  for (const candidate of [process.env.BLENDER_PATH, 'blender', '/Applications/Blender.app/Contents/MacOS/Blender'].filter(Boolean)) {
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 60_000 });
      return candidate;
    } catch {
      // Se prueba el siguiente.
    }
  }
  return null;
}

await mkdir(OUT, { recursive: true });
await mkdir(GARMENT_PATHS.rawModelsDir, { recursive: true });

if (!cli['skip-blender']) {
  const blender = await findBlender();
  if (!blender) {
    console.error('No se encontró Blender (BLENDER_PATH, PATH o /Applications/Blender.app).');
    process.exit(1);
  }
  const configFile = path.join(OUT, 'hoodie-config.json');
  await writeFile(configFile, `${JSON.stringify(HOODIE, null, 2)}\n`);
  const args = ['--background', '--factory-startup', '--python-exit-code', '1', '--python', SCRIPT, '--'];
  args.push('--character', CHARACTER, '--config', configFile, '--out-dir', OUT);
  try {
    const { stdout } = await execFileAsync(blender, args, { maxBuffer: 256 * 1024 * 1024, timeout: 1_800_000 });
    for (const line of stdout.split('\n')) if (line.startsWith('[garment]')) console.log(`  ${line.slice(10)}`);
  } catch (error) {
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim().split('\n').slice(-30).join('\n');
    console.error(`Blender no pudo modelar el hoodie.\n\n${output}`);
    process.exit(1);
  }
}

const layout = JSON.parse(await readFile(path.join(OUT, 'layout.json'), 'utf8'));
const io = await createIO();

// Asigna las texturas de un color a la tela y el color del metal.
function dress(document, textures, colorway) {
  const root = document.getRoot();
  const make = (name, image) => document.createTexture(name).setImage(new Uint8Array(image)).setMimeType('image/png');
  const baseColor = make(`${colorway.slug}-color`, textures.baseColor);
  const normal = make(`${colorway.slug}-normal`, textures.normal);
  const roughness = make(`${colorway.slug}-roughness`, textures.roughness);
  for (const material of root.listMaterials()) {
    if (material.getName() === 'hoodie-fabric') {
      material
        .setBaseColorFactor([1, 1, 1, 1])
        .setBaseColorTexture(baseColor)
        .setNormalTexture(normal)
        .setMetallicRoughnessTexture(roughness)
        .setMetallicFactor(1)
        .setRoughnessFactor(1);
    } else if (material.getName() === 'hoodie-metal') {
      material.setBaseColorFactor([...colorway.metal, 1]).setMetallicFactor(1).setRoughnessFactor(0.32);
    }
  }
}

for (const colorway of COLORWAYS) {
  const started = performance.now();
  const textures = await buildTextures(layout, colorway);
  await writeFile(path.join(OUT, `${colorway.slug}-color.png`), textures.baseColor);
  for (const [pose, target] of [
    ['display', path.join(GARMENT_PATHS.rawModelsDir, `${colorway.slug}.glb`)],
    ['rest', path.join(OUT, `${colorway.slug}-rest.glb`)],
  ]) {
    const document = await io.read(path.join(OUT, `hoodie-${pose}.glb`));
    dress(document, textures, colorway);
    await writeFile(target, await io.writeBinary(document));
  }
  console.log(`  ${colorway.slug}: texturas y GLB en ${((performance.now() - started) / 1000).toFixed(1)} s`);
}
console.log(`\nListo. Sigue: pnpm models:optimize --only <slug>, pnpm models:posters y pnpm avatar:fit --only <slug>.`);
