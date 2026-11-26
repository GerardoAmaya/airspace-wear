// Operaciones geométricas del pipeline: separar un zapato de un par y llevar
// cada modelo a la pose canónica (punta a +X, suela en y = 0, escala real).

import { compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const AXIS_INDEX = { x: 0, y: 1, z: 2 };
const DEG_TO_RAD = Math.PI / 180;

const defaultScene = (document) => {
  const root = document.getRoot();
  return root.getDefaultScene() ?? root.listScenes()[0];
};

// Transforma un punto local a coordenadas de mundo con una matriz 4x4 (column-major).
function toWorld(matrix, v) {
  return [
    matrix[0] * v[0] + matrix[4] * v[1] + matrix[8] * v[2] + matrix[12],
    matrix[1] * v[0] + matrix[5] * v[1] + matrix[9] * v[2] + matrix[13],
    matrix[2] * v[0] + matrix[6] * v[1] + matrix[10] * v[2] + matrix[14],
  ];
}

// Conserva solo los triángulos cuyo centro (en mundo) cae del lado pedido de
// un eje. Sirve para quedarse con un zapato cuando el archivo trae el par.
export function keepTrianglesOnSide(document, { axis, side }) {
  const axisIndex = AXIS_INDEX[axis];
  const keepPositive = side === 'positive';
  defaultScene(document).traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const matrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      if (!indices) throw new Error('keepTrianglesOnSide requiere primitivas indexadas');
      const vertex = [0, 0, 0];
      const coordinate = (index) => toWorld(matrix, position.getElement(index, vertex))[axisIndex];
      const kept = [];
      for (let i = 0; i < indices.getCount(); i += 3) {
        const a = indices.getScalar(i);
        const b = indices.getScalar(i + 1);
        const c = indices.getScalar(i + 2);
        const center = (coordinate(a) + coordinate(b) + coordinate(c)) / 3;
        if (center > 0 === keepPositive) kept.push(a, b, c);
      }
      if (!kept.length) {
        primitive.dispose();
        continue;
      }
      const newIndices = document
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint32Array(kept))
        .setBuffer(indices.getBuffer());
      primitive.setIndices(newIndices);
      // Elimina los vértices que quedaron sin uso.
      compactPrimitive(primitive);
    }
  });
}

// Elimina piezas sueltas (componentes conexos) más pequeñas que el umbral,
// expresado como fracción del tamaño de cada malla. No simplifica nada más.
// Requiere haber esperado MeshoptSimplifier.ready.
export function removeSmallParts(document, threshold) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      if (!indices) continue;
      const kept = MeshoptSimplifier.simplifyPrune(
        new Uint32Array(indices.getArray()),
        new Float32Array(position.getArray()),
        3,
        threshold,
      );
      if (kept.length === indices.getCount()) continue;
      if (!kept.length) {
        primitive.dispose();
        continue;
      }
      primitive.setIndices(
        document.createAccessor().setType('SCALAR').setArray(new Uint32Array(kept)).setBuffer(indices.getBuffer()),
      );
      compactPrimitive(primitive);
    }
  }
}

// Simplifica una primitiva permitiendo colapsar vértices sobre las costuras de
// UV (bandera Permissive de meshoptimizer). Los escaneos traen el atlas de
// textura partido en miles de islas: la simplificación normal no puede cruzar
// esos bordes y se queda muy lejos de la meta. Cruzarlas sin cuidado rompe la
// textura (islas mezcladas), así que el error de UV pesa más que el de
// posición. Con el Dunk High Hawaii, peso 1 sin atributos rompía la textura;
// 10 llega a la meta del lite sin roturas visibles (100 queda casi igual con
// 13k triángulos más).
// Requiere haber esperado MeshoptSimplifier.ready.
const PERMISSIVE_UV_WEIGHT = 10;

export function simplifyPrimitivePermissive(document, primitive, { ratio, error }) {
  const indices = primitive.getIndices();
  const position = primitive.getAttribute('POSITION');
  const uv = primitive.getAttribute('TEXCOORD_0');
  if (!indices || !position || !uv) return;
  const targetCount = Math.floor((indices.getCount() * ratio) / 3) * 3;
  const [kept] = MeshoptSimplifier.simplifyWithAttributes(
    new Uint32Array(indices.getArray()),
    new Float32Array(position.getArray()),
    3,
    new Float32Array(uv.getArray()),
    2,
    [PERMISSIVE_UV_WEIGHT, PERMISSIVE_UV_WEIGHT],
    null,
    targetCount,
    error,
    ['Permissive'],
  );
  primitive.setIndices(
    document.createAccessor().setType('SCALAR').setArray(new Uint32Array(kept)).setBuffer(indices.getBuffer()),
  );
  compactPrimitive(primitive);
}

// Simplifica una primitiva cuidando también las normales y las UV
// (simplifyWithAttributes de meshoptimizer). La simplificación normal solo
// mira posiciones y puede deformar las UV: el mapa de relieve muestra
// reflejos falsos o manchas. Requiere haber esperado MeshoptSimplifier.ready.
const ATTRIBUTE_WEIGHTS = { NORMAL: 0.5, TEXCOORD_0: 1 };

