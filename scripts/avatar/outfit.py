# Genera el vestuario del maniquí del Hangar 360° a partir del cuerpo del Y Bot.
# Lo ejecuta scripts/avatar/build.mjs; no hace falta llamarlo a mano.
#
# Uso:
#   blender --background --factory-startup --python-exit-code 1 \
#     --python scripts/avatar/outfit.py -- \
#     --character ybot.fbx --config outfit-config.json --out outfit.glb \
#     [--preview carpeta]
#
# Prendas con esqueleto (camiseta, musculosa, shorts, pantalón):
#   1. Se toman las piezas del cuerpo (el Y Bot es un maniquí por piezas
#      cerradas, una por hueso) cuyo hueso dominante está en la lista.
#   2. Se inflan por la normal y se unen con un remallado de vóxeles: queda
#      una sola superficie continua, sin las juntas del maniquí.
#   3. Se suaviza, se cortan los dobladillos con planos limpios, se abre el
#      cuello y se reduce a la meta de triángulos.
#   4. Canto del dobladillo: solidify solo borde, hacia adentro.
#   5. Pesos: se copian del cuerpo (punto más cercano, interpolado) y se
#      suavizan un poco, así la tela se deforma con cada clip sin quiebres.
# Accesorios rígidos (gorra y lentes): geometría propia ajustada a la cabeza,
# sin esqueleto, como hijos del hueso mixamorig:Head.
#
# El GLB sale con el mismo esqueleto que el personaje (mismo FBX y mismos
# ajustes de exportación): la web vuelve a enlazar cada prenda a los huesos del
# avatar por nombre. build.mjs aplica la misma pose y escala que al avatar.

import json
import math
import os
import re
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc

# Sin __pycache__ junto a los scripts al importar fbx_to_glb.
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fbx_to_glb import export_options, import_fbx  # noqa: E402


def parse_args(argv):
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    options = {}
    for index in range(0, len(args), 2):
        if index + 1 >= len(args):
            raise SystemExit(f"Falta el valor de {args[index]}")
        options[args[index].lstrip("-")] = args[index + 1]
    for required in ("character", "config", "out"):
        if required not in options:
            raise SystemExit(f"Falta --{required}")
    return options


def base_name(name):
    # "mixamorig:LeftArm", "mixamorig1:LeftArm" -> "LeftArm"
    match = re.match(r"^mixamorig\d*[:_]?(.+)$", name)
    return match.group(1) if match else name


def log(message):
    print(f"[outfit] {message}", flush=True)


# ---------- Cuerpo ----------


