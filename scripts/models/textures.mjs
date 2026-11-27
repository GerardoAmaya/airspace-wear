// Retoques de textura del pipeline: tapa zonas de una textura (un "YOUR LOGO"
// de plantilla, el parche con el logo del autor) antes de optimizar.
//
// Cada retoque (texturePatches en config.mjs) elige la textura por material y
// slot, y da rectángulos en fracciones de la imagen [x0, y0, x1, y1] (origen
// arriba a la izquierda, igual que las UV de glTF). Dos formas de rellenar:
// - fill: 'surround' pinta el rectángulo con el color de un borde de unos
//   píxeles alrededor (la mediana; sirve en telas lisas), o fill: [r, g, b]
//   con un color dado;
// - copyFrom: [dx, dy] copia la zona desplazada en esas fracciones (conserva
//   el tejido o el estampado de al lado, como un tampón de clonar);
// - floor: [r, g, b] sube cada canal al menos a ese valor y deja igual lo que
//   ya es más claro (un logo, una costura). Sirve para un color negro puro
//   (0, 0, 0), que en PBR solo muestra el reflejo y se ve con bandas.

import sharp from 'sharp';

// Ancho del borde que se muestrea con fill: 'surround', en píxeles.
const SURROUND_PIXELS = 6;

function findTexture(document, { material, slot = 'baseColorTexture' }) {
  const owner = document
    .getRoot()
    .listMaterials()
    .find((item) => item.getName() === material);
  if (!owner) throw new Error(`texturePatches: no existe el material ${material}`);
  const getter = `get${slot.charAt(0).toUpperCase()}${slot.slice(1)}`;
  const texture = owner[getter]?.();
  if (!texture) throw new Error(`texturePatches: el material ${material} no tiene ${slot}`);
  return texture;
}

export async function patchTextures(document, patches = []) {
  for (const patch of patches) {
    const texture = findTexture(document, patch);
    const { hasAlpha } = await sharp(texture.getImage()).metadata();
    const { data, info } = await sharp(texture.getImage()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const channels = 4;
    for (const [x0, y0, x1, y1] of patch.rects) {
      const left = Math.max(0, Math.floor(x0 * width));
      const top = Math.max(0, Math.floor(y0 * height));
      const right = Math.min(width, Math.ceil(x1 * width));
      const bottom = Math.min(height, Math.ceil(y1 * height));
      if (patch.floor) {
        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) {
            const offset = (y * width + x) * channels;
            for (let c = 0; c < 3; c++) data[offset + c] = Math.max(data[offset + c], patch.floor[c]);
          }
        }
        continue;
      }
      if (patch.copyFrom) {
        const dx = Math.round(patch.copyFrom[0] * width);
        const dy = Math.round(patch.copyFrom[1] * height);
        // Se copia desde una instantánea para no leer píxeles ya retocados.
        const source = Buffer.from(data);
        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) {
            const sx = Math.min(width - 1, Math.max(0, x + dx));
            const sy = Math.min(height - 1, Math.max(0, y + dy));
            source.copy(data, (y * width + x) * channels, (sy * width + sx) * channels, (sy * width + sx + 1) * channels);
          }
        }
        continue;
      }
      // Color del borde que rodea al rectángulo: la mediana de cada canal, así
      // una franja de otro color que toque el borde no tiñe el relleno.
      const samples = [[], [], [], []];
      for (let y = Math.max(0, top - SURROUND_PIXELS); y < Math.min(height, bottom + SURROUND_PIXELS); y++) {
        for (let x = Math.max(0, left - SURROUND_PIXELS); x < Math.min(width, right + SURROUND_PIXELS); x++) {
          if (x >= left && x < right && y >= top && y < bottom) continue;
          const offset = (y * width + x) * channels;
          for (let c = 0; c < channels; c++) samples[c].push(data[offset + c]);
        }
      }
      const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
      const color = Array.isArray(patch.fill) ? [...patch.fill, 255].slice(0, 4) : samples.map(median);
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) data.set(color, (y * width + x) * channels);
      }
    }
    // PNG sin pérdida: la conversión a WebP llega después, en la optimización.
    // Si el original no tenía alfa, tampoco se le agrega.
    const image = sharp(data, { raw: { width, height, channels } });
    const png = await (hasAlpha ? image : image.removeAlpha()).png().toBuffer();
    texture.setImage(new Uint8Array(png)).setMimeType('image/png');
  }
}
