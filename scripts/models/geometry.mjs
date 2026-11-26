// Operaciones geométricas del pipeline: separar un zapato de un par, quitar
// piezas sobrantes (pisos, maniquíes, rótulos) y llevar cada modelo a su pose
// canónica (zapatos: punta a +X; prendas: frente a +Z; siempre apoyado en
// y = 0, centrado en X y Z y con su tamaño real).

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

// Piezas conexas de una primitiva: a cada triángulo le asigna el número de
// su pieza (unión de triángulos que comparten vértices).
function triangleComponents(indices) {
  const parent = new Map();
  const find = (a) => {
    while (parent.has(a) && parent.get(a) !== a) {
      parent.set(a, parent.get(parent.get(a)) ?? parent.get(a));
      a = parent.get(a);
    }
    return a;
  };
  const union = (a, b) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(ra, rb);
  };
  for (let i = 0; i < indices.getCount(); i++) if (!parent.has(indices.getScalar(i))) parent.set(indices.getScalar(i), indices.getScalar(i));
  for (let i = 0; i < indices.getCount(); i += 3) {
    union(indices.getScalar(i), indices.getScalar(i + 1));
    union(indices.getScalar(i), indices.getScalar(i + 2));
  }
  const components = [];
  for (let i = 0; i < indices.getCount(); i += 3) components.push(find(indices.getScalar(i)));
  return components;
}