class Body:
    """Cuerpo del Y Bot en coordenadas de mundo de Blender (Z arriba)."""

    def __init__(self, height_meters):
        scene = bpy.context.scene
        armatures = [obj for obj in scene.objects if obj.type == "ARMATURE"]
        meshes = [obj for obj in scene.objects if obj.type == "MESH"]
        if len(armatures) != 1 or not meshes:
            raise SystemExit("Se esperaba un personaje con 1 esqueleto y malla.")
        self.armature = armatures[0]
        joints = [obj for obj in meshes if "joint" in obj.name.lower()]
        surfaces = [obj for obj in meshes if obj not in joints]
        if len(surfaces) != 1:
            raise SystemExit(f"Se esperaba 1 malla de superficie y hay {len(surfaces)}.")
        self.surface = surfaces[0]
        self.meshes = surfaces + joints

        # Nombre completo de cada hueso por su nombre base.
        self.full_names = {base_name(bone.name): bone.name for bone in self.armature.data.bones}
        matrix = self.armature.matrix_world
        self.heads = {base_name(bone.name): matrix @ bone.head_local for bone in self.armature.data.bones}

        # Piezas (islas) de cada malla con su hueso dominante.
        self.pieces = [self._pieces(obj) for obj in self.meshes]

        low = min(v[0].z for piece in self.pieces for v in piece["verts"])
        high = max(v[0].z for piece in self.pieces for v in piece["verts"])
        # Escala del pipeline (build.mjs lleva el avatar a height_meters):
        # metros del avatar -> unidades de Blender.
        self.unit = (high - low) / height_meters
        self.floor = low

        # Hacia adelante: promedio de pie -> dedos, en el plano horizontal.
        forward = Vector((0, 0, 0))
        for foot, toe in (("LeftFoot", "LeftToeBase"), ("RightFoot", "RightToeBase")):
            forward += self.heads[toe] - self.heads[foot]
        forward.z = 0
        self.forward = forward.normalized()
        self.up = Vector((0, 0, 1))
        self.side = self.forward.cross(self.up).normalized()
        # Lado izquierdo del personaje (+X en Blender con Mixamo).
        if (self.heads["LeftArm"] - self.heads["RightArm"]).dot(self.side) < 0:
            self.side = -self.side

    def m(self, meters):
        return meters * self.unit

    def _pieces(self, obj):
        # Vértices en mundo con sus pesos por nombre base, e isla de cada uno.
        names = {group.index: base_name(group.name) for group in obj.vertex_groups}
        world = obj.matrix_world
        verts = []
        for vertex in obj.data.vertices:
            weights = {}
            for group in vertex.groups:
                if group.weight > 1e-4:
                    weights[names[group.group]] = weights.get(names[group.group], 0) + group.weight
            verts.append((world @ vertex.co, weights))
        faces = [tuple(polygon.vertices) for polygon in obj.data.polygons]
        # Islas por conectividad.
        parent = list(range(len(verts)))

        def find(index):
            while parent[index] != index:
                parent[index] = parent[parent[index]]
                index = parent[index]
            return index

        for face in faces:
            root = find(face[0])
            for other in face[1:]:
                other_root = find(other)
                if other_root != root:
                    parent[other_root] = root
        island = [find(index) for index in range(len(verts))]
        votes = {}
        for index, (_, weights) in enumerate(verts):
            if not weights:
                continue
            bone = max(weights, key=weights.get)
            votes.setdefault(island[index], {}).setdefault(bone, 0)
            votes[island[index]][bone] += 1
        island_bone = {key: max(counts, key=counts.get) for key, counts in votes.items()}
        return {"verts": verts, "faces": faces, "island": island, "island_bone": island_bone}

    def region(self, bones):
        # BMesh con las piezas cuyo hueso dominante está en `bones`.
        bones = set(bones)
        bm = bmesh.new()
        for piece in self.pieces:
            keep = [piece["island_bone"].get(piece["island"][i]) in bones for i in range(len(piece["verts"]))]
            mapping = {}
            for index, (co, _) in enumerate(piece["verts"]):
                if keep[index]:
                    mapping[index] = bm.verts.new(co)
            for face in piece["faces"]:
                if all(keep[i] for i in face):
                    try:
                        bm.faces.new([mapping[i] for i in face])
                    except ValueError:
                        pass
        bm.normal_update()
        return bm

    def weight_tree(self, bones):
        # BVH de las piezas permitidas (triángulos) y los pesos de sus vértices.
        bones = set(bones)
        verts, weights, triangles = [], [], []
        for piece in self.pieces:
            mapping = {}
            for face in piece["faces"]:
                if piece["island_bone"].get(piece["island"][face[0]]) not in bones:
                    continue
                for index in face:
                    if index not in mapping:
                        mapping[index] = len(verts)
                        verts.append(piece["verts"][index][0])
                        weights.append(piece["verts"][index][1])
                ids = [mapping[i] for i in face]
                for k in range(1, len(ids) - 1):
                    triangles.append((ids[0], ids[k], ids[k + 1]))
        return BVHTree.FromPolygons(verts, triangles), verts, weights, triangles

    def collision_tree(self):
        # BVH de todo el cuerpo (superficie y articulaciones), para la holgura.
        if not hasattr(self, "_collision"):
            everything = {bone for piece in self.pieces for bone in piece["island_bone"].values()}
            self._collision = self.weight_tree(everything)[0]
        return self._collision

    def axis(self, start, end):
        return self.heads[start], self.heads[end]


# ---------- Utilidades de malla ----------


