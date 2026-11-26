'use client';

import { type Camera, type Mesh, type Object3D, Vector3 } from 'three';

// Paso del póster al modelo 3D sin saltos. El póster (pnpm models:posters) se
// dibujó con otra cámara y otro encuadre, así que la escena entra primero con
// la pose del póster (mismo giro y elevación) y un ajuste de pantalla (escala
// y desplazamiento) que pone la silueta del modelo justo sobre la del póster.
// El lienzo aparece encima del póster (fundido corto) y después la escena se
// asienta por tiempo en su encuadre propio. Se mide una sola vez por entrada,
// nunca por cuadro.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Pose con la que se dibujaron los pósters (design/prototype/dev/poster.html):
// cámara a 0.9 m (0.62 m para balones) y 0.02 m sobre el centro del objeto;
// zapato a tres cuartos (0.5 rad) desde su lado externo, balón girado 0.35 rad.
export const POSTER_POSE = {
  sneakerYaw: 0.5,
  ballYaw: 0.35,
  sneakerElevation: Math.atan2(0.02, 0.9),
  ballElevation: Math.atan2(0.02, 0.62),
};

// Alfa mínimo de la silueta: deja fuera la sombra suave del póster (su alfa
// máximo ronda 160) y los bordes difusos.
const ALPHA = 200;
const SCAN_WIDTH = 360;
const silhouettes = new Map<string, Promise<Box | null>>();

// Caja de la silueta del póster en fracciones de la imagen (0 a 1). Se mide
// una vez por archivo, sobre una copia reducida.
export function posterSilhouette(image: HTMLImageElement): Promise<Box | null> {
  const src = image.currentSrc || image.src;
  const cached = silhouettes.get(src);
  if (cached) return cached;
  const task = (async () => {
    try {
      await image.decode();
      const width = SCAN_WIDTH;
      const height = Math.max(1, Math.round((SCAN_WIDTH * image.naturalHeight) / Math.max(1, image.naturalWidth)));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(image, 0, 0, width, height);
      const { data } = context.getImageData(0, 0, width, height);
      let left = width;
      let right = -1;
      let top = height;
      let bottom = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] < ALPHA) continue;
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
      if (right < left || bottom < top) return null;
      return { left: left / width, top: top / height, right: (right + 1) / width, bottom: (bottom + 1) / height };
    } catch {
      return null;
    }
  })();
  silhouettes.set(src, task);
  return task;
}

// Imagen visible del póster (ThemedPoster deja la del otro tema con display: none).
export function visiblePoster(container: HTMLElement | null): HTMLImageElement | null {
  if (!container) return null;
  for (const image of container.querySelectorAll('img')) {
    if (getComputedStyle(image).display !== 'none' && image.complete && image.naturalWidth > 0) return image;
  }
  return null;
}

// Silueta del póster en píxeles del lienzo (CSS). Si el contenedor está
// escalado (una entrada en curso), la proporción se corrige con el ancho real.
export async function posterBoxOnCanvas(container: HTMLElement | null, canvas: HTMLElement): Promise<Box | null> {
  const image = visiblePoster(container);
  if (!image) return null;
  const fraction = await posterSilhouette(image);
  if (!fraction) return null;
  const imageRect = image.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  if (!imageRect.width || !canvasRect.width || !canvas.clientWidth) return null;
  const ratio = canvas.clientWidth / canvasRect.width;
  const x = (value: number) => (imageRect.left + value * imageRect.width - canvasRect.left) * ratio;
  const y = (value: number) => (imageRect.top + value * imageRect.height - canvasRect.top) * ratio;
  return { left: x(fraction.left), top: y(fraction.top), right: x(fraction.right), bottom: y(fraction.bottom) };
}

const point = new Vector3();

// Caja de la silueta del modelo en píxeles del lienzo, proyectando sus
// vértices con la cámara actual (matrices al día).
export function modelBox(object: Object3D, camera: Camera, width: number, height: number): Box | null {
  object.updateWorldMatrix(true, true);
  camera.updateMatrixWorld();
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  object.traverse((child) => {
    const mesh = child as Mesh;
    const position = mesh.isMesh ? mesh.geometry?.attributes.position : undefined;
    if (!position || !mesh.visible) return;
    // Basta una muestra en mallas grandes: la caja cambia menos de un píxel.
    const step = Math.max(1, Math.floor(position.count / 20000));
    for (let index = 0; index < position.count; index += step) {
      point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld).project(camera);
      const px = ((point.x + 1) / 2) * width;
      const py = ((1 - point.y) / 2) * height;
      if (px < left) left = px;
      if (px > right) right = px;
      if (py < top) top = py;
      if (py > bottom) bottom = py;
    }
  });
  return Number.isFinite(left) && right > left && bottom > top ? { left, top, right, bottom } : null;
}

// Ajuste de pantalla que lleva la caja del modelo sobre la del póster:
// escala alrededor de `center` y luego desplazamiento (px).
export function fitBox(model: Box, poster: Box, center: { x: number; y: number }) {
  const scaleX = (poster.right - poster.left) / (model.right - model.left);
  const scaleY = (poster.bottom - poster.top) / (model.bottom - model.top);
  const scale = Math.sqrt(scaleX * scaleY);
  const modelX = (model.left + model.right) / 2;
  const modelY = (model.top + model.bottom) / 2;
  const posterX = (poster.left + poster.right) / 2;
  const posterY = (poster.top + poster.bottom) / 2;
  const dx = posterX - (center.x + (modelX - center.x) * scale);
  const dy = posterY - (center.y + (modelY - center.y) * scale);
  // Un ajuste absurdo (póster sin cargar, medida rota) no se aplica.
  if (!Number.isFinite(scale) || scale < 0.5 || scale > 2) return null;
  return { scale, dx, dy };
}