export function simplifyPrimitiveWithAttributes(document, primitive, { ratio, error }) {
  const indices = primitive.getIndices();
  const position = primitive.getAttribute('POSITION');
  if (!indices || !position) return;
  const sources = Object.entries(ATTRIBUTE_WEIGHTS)
    .map(([semantic, weight]) => ({ accessor: primitive.getAttribute(semantic), weight }))
    .filter(({ accessor }) => accessor);
  const stride = sources.reduce((sum, { accessor }) => sum + accessor.getElementSize(), 0);
  const vertexCount = position.getCount();
  const attributes = new Float32Array(vertexCount * stride);
  const weights = [];
  let offset = 0;
  for (const { accessor, weight } of sources) {
    const size = accessor.getElementSize();
    const element = new Array(size);
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      accessor.getElement(vertex, element);
      for (let component = 0; component < size; component++) attributes[vertex * stride + offset + component] = element[component];
    }
    for (let component = 0; component < size; component++) weights.push(weight);
    offset += size;
  }
  const targetCount = Math.floor((indices.getCount() * ratio) / 3) * 3;
  const [kept] = MeshoptSimplifier.simplifyWithAttributes(
    new Uint32Array(indices.getArray()),
    new Float32Array(position.getArray()),
    3,
    attributes,
    stride,
    weights,
    null,
    targetCount,
    error,
    [],
  );
  primitive.setIndices(
    document.createAccessor().setType('SCALAR').setArray(new Uint32Array(kept)).setBuffer(indices.getBuffer()),
  );
  compactPrimitive(primitive);
}

// Cuaternión [x, y, z, w] desde ángulos de Euler en grados (orden XYZ).
function quaternionFromEuler([x, y, z]) {
  const [cx, sx] = [Math.cos((x * DEG_TO_RAD) / 2), Math.sin((x * DEG_TO_RAD) / 2)];
  const [cy, sy] = [Math.cos((y * DEG_TO_RAD) / 2), Math.sin((y * DEG_TO_RAD) / 2)];
  const [cz, sz] = [Math.cos((z * DEG_TO_RAD) / 2), Math.sin((z * DEG_TO_RAD) / 2)];
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ];
}

// Producto de cuaterniones a * b (aplica b primero y luego a).
function multiplyQuaternions(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

// Toma una muestra de posiciones en mundo (como máximo maxSamples puntos).
function sampleWorldPositions(scene, maxSamples) {
  let total = 0;
  scene.traverse((node) => {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) total += primitive.getAttribute('POSITION').getCount();
  });
  const stride = Math.max(1, Math.floor(total / maxSamples));
  const samples = [];
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const matrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      const vertex = [0, 0, 0];
      for (let i = 0; i < position.getCount(); i += stride) samples.push(toWorld(matrix, position.getElement(i, vertex)));
    }
  });
  return samples;
}

// Busca el giro fino en Y (yaw) que alinea el largo del zapato con X:
// el ángulo que minimiza la profundidad (extensión en Z) del modelo.
function findYawCorrection(samples, rangeDegrees = 30, stepDegrees = 0.25) {
  let best = { degrees: 0, depth: Infinity };
  for (let degrees = -rangeDegrees; degrees <= rangeDegrees; degrees += stepDegrees) {
    const angle = degrees * DEG_TO_RAD;
    const [sin, cos] = [Math.sin(angle), Math.cos(angle)];
    let min = Infinity;
    let max = -Infinity;
    for (const [x, , z] of samples) {
      const rotatedZ = -x * sin + z * cos;
      if (rotatedZ < min) min = rotatedZ;
      if (rotatedZ > max) max = rotatedZ;
    }
    if (max - min < best.depth) best = { degrees, depth: max - min };
  }
  return best.degrees;
}

// Caja de la escena medida sobre los vértices transformados a mundo (solo los
// que usan los triángulos). No depende de cómo calcule la caja la librería:
// una caja hecha con el mínimo y el máximo de cada malla, transformada como
// caja, queda holgada tras un giro que no es recto y el zapato saldría corto.
function measureWorldBounds(scene) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const vertex = [0, 0, 0];
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const matrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      const indices = primitive.getIndices();
      const count = indices ? indices.getCount() : position.getCount();
      for (let i = 0; i < count; i++) {
        const world = toWorld(matrix, position.getElement(indices ? indices.getScalar(i) : i, vertex));
        for (let axis = 0; axis < 3; axis++) {
          if (world[axis] < min[axis]) min[axis] = world[axis];
          if (world[axis] > max[axis]) max[axis] = world[axis];
        }
      }
    }
  });
  return { min, max };
}

// Envuelve la escena en un nodo raíz y lo transforma hasta la pose canónica.
// Devuelve los datos aplicados para registrarlos en el manifest.
export function normalizePose(document, { rotation = [0, 0, 0], lengthMeters, autoYaw = true }) {
  const scene = defaultScene(document);
  const pivot = document.createNode('AirspaceRoot');
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    pivot.addChild(child);
  }
  scene.addChild(pivot);

  // 1. Giro grueso de la configuración (lleva la punta a +X).
  const baseRotation = quaternionFromEuler(rotation);
  pivot.setRotation(baseRotation);

  // 2. Giro fino automático para que el largo quede paralelo a X.
  const yawDegrees = autoYaw ? findYawCorrection(sampleWorldPositions(scene, 60_000)) : 0;
  pivot.setRotation(multiplyQuaternions(quaternionFromEuler([0, yawDegrees, 0]), baseRotation));

  // 3. Escala a tamaño real según el largo en X, medido en los vértices.
  let { min, max } = measureWorldBounds(scene);
  const scale = lengthMeters / (max[0] - min[0]);
  pivot.setScale([scale, scale, scale]);

  // 4. Centra en X y Z y apoya la suela en y = 0.
  ({ min, max } = measureWorldBounds(scene));
  pivot.setTranslation([-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2]);

  ({ min, max } = measureWorldBounds(scene));
  const toCentimeters = (value) => Math.round(value * 1000) / 10;
  return {
    rotation,
    yawCorrection: yawDegrees,
    scale: Number(scale.toPrecision(6)),
    dimensionsCm: {
      length: toCentimeters(max[0] - min[0]),
      width: toCentimeters(max[2] - min[2]),
      height: toCentimeters(max[1] - min[1]),
    },
  };
}