def mesh_object(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def apply_modifier(obj, kind, **props):
    # Aplica un modificador sin operadores (funciona en modo de fondo).
    modifier = obj.modifiers.new("step", kind)
    for key, value in props.items():
        setattr(modifier, key, value)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    obj.modifiers.remove(modifier)
    old = obj.data
    obj.data = mesh
    bpy.data.meshes.remove(old)


def object_bmesh(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    return bm


def write_bmesh(obj, bm):
    bm.to_mesh(obj.data)
    obj.data.update()


def triangle_count(obj):
    return sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons)


def axis_param(point, start, end):
    direction = end - start
    return (point - start).dot(direction) / direction.length_squared


def on_side(body, bone, point):
    # Los cortes de huesos Left/Right solo valen para su lado del cuerpo.
    offset = (point - body.heads["Hips"]).dot(body.side)
    if bone.startswith("Left"):
        return offset > 0
    if bone.startswith("Right"):
        return offset < 0
    return True


def cut(body, bm, spec):
    # Plano perpendicular al eje from -> to en t. Se borra el lado que no queda.
    start, end = body.axis(spec["from"], spec["to"])
    direction = (end - start).normalized()
    point = start + (end - start) * spec["t"]
    normal = direction if spec["keep"] == "below" else -direction
    geom = [vert for vert in bm.verts if on_side(body, spec["from"], vert.co)]
    faces = {face for vert in geom for face in vert.link_faces}
    edges = {edge for vert in geom for edge in vert.link_edges}
    bmesh.ops.bisect_plane(
        bm, geom=list(geom) + list(edges) + list(faces), dist=1e-7, plane_co=point, plane_no=normal, clear_outer=True
    )


def open_hole(body, bm, spec):
    # Abertura del cuello: se borran las caras dentro de un cilindro alrededor
    # del eje from -> to (corrido hacia adelante) y el borde se lleva al radio.
    start, end = body.axis(spec["from"], spec["to"])
    direction = (end - start).normalized()
    center = start + body.forward * body.m(spec.get("forward", 0))
    radius = body.m(spec["radius"])

    def radial(point):
        relative = point - center
        along = relative.dot(direction)
        return relative - direction * along, along / (end - start).length

    doomed = []
    for face in bm.faces:
        offset, t = radial(face.calc_center_median())
        if t >= spec.get("minT", -1) and offset.length < radius:
            doomed.append(face)
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.verts.ensure_lookup_table()
    for vert in bm.verts:
        if not vert.is_boundary:
            continue
        offset, t = radial(vert.co)
        if t >= spec.get("minT", -1) - 0.2 and offset.length < radius * 1.6 and offset.length > 1e-9:
            vert.co += offset.normalized() * (radius - offset.length)
    loose = [vert for vert in bm.verts if not vert.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")


def taper(body, bm, spec):
    # Angosta la pierna hacia el puño: el radio respecto del eje se multiplica
    # por un factor que va de 1 (en start) a `factor` (en end).
    start, end = body.axis(spec["from"], spec["to"])
    direction = (end - start).normalized()
    for vert in bm.verts:
        if not on_side(body, spec["from"], vert.co):
            continue
        t = axis_param(vert.co, start, end)
        if t <= spec["start"]:
            continue
        ramp = min(1.0, (t - spec["start"]) / (spec["end"] - spec["start"]))
        ramp = ramp * ramp * (3 - 2 * ramp)
        scale = 1 + (spec["factor"] - 1) * ramp
        relative = vert.co - start
        along = direction * relative.dot(direction)
        vert.co = start + along + (relative - along) * scale


def push_out(body, bm, clearance):
    # Holgura mínima: ningún vértice de la tela queda a menos de `clearance`
    # de la superficie del cuerpo (en reposo). Así el suavizado no hunde la
    # tela en el cuerpo y cerca de los dobladillos nada lo atraviesa.
    tree = body.collision_tree()
    moved = 0
    for vert in bm.verts:
        location, normal, _, _ = tree.find_nearest(vert.co)
        if location is None:
            continue
        distance = (vert.co - location).dot(normal)
        if distance < clearance:
            vert.co = vert.co + normal * (clearance - distance)
            moved += 1
    return moved


def drape(body, bm, spec):
    # Caída de la tela: alrededor del eje from -> to (de arriba hacia abajo),
    # el radio nunca se achica al bajar entre start y end. La tela cuelga del
    # punto más ancho en vez de seguir cada curva del cuerpo. Del lado de
    # adentro (hacia la otra pierna) crece solo `inner` de lo que tocaría.
    start, end = body.axis(spec["from"], spec["to"])
    axis = end - start
    direction = axis.normalized()
    reference = body.forward - direction * body.forward.dot(direction)
    u = reference.normalized()
    v = direction.cross(u).normalized()
    inward = None
    if spec["from"].startswith("Left"):
        inward = -body.side
    elif spec["from"].startswith("Right"):
        inward = body.side
    bins, slices = 36, 32
    t0, t1 = spec["start"], spec["end"]
    table = [[0.0] * bins for _ in range(slices)]
    chosen = []
    for vert in bm.verts:
        if not on_side(body, spec["from"], vert.co):
            continue
        t = axis_param(vert.co, start, end)
        if t < t0 or t > t1:
            continue
        relative = vert.co - start
        radial = relative - direction * relative.dot(direction)
        angle = math.atan2(radial.dot(v), radial.dot(u))
        slice_index = min(slices - 1, int((t - t0) / (t1 - t0) * slices))
        bin_index = int((angle + math.pi) / (2 * math.pi) * bins) % bins
        table[slice_index][bin_index] = max(table[slice_index][bin_index], radial.length)
        chosen.append((vert, t, angle, radial))
    # Máximo acumulado hacia abajo y suavizado en el ángulo.
    for slice_index in range(1, slices):
        for bin_index in range(bins):
            table[slice_index][bin_index] = max(table[slice_index][bin_index], table[slice_index - 1][bin_index])
    for slice_index in range(slices):
        row = table[slice_index]
        table[slice_index] = [
            max(row[i], (row[i - 1] + 2 * row[i] + row[(i + 1) % bins]) / 4) for i in range(bins)
        ]
    for vert, t, angle, radial in chosen:
        if radial.length < 1e-9:
            continue
        position = (t - t0) / (t1 - t0) * slices - 0.5
        lower = max(0, min(slices - 1, math.floor(position)))
        upper = max(0, min(slices - 1, lower + 1))
        mix_t = min(1.0, max(0.0, position - lower))
        angular = (angle + math.pi) / (2 * math.pi) * bins - 0.5
        left = math.floor(angular) % bins
        right = (left + 1) % bins
        mix_a = angular - math.floor(angular)

        def at(row):
            return table[row][left] * (1 - mix_a) + table[row][right] * mix_a

        target = at(lower) * (1 - mix_t) + at(upper) * mix_t
        if target <= radial.length:
            continue
        weight = 1.0
        if inward is not None:
            facing = radial.normalized().dot(inward)
            weight = 1.0 - (1.0 - spec.get("inner", 1.0)) * max(0.0, facing)
        vert.co += radial.normalized() * (target - radial.length) * weight


def layer_over(bm, trees, clearance, reach):
    # Capas: una prenda de arriba queda por fuera de las de abajo donde se
    # superponen (la camiseta sobre la cintura del short). Solo cuenta el
    # punto más cercano dentro de una cara (no en el borde de la otra prenda).
    for vert in bm.verts:
        for tree in trees:
            location, normal, _, _ = tree.find_nearest(vert.co, reach)
            if location is None:
                continue
            gap = vert.co - location
            distance = gap.dot(normal)
            if gap.length > 1e-9 and abs(distance) < gap.length * 0.9:
                continue
            if distance < clearance:
                vert.co = vert.co + normal * (clearance - distance)


def surface_tree(obj):
    # BVH en mundo de una prenda ya terminada.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def add_stripes(body, bm, spec):
    # Franjas del puño: se corta la malla en el borde de cada franja (cortes
    # limpios, sin borrar nada) y las caras de adentro pasan al material 1.
    start, end = body.axis(spec["from"], spec["to"])
    direction = (end - start).normalized()
    for band in spec["bands"]:
        for t in band:
            geom = [vert for vert in bm.verts if on_side(body, spec["from"], vert.co)]
            faces = {face for vert in geom for face in vert.link_faces}
            edges = {edge for vert in geom for edge in vert.link_edges}
            bmesh.ops.bisect_plane(
                bm, geom=list(geom) + list(edges) + list(faces), dist=1e-7, plane_co=start + (end - start) * t, plane_no=direction
            )
    for face in bm.faces:
        center = face.calc_center_median()
        if not on_side(body, spec["from"], center):
            continue
        t = axis_param(center, start, end)
        if any(low < t < high for low, high in spec["bands"]):
            face.material_index = 1


def smooth(bm, iterations, factor=0.5):
    for _ in range(iterations):
        bmesh.ops.smooth_laplacian_vert(
            bm,
            verts=bm.verts,
            lambda_factor=factor,
            lambda_border=0.0,
            use_x=True,
            use_y=True,
            use_z=True,
            preserve_volume=True,
        )


def remove_small_parts(bm, keep_ratio=0.02):
    # Quita restos sueltos del remallado (islas muy chicas).
    bm.verts.ensure_lookup_table()
    seen = set()
    islands = []
    for vert in bm.verts:
        if vert.index in seen:
            continue
        stack = [vert]
        seen.add(vert.index)
        island = []
        while stack:
            current = stack.pop()
            island.append(current)
            for edge in current.link_edges:
                other = edge.other_vert(current)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        islands.append(island)
    if len(islands) < 2:
        return
    largest = max(len(island) for island in islands)
    doomed = [vert for island in islands if len(island) < largest * keep_ratio for vert in island]
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context="VERTS")


# ---------- Pesos ----------


def transfer_weights(body, obj, bones, iterations):
    # Pesos del punto más cercano del cuerpo (solo piezas de la prenda),
    # interpolados en el triángulo, luego suavizados sobre la malla de la tela.
    tree, verts, weights, triangles = body.weight_tree(bones)
    mesh = obj.data
    world = obj.matrix_world
    result = []
    for vertex in mesh.vertices:
        location, _, index, _ = tree.find_nearest(world @ vertex.co)
        triangle = triangles[index]
        factors = poly_3d_calc([verts[i] for i in triangle], location)
        mix = {}
        for corner, factor in zip(triangle, factors):
            for bone, weight in weights[corner].items():
                mix[bone] = mix.get(bone, 0) + weight * factor
        result.append(mix)

    neighbours = [[] for _ in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        neighbours[a].append(b)
        neighbours[b].append(a)
    for _ in range(iterations):
        smoothed = []
        for index, mix in enumerate(result):
            around = neighbours[index]
            if not around:
                smoothed.append(mix)
                continue
            average = {}
            for other in around:
                for bone, weight in result[other].items():
                    average[bone] = average.get(bone, 0) + weight / len(around)
            blended = {bone: 0.5 * weight for bone, weight in mix.items()}
            for bone, weight in average.items():
                blended[bone] = blended.get(bone, 0) + 0.5 * weight
            smoothed.append(blended)
        result = smoothed

    assign_weights(body, obj, result)


def assign_weights(body, obj, per_vertex):
    # Hasta 4 huesos por vértice (glTF), normalizados.
    obj.vertex_groups.clear()
    groups = {}
    for index, mix in enumerate(per_vertex):
        top = sorted(mix.items(), key=lambda item: -item[1])[:4]
        top = [(bone, weight) for bone, weight in top if weight > 0.01]
        total = sum(weight for _, weight in top) or 1
        for bone, weight in top:
            if bone not in groups:
                groups[bone] = obj.vertex_groups.new(name=body.full_names[bone])
            groups[bone].add([index], weight / total, "REPLACE")


# ---------- Prendas ----------


def fabric_material(name):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = (0.9, 0.9, 0.9, 1)
        shader.inputs["Roughness"].default_value = 0.85
        shader.inputs["Metallic"].default_value = 0
    return material


def finish_rigid(body, name, bm, materials):
    # Accesorio rígido: malla sin esqueleto, hija del hueso de la cabeza. La
    # malla queda en coordenadas de mundo y el objeto en la identidad; Blender
    # calcula el desfase respecto del hueso y el GLB lo guarda como nodo hijo.
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for material in materials:
        mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj.parent = body.armature
    obj.parent_type = "BONE"
    obj.parent_bone = body.full_names["Head"]
    bpy.context.view_layer.update()
    obj.matrix_world = Matrix.Identity(4)
    return obj


def finish_object(body, name, bm, materials):
    # Objeto final: copia del cuerpo (mismo padre, transformación y
    # modificador de esqueleto) con la malla nueva en sus coordenadas locales.
    bm.transform(body.surface.matrix_world.inverted())
    obj = body.surface.copy()
    obj.data = bpy.data.meshes.new(name)
    # Primero las ranuras: sin ellas, to_mesh recorta los índices de material.
    for material in materials:
        obj.data.materials.append(material)
    bm.to_mesh(obj.data)
    obj.name = name
    obj.data.name = name
    obj.vertex_groups.clear()
    bpy.context.scene.collection.objects.link(obj)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def build_garment(body, key, spec, settings, material, under=(), stripe=None):
    bm = body.region(spec["bones"])
    for vert in bm.verts:
        vert.co += vert.normal * body.m(spec["offset"])
    obj = mesh_object(f"tmp-{key}", bm)
    bm.free()
    # Ranuras de material desde el principio: al aplicar modificadores,
    # Blender recorta los índices de material a las ranuras que existen (las
    # franjas de las medias usan la segunda).
    obj.data.materials.append(material)
    if spec.get("stripes") and stripe:
        obj.data.materials.append(stripe)
    # Unión continua de las piezas infladas.
    apply_modifier(obj, "REMESH", mode="VOXEL", voxel_size=body.m(settings["voxelMeters"]), adaptivity=0)
    # Suavizado fuerte sobre la malla densa y cerrada: borra los relieves de
    # los músculos y las juntas del maniquí (la tela no los sigue). Encoge la
    # malla; la holgura mínima (push_out) la devuelve sobre los relieves.
    apply_modifier(obj, "SMOOTH", factor=1.0, iterations=spec.get("smoothIterations", settings["smoothIterations"]))
    bm = object_bmesh(obj)
    remove_small_parts(bm)
    for spec_cut in spec["cuts"]:
        cut(body, bm, spec_cut)
    for hole in spec.get("holes", []):
        open_hole(body, bm, hole)
    remove_small_parts(bm)
    write_bmesh(obj, bm)
    bm.free()

    current = triangle_count(obj)
    if current > spec["triangles"]:
        apply_modifier(obj, "DECIMATE", decimate_type="COLLAPSE", ratio=spec["triangles"] / current)
    bm = object_bmesh(obj)
    for spec_drape in spec.get("drape", []):
        drape(body, bm, spec_drape)
    for spec_taper in spec.get("taper", []):
        taper(body, bm, spec_taper)
    push_out(body, bm, body.m(settings["clearance"]))
    if under:
        layer_over(bm, under, body.m(settings["layerGap"]), body.m(0.05))
    for spec_stripes in spec.get("stripes", []):
        add_stripes(body, bm, spec_stripes)
    bm.normal_update()
    write_bmesh(obj, bm)
    bm.free()

    # Canto del dobladillo: solo el borde, hacia adentro (la cara de atrás de
    # la tela se dibuja con doble cara en la web).
    apply_modifier(
        obj, "SOLIDIFY", thickness=body.m(settings["hem"]), offset=-1.0, use_rim=True, use_rim_only=True, use_even_offset=True
    )
    bm = object_bmesh(obj)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    materials = [material, stripe] if spec.get("stripes") and stripe else [material]
    final = finish_object(body, spec["node"], bm, materials)
    bm.free()
    bpy.data.objects.remove(obj)
    transfer_weights(body, final, spec["bones"], settings["weightSmoothIterations"])
    log(f"{key}: {triangle_count(final)} triángulos, {len(final.data.vertices)} vértices")
    return final


# ---------- Cabeza: gorra y lentes ----------


class Head:
    """Medidas de la cabeza del Y Bot (pieza con hueso dominante Head)."""

    def __init__(self, body):
        verts, triangles = [], []
        for piece in body.pieces[:1]:
            mapping = {}
            for face in piece["faces"]:
                if piece["island_bone"].get(piece["island"][face[0]]) != "Head":
                    continue
                for index in face:
                    if index not in mapping:
                        mapping[index] = len(verts)
                        verts.append(piece["verts"][index][0])
                ids = [mapping[i] for i in face]
                for k in range(1, len(ids) - 1):
                    triangles.append((ids[0], ids[k], ids[k + 1]))
        if not verts:
            raise SystemExit("No se encontró la pieza de la cabeza.")
        self.tree = BVHTree.FromPolygons(verts, triangles)
        self.body = body
        self.bottom = min(v.z for v in verts)
        self.top = max(v.z for v in verts)
        xs = [v.dot(body.side) for v in verts]
        ys = [v.dot(body.forward) for v in verts]
        self.center = Vector((0, 0, 0))
        for v in verts:
            self.center += v
        self.center /= len(verts)
        # Centro horizontal en la mitad de la caja (más estable que el promedio).
        mid_side = (min(xs) + max(xs)) / 2
        mid_forward = (min(ys) + max(ys)) / 2
        self.center = body.side * mid_side + body.forward * mid_forward + Vector((0, 0, (self.bottom + self.top) / 2))

    def surface(self, origin, direction):
        # Punto de la cabeza visto desde afuera, en la dirección dada.
        hit = self.tree.ray_cast(origin - direction * 1.0, direction, 2.0)
        return hit[0]

    def frame(self, height):
        # Base local: origen en el eje de la cabeza a la altura dada.
        center = self.center.copy()
        center.z = height
        return center


def build_cap(body, head, spec, material):
    side, forward, up = body.side, body.forward, body.up
    eye = head.bottom + (head.top - head.bottom) * 0.5
    front_z = eye + body.m(spec["frontRise"])
    back_z = eye + body.m(spec["backDrop"])
    offset = body.m(spec["offset"])

    # Cúpula: esfera proyectada sobre la cabeza desde su centro, inflada.
    center = head.center.copy()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=16, radius=body.m(0.2))
    bm.verts.ensure_lookup_table()
    for vert in bm.verts:
        direction = vert.co.normalized()
        origin = center + direction * body.m(0.4)
        hit = head.tree.ray_cast(origin, -direction, body.m(0.5))
        distance = (hit[0] - center).length if hit[0] else body.m(0.09)
        vert.co = center + direction * (distance + offset)
    smooth(bm, 4, 0.4)

    # Borde inclinado: más alto adelante (sobre la frente), más bajo atrás.
    front_point = center + forward * body.m(0.1)
    front_point.z = front_z
    back_point = center - forward * body.m(0.1)
    back_point.z = back_z
    slope = (front_point - back_point).normalized()
    normal = slope.cross(side).normalized()
    if normal.z < 0:
        normal = -normal
    bmesh.ops.bisect_plane(
        bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-7, plane_co=back_point, plane_no=normal, clear_inner=True
    )

    # Botón de la coronilla.
    top = max(bm.verts, key=lambda vert: vert.co.z).co.copy()
    button = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=4, radius=body.m(0.007))
    for vert in button["verts"]:
        vert.co = Vector((vert.co.x, vert.co.y, vert.co.z * 0.5)) + top

    # Visera: media luna al frente del borde, con caída hacia los costados.
    rim = [vert for vert in bm.verts if vert.is_boundary]
    hem_points = []
    for vert in rim:
        relative = vert.co - center
        angle = math.atan2(relative.dot(side), relative.dot(forward))
        hem_points.append((angle, vert.co.copy()))
    hem_points.sort()
    limit = math.radians(spec.get("brimDegrees", 62))
    steps = 16
    length = body.m(spec["brimLength"])
    droop = body.m(spec["brimDroop"])
    rows = []
    for step in range(steps + 1):
        angle = -limit + 2 * limit * step / steps
        # Punto del borde más cercano a ese ángulo (interpolado).
        before = max((p for p in hem_points if p[0] <= angle), default=hem_points[0], key=lambda p: p[0])
        after = min((p for p in hem_points if p[0] >= angle), default=hem_points[-1], key=lambda p: p[0])
        span = after[0] - before[0]
        mix = 0 if span <= 1e-9 else (angle - before[0]) / span
        inner = before[1].lerp(after[1], mix)
        outward = (forward * math.cos(angle) + side * math.sin(angle)).normalized()
        reach = length * max(0.0, 1 - (angle / limit) ** 2) ** 0.6
        row = []
        for ring in range(4):
            fraction = ring / 3
            point = inner + outward * (reach * fraction - body.m(0.004))
            # Curva: cae más en los costados y en la punta.
            point.z -= droop * (fraction ** 1.5) * (0.4 + 0.6 * abs(angle) / limit)
            row.append(bm.verts.new(point))
        rows.append(row)
    brim_faces = []
    for step in range(steps):
        for ring in range(3):
            quad = [rows[step][ring], rows[step + 1][ring], rows[step + 1][ring + 1], rows[step][ring + 1]]
            brim_faces.append(bm.faces.new(quad))
    bm.normal_update()
    # La visera mira hacia arriba.
    for face in brim_faces:
        if face.normal.z < 0:
            face.normal_flip()

    obj = mesh_object("tmp-cap", bm)
    bm.free()
    # Grosor de cúpula y visera (la cúpula solo en el borde).
    apply_modifier(obj, "SOLIDIFY", thickness=body.m(spec["thickness"]), offset=-1.0, use_rim=True, use_even_offset=True)
    bm = object_bmesh(obj)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    final = finish_rigid(body, spec["node"], bm, [material])
    bm.free()
    bpy.data.objects.remove(obj)
    log(f"cap: {triangle_count(final)} triángulos")
    return final, eye