// Conserva solo los triángulos cuyo centro (en mundo) cae del lado pedido de
// un eje. Sirve para quedarse con un zapato cuando el archivo trae el par.
// Si el par está en diagonal, un eje no los separa: en vez de axis se da un
// plano de corte con normal [x, y, z] (en mundo) y offset (n · p = offset).
// Con byComponent se decide por pieza conexa (el centro de toda la pieza) y
// no por triángulo: separa una camiseta de su short aunque el ruedo de la
// camiseta baje más que la pretina del short (un corte por triángulo partiría
// el ruedo).
export function keepTrianglesOnSide(document, { axis, side, normal, offset = 0, byComponent = false }) {
  const keepPositive = side === 'positive';
  const length = normal ? Math.hypot(...normal) : 1;
  const direction = normal ? normal.map((value) => value / length) : null;
  const project = (world) =>
    direction
      ? direction[0] * world[0] + direction[1] * world[1] + direction[2] * world[2] - offset
      : world[AXIS_INDEX[axis]];
  defaultScene(document).traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const matrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      if (!indices) throw new Error('keepTrianglesOnSide requiere primitivas indexadas');
      const vertex = [0, 0, 0];
      const coordinate = (index) => project(toWorld(matrix, position.getElement(index, vertex)));
      const centers = [];
      for (let i = 0; i < indices.getCount(); i += 3) {
        centers.push((coordinate(indices.getScalar(i)) + coordinate(indices.getScalar(i + 1)) + coordinate(indices.getScalar(i + 2))) / 3);
      }
      // Por pieza: el centro de cada triángulo pasa a ser el promedio de su pieza.
      if (byComponent) {
        const components = triangleComponents(indices);
        const sums = new Map();
        components.forEach((component, triangle) => {
          const [sum, count] = sums.get(component) ?? [0, 0];
          sums.set(component, [sum + centers[triangle], count + 1]);
        });
        components.forEach((component, triangle) => {
          const [sum, count] = sums.get(component);
          centers[triangle] = sum / count;
        });
      }
      const kept = [];
      for (let i = 0; i < indices.getCount(); i += 3) {
        if (centers[i / 3] > 0 === keepPositive) kept.push(indices.getScalar(i), indices.getScalar(i + 1), indices.getScalar(i + 2));
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
// La escala sale de la medida real en un eje: sizeAxis 'x' (largo de un
// zapato, diámetro de un balón, ancho de una gorra) o 'y' (alto de una
// prenda). garment cambia los nombres de las medidas del manifest (ancho, alto
// y fondo en vez de largo, ancho y alto).
// Devuelve los datos aplicados para registrarlos en el manifest.
export function normalizePose(
  document,
  { rotation = [0, 0, 0], lengthMeters, sizeAxis = 'x', autoYaw = true, garment = false },
) {
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

  // 3. Escala a tamaño real según la medida del eje pedido, en los vértices.
  let { min, max } = measureWorldBounds(scene);
  const axis = AXIS_INDEX[sizeAxis];
  const scale = lengthMeters / (max[axis] - min[axis]);
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
    dimensionsCm: garment
      ? {
          width: toCentimeters(max[0] - min[0]),
          height: toCentimeters(max[1] - min[1]),
          depth: toCentimeters(max[2] - min[2]),
        }
      : {
          length: toCentimeters(max[0] - min[0]),
          width: toCentimeters(max[2] - min[2]),
          height: toCentimeters(max[1] - min[1]),
        },
  };
}

// Producto de matrices 4x4 en orden de columnas (a * b).
function multiplyMatrices(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return out;
}

// Hornea las mallas con esqueleto (skin) en su pose actual: cada vértice
// pasa a la posición en mundo que le dan sus huesos y la malla queda fija,
// sin esqueleto ni animaciones. Las prendas exportadas sobre un cuerpo
// (MetaHuman) vienen así: el visor las dibuja con los huesos, pero el
// pipeline (pose, escala, simplificación) trabaja con posiciones fijas. El
// ajuste al avatar del Hangar se hace después con su propio esqueleto.
export function bakeSkins(document) {
  const root = document.getRoot();
  const scene = defaultScene(document);
  let baked = 0;
  for (const node of root.listNodes()) {
    const skin = node.getSkin();
    const mesh = node.getMesh();
    if (!skin || !mesh) continue;
    const joints = skin.listJoints();
    const inverseBind = skin.getInverseBindMatrices();
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const jointMatrices = joints.map((joint, index) =>
      multiplyMatrices(joint.getWorldMatrix(), inverseBind ? inverseBind.getElement(index, new Array(16)) : identity),
    );
    const bakedMesh = document.createMesh(mesh.getName());
    for (const source of mesh.listPrimitives()) {
      const primitive = source.clone();
      const position = primitive.getAttribute('POSITION');
      const normal = primitive.getAttribute('NORMAL');
      const jointIds = primitive.getAttribute('JOINTS_0');
      const weights = primitive.getAttribute('WEIGHTS_0');
      if (jointIds && weights) {
        const positions = new Float32Array(position.getCount() * 3);
        const normals = normal ? new Float32Array(normal.getCount() * 3) : null;
        const [p, n, j, w] = [[0, 0, 0], [0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
        for (let vertex = 0; vertex < position.getCount(); vertex++) {
          position.getElement(vertex, p);
          jointIds.getElement(vertex, j);
          weights.getElement(vertex, w);
          const matrix = new Array(16).fill(0);
          for (let k = 0; k < 4; k++) {
            if (!w[k]) continue;
            const joint = jointMatrices[j[k]];
            for (let e = 0; e < 16; e++) matrix[e] += w[k] * joint[e];
          }
          positions.set(toWorld(matrix, p), vertex * 3);
          if (normals) {
            normal.getElement(vertex, n);
            const x = matrix[0] * n[0] + matrix[4] * n[1] + matrix[8] * n[2];
            const y = matrix[1] * n[0] + matrix[5] * n[1] + matrix[9] * n[2];
            const z = matrix[2] * n[0] + matrix[6] * n[1] + matrix[10] * n[2];
            const length = Math.hypot(x, y, z) || 1;
            normals.set([x / length, y / length, z / length], vertex * 3);
          }
        }
        primitive.setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(positions).setBuffer(position.getBuffer()));
        if (normals) primitive.setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(normals).setBuffer(normal.getBuffer()));
        // Las tangentes quedarían giradas: el visor las recalcula si faltan.
        primitive.setAttribute('TANGENT', null);
        primitive.setAttribute('JOINTS_0', null).setAttribute('WEIGHTS_0', null);
      }
      bakedMesh.addPrimitive(primitive);
    }
    // La malla horneada ya está en coordenadas de mundo: cuelga de la escena
    // con un nodo sin transformación.
    const bakedNode = document.createNode(node.getName()).setMesh(bakedMesh);
    scene.addChild(bakedNode);
    node.setMesh(null).setSkin(null);
    baked++;
  }
  if (!baked) return 0;
  for (const animation of root.listAnimations()) animation.dispose();
  for (const skin of root.listSkins()) skin.dispose();
  return baked;
}

// Nombres con los que se puede elegir una pieza: el del nodo, el de su malla
// y el del material de cada primitiva.
function matchesAny(names, patterns) {
  return patterns.some((pattern) =>
    names.some((name) => name && (pattern instanceof RegExp ? pattern.test(name) : name === pattern)),
  );
}

// Quita o conserva piezas del modelo por nombre de nodo, malla o material
// (texto exacto o expresión regular). remove descarta las primitivas que
// coinciden (pisos, maniquíes, perchas, rótulos); keep conserva solo las que
// coinciden (separa un conjunto en prendas). Devuelve cuántas se quitaron.
export function filterParts(document, { keep, remove }) {
  let removed = 0;
  defaultScene(document).traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    for (const primitive of mesh.listPrimitives()) {
      const names = [node.getName(), mesh.getName(), primitive.getMaterial()?.getName()];
      const drop = (keep && !matchesAny(names, keep)) || (remove && matchesAny(names, remove));
      if (!drop) continue;
      mesh.removePrimitive(primitive);
      primitive.dispose();
      removed++;
    }
  });
  return removed;
}