def tube(bm, path, radius, sides, closed, up_hint):
    # Tubo a lo largo de un camino (lista de puntos). Devuelve las caras.
    rings = []
    count = len(path)
    for index, point in enumerate(path):
        if closed:
            tangent = (path[(index + 1) % count] - path[index - 1]).normalized()
        else:
            tangent = (path[min(index + 1, count - 1)] - path[max(index - 1, 0)]).normalized()
        normal = up_hint.cross(tangent)
        if normal.length < 1e-6:
            normal = Vector((1, 0, 0)).cross(tangent)
        normal.normalize()
        binormal = tangent.cross(normal).normalized()
        ring = []
        for side_index in range(sides):
            angle = 2 * math.pi * side_index / sides
            ring.append(bm.verts.new(point + (normal * math.cos(angle) + binormal * math.sin(angle)) * radius))
        rings.append(ring)
    faces = []
    segments = count if closed else count - 1
    for index in range(segments):
        a, b = rings[index], rings[(index + 1) % count]
        for side_index in range(sides):
            n = (side_index + 1) % sides
            faces.append(bm.faces.new([a[side_index], b[side_index], b[n], a[n]]))
    if not closed:
        for ring, flip in ((rings[0], True), (rings[-1], False)):
            face = bm.faces.new(ring)
            if flip:
                face.normal_flip()
            faces.append(face)
    return faces


def rounded_rect(width, height, radius, segments=4):
    # Contorno de rectángulo redondeado en el plano (x, z), sentido antihorario.
    points = []
    corners = [
        (width / 2 - radius, height / 2 - radius, 0),
        (-width / 2 + radius, height / 2 - radius, 90),
        (-width / 2 + radius, -height / 2 + radius, 180),
        (width / 2 - radius, -height / 2 + radius, 270),
    ]
    for cx, cz, start in corners:
        for step in range(segments + 1):
            angle = math.radians(start + 90 * step / segments)
            points.append((cx + radius * math.cos(angle), cz + radius * math.sin(angle)))
    return points


def build_glasses(body, head, spec, eye, frame_material, lens_material):
    side, forward, up = body.side, body.forward, body.up
    m = body.m
    bm = bmesh.new()
    frame_faces, lens_faces = [], []
    half = m(spec["bridge"]) / 2 + m(spec["lensWidth"]) / 2
    outline = rounded_rect(m(spec["lensWidth"]), m(spec["lensHeight"]), m(spec["lensCorner"]))
    hinges = {}
    for sign in (-1, 1):
        # Centro de la lente: delante de la cara, a la altura de los ojos.
        probe = head.frame(eye) + side * (sign * half)
        hit = head.surface(probe + forward * m(0.3), -forward)
        depth = (hit - head.frame(eye)).dot(forward) if hit else m(0.1)
        center = head.frame(eye) + side * (sign * half) + forward * (depth + m(spec["standoff"]))
        # Envolvente: cada lente gira hacia atrás por su lado de afuera.
        wrap = Matrix.Rotation(math.radians(spec["wrapDegrees"]) * sign, 3, up)
        lens_side = wrap @ side
        lens_forward = wrap @ forward
        path = [center + lens_side * x + up * z for x, z in outline]
        frame_faces += tube(bm, path, m(spec["frameRadius"]), 5, True, lens_forward)
        # Lente: abanico apenas detrás del marco.
        inner = [center + lens_side * (x * 0.96) + up * (z * 0.94) - lens_forward * m(0.001) for x, z in outline]
        middle = bm.verts.new(center - lens_forward * m(0.001))
        ring = [bm.verts.new(point) for point in inner]
        for index in range(len(ring)):
            face = bm.faces.new([middle, ring[index], ring[(index + 1) % len(ring)]])
            lens_faces.append(face)
        hinges[sign] = center + lens_side * (sign * m(spec["lensWidth"]) / 2) + up * m(spec["lensHeight"]) * 0.3
    # Puente: arco entre las dos lentes.
    left_inner = head.frame(eye) + side * (-m(spec["bridge"]) / 2 - m(0.002))
    right_inner = head.frame(eye) + side * (m(spec["bridge"]) / 2 + m(0.002))
    bridge_depth = (hinges[1] - head.frame(eye)).dot(forward) + m(0.004)
    bridge = []
    for step in range(7):
        fraction = step / 6
        point = left_inner.lerp(right_inner, fraction) + forward * bridge_depth
        point += up * (m(spec["lensHeight"]) * 0.25 + m(0.004) * math.sin(math.pi * fraction))
        bridge.append(point)
    frame_faces += tube(bm, bridge, m(spec["frameRadius"]) * 0.8, 6, False, forward)
    # Patillas: desde la bisagra hacia atrás, por fuera de la cabeza.
    for sign in (-1, 1):
        hinge = hinges[sign]
        width = None
        for height in (eye, eye + m(0.01)):
            hit = head.surface(head.frame(height) + side * (sign * m(0.3)), -side * sign)
            if hit:
                distance = abs((hit - head.frame(height)).dot(side))
                width = distance if width is None else max(width, distance)
        width = (width or m(0.08)) + m(0.005)
        path = [hinge]
        for fraction in (0.25, 0.5, 0.75, 1.0):
            point = head.frame(eye) + side * (sign * width)
            point += forward * ((hinge - head.frame(eye)).dot(forward) * (1 - fraction) - m(0.035) * fraction)
            point += up * (m(spec["lensHeight"]) * 0.3 * (1 - fraction) - m(0.012) * fraction ** 3)
            path.append(point)
        frame_faces += tube(bm, path, m(spec["frameRadius"]) * 0.75, 5, False, up)
    for face in lens_faces:
        face.material_index = 1
    bm.normal_update()
    bmesh.ops.triangulate(bm, faces=bm.faces)
    final = finish_rigid(body, spec["node"], bm, [frame_material, lens_material])
    bm.free()
    log(f"glasses: {triangle_count(final)} triángulos")
    return final


# ---------- Vista previa (opcional) ----------


def render_previews(body, garments, folder):
    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "OBJECT"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    scene.render.film_transparent = False
    for obj in body.meshes:
        obj.color = (0.55, 0.55, 0.58, 1)
    palette = {
        "Outfit_Shirt": (0.95, 0.95, 0.95, 1),
        "Outfit_Tank": (0.9, 0.3, 0.2, 1),
        "Outfit_Shorts": (0.2, 0.35, 0.85, 1),
        "Outfit_Pants": (0.3, 0.35, 0.2, 1),
        "Outfit_Cap": (0.85, 0.2, 0.2, 1),
        "Outfit_Glasses": (0.05, 0.05, 0.05, 1),
        "Outfit_Socks": (0.97, 0.97, 0.97, 1),
    }
    for obj in garments:
        obj.color = palette.get(obj.name, (1, 1, 1, 1))
    camera_data = bpy.data.cameras.new("preview")
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new("preview", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    looks = {
        "front": (body.forward, 1.0),
        "side": (body.side, 1.0),
        "back": (-body.forward, 1.0),
        "three-quarter": ((body.forward + body.side).normalized(), 1.0),
    }
    sets = {
        "shirt-shorts": ["Outfit_Shirt", "Outfit_Shorts", "Outfit_Cap", "Outfit_Glasses", "Outfit_Socks"],
        "tank-pants": ["Outfit_Tank", "Outfit_Pants", "Outfit_Socks"],
        "none": [],
    }
    target = Vector((0, 0, body.floor + body.m(0.95)))
    for set_name, visible in sets.items():
        for obj in garments:
            obj.hide_render = obj.name not in visible
        for look, (direction, _) in looks.items():
            camera_data.ortho_scale = body.m(2.0)
            camera.location = target + direction * body.m(4)
            camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = os.path.join(folder, f"{set_name}-{look}.png")
            bpy.ops.render.render(write_still=True)
    # Primer plano de la cabeza.
    for obj in garments:
        obj.hide_render = obj.name not in ("Outfit_Cap", "Outfit_Glasses", "Outfit_Shirt")
    head_target = Vector((0, 0, body.heads["Head"].z + body.m(0.08)))
    for look, (direction, _) in looks.items():
        camera_data.ortho_scale = body.m(0.42)
        camera.location = head_target + direction * body.m(3)
        camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(folder, f"head-{look}.png")
        bpy.ops.render.render(write_still=True)


# ---------- Ejecución ----------


def main():
    options = parse_args(sys.argv)
    with open(options["config"], encoding="utf-8") as file:
        config = json.load(file)
    settings = config["outfit"]

    import_fbx(options["character"])
    body = Body(config["heightMeters"])
    log(f"escala: {body.unit:.4f} unidades por metro del avatar")

    fabric = fabric_material("outfit-fabric")
    frame = fabric_material("outfit-frame")
    lens = fabric_material("outfit-lens")
    # En el orden de la configuración: cada prenda se apoya por fuera de las
    # que nombra en "over", que ya están hechas.
    stripe = fabric_material("outfit-stripe")
    built = {}
    for key, spec in settings["garments"].items():
        missing = [name for name in spec.get("over", []) if name not in built]
        if missing:
            raise SystemExit(f"{key}: {', '.join(missing)} debe ir antes en la configuración.")
        under = [surface_tree(built[name]) for name in spec.get("over", [])]
        built[key] = build_garment(body, key, spec, settings, fabric, under, stripe)
    garments = [built[key] for key in settings["garments"]]
    head = Head(body)
    cap, eye = build_cap(body, head, settings["cap"], fabric)
    garments.append(cap)
    garments.append(build_glasses(body, head, settings["glasses"], eye, frame, lens))

    if options.get("preview"):
        render_previews(body, garments, options["preview"])

    # Exporta el esqueleto y las prendas (sin el cuerpo).
    for obj in bpy.context.scene.objects:
        obj.select_set(obj is body.armature or obj in garments)
    bpy.context.view_layer.objects.active = body.armature
    bpy.ops.export_scene.gltf(**export_options(options["out"], animations=False, selection=True))
    log(f"exportado {options['out']}")


main()
