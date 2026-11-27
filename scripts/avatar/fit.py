# Ajusta prendas del catálogo al maniquí del Hangar 360° (Y Bot de Mixamo).
# Lo ejecuta scripts/avatar/fit.mjs (pnpm avatar:fit); no hace falta llamarlo a mano.
#
# Uso:
#   blender --background --factory-startup --python-exit-code 1 \
#     --python scripts/avatar/fit.py -- \
#     --character ybot.fbx --config fit-config.json --out-dir carpeta \
#     [--preview carpeta]
#
# Prendas con esqueleto (sudaderas, pantalones):
#   1. Se importa el GLB optimizado del producto (pose canónica: metros, frente
#      a +Z, borde inferior en y = 0) y se descarta cualquier esqueleto que
#      traiga (el anorak viene de un rig de MetaHuman).
#   2. Se coloca sobre el cuerpo con la escala y la posición de fit.json.
#   3. Los modelos de Sketchfab vienen en pose A (brazos abajo). Se pone el
#      maniquí en esa misma pose, se copian a la prenda los pesos del cuerpo
#      así posado y se deshace la pose (skinning inverso): la prenda queda en
#      la T-pose del Y Bot sin deformarse a mano.
#   4. Ajuste suave: los vértices demasiado cerca (o dentro) del cuerpo salen
#      a la holgura mínima y los que flotan se acercan un poco; el
#      desplazamiento se suaviza sobre la malla para que no queden pliegues.
#   5. Capas: los pantalones quedan por dentro de la camiseta base y por fuera
#      de los calcetines; las sudaderas, por fuera de toda parte de abajo.
#   6. Pesos del cuerpo en reposo (punto más cercano, interpolado en el
#      triángulo, solo huesos de la prenda), suavizados, 4 por vértice y
#      normalizados. Es lo mismo que hace el modificador Data Transfer con
#      "Nearest Face Interpolated", pero limitado a las piezas de la prenda.
# Accesorios rígidos (gorra, lentes): se colocan respecto de la cabeza, se
# separan de ella si la tocan y quedan como hijos del hueso mixamorig:Head.
#
# Cada prenda sale en su propio GLB con el esqueleto (solo huesos: ninguna
# malla del Y Bot) y la prenda. fit.mjs aplica la pose y la escala del avatar,
# comprime y escribe las variantes. También se escribe fit-report.json con las
# reglas para ocultar el cuerpo bajo cada prenda.

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fbx_to_glb import export_options, import_fbx  # noqa: E402
from outfit import (  # noqa: E402
    Body,
    Head,
    axis_param,
    base_name,
    build_garment,
    cut,
    fabric_material,
    on_side,
    surface_tree,
    transfer_weights,
)


def parse_args(argv):
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    options = {}
    for index in range(0, len(args), 2):
        if index + 1 >= len(args):
            raise SystemExit(f"Falta el valor de {args[index]}")
        options[args[index].lstrip("-")] = args[index + 1]
    for required in ("character", "config", "out-dir"):
        if required not in options:
            raise SystemExit(f"Falta --{required}")
    return options


def log(message):
    print(f"[fit] {message}", flush=True)


# ---------- Espacio del avatar ----------


def avatar_point(body, point):
    # Punto en metros del avatar (x: izquierda del personaje, y: arriba,
    # z: adelante; origen en el piso bajo la cadera) -> mundo de Blender.
    hips = body.heads["Hips"]
    base = Vector((hips.x, hips.y, body.floor))
    return base + body.side * body.m(point[0]) + body.up * body.m(point[1]) + body.forward * body.m(point[2])


def to_avatar(body, co):
    # Mundo de Blender -> metros del avatar (para el reporte).
    hips = body.heads["Hips"]
    relative = co - Vector((hips.x, hips.y, body.floor))
    return [round(relative.dot(body.side) / body.unit, 4), round(relative.dot(body.up) / body.unit, 4), round(relative.dot(body.forward) / body.unit, 4)]


# ---------- Importar la prenda ----------


def import_garment(path, name):
    # Importa el GLB, quita esqueletos y pesos horneados (el anorak trae un rig
    # de MetaHuman) y deja una sola malla con su transformación aplicada.
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path, merge_vertices=True)
    new = [obj for obj in bpy.data.objects if obj not in before]
    meshes = [obj for obj in new if obj.type == "MESH"]
    if not meshes:
        raise SystemExit(f"{path}: no trae mallas.")
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    parts = []
    for obj in meshes:
        # Malla tal como se ve (con la pose del esqueleto, si lo hay), en mundo.
        if obj.modifiers:
            mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), preserve_all_data_layers=True)
        else:
            mesh = obj.data.copy()
        mesh.transform(obj.matrix_world)
        part = bpy.data.objects.new(f"{name}-part", mesh)
        bpy.context.scene.collection.objects.link(part)
        parts.append(part)
    for obj in new:
        bpy.data.objects.remove(obj, do_unlink=True)
    if len(parts) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for part in parts:
            part.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.join()
    obj = parts[0]
    obj.name = name
    obj.data.name = name
    obj.vertex_groups.clear()
    obj.modifiers.clear()
    return obj


def place(body, obj, spec):
    # Metros de la prenda -> metros del avatar: escala, giro (cabeceo y
    # guiñada, en grados) y posición del origen canónico (centro del borde
    # inferior) en el espacio del avatar.
    scale = spec.get("scale", 1.0)
    pitch, yaw = spec.get("rotation", [0, 0])
    rotation = Matrix.Rotation(math.radians(yaw), 4, body.up) @ Matrix.Rotation(math.radians(pitch), 4, body.side)
    origin = avatar_point(body, spec["position"])
    # La prenda viene con el frente en -Y de Blender (+Z de glTF), como el avatar.
    matrix = Matrix.Translation(origin) @ rotation @ Matrix.Scale(body.m(scale), 4)
    stretch = spec.get("stretch")
    if stretch:
        # Estirado por eje (x, y, z del avatar) para proporciones distintas.
        matrix = matrix @ Matrix.Diagonal((stretch[0], stretch[2], stretch[1], 1.0))
    obj.data.transform(matrix)
    obj.data.update()


# ---------- Pose del maniquí ----------


def pose_body(body, pose):
    # Pone el maniquí en la pose de la prenda. pose: arms.down / arms.forward,
    # forearms.down / forearms.forward y legs.spread, en grados (el lado
    # derecho es el espejo del izquierdo). Giros en mundo alrededor de la
    # cabeza de cada hueso, de padre a hijo.
    armature = body.armature
    rotations = []
    for group, bone in (("arms", "Arm"), ("forearms", "ForeArm")):
        spec = pose.get(group, {})
        down = math.radians(spec.get("down", 0))
        forward = math.radians(spec.get("forward", 0))
        for side, sign in (("Left", 1), ("Right", -1)):
            rotation = Matrix.Rotation(-forward * sign, 4, body.up) @ Matrix.Rotation(down * sign, 4, -body.forward)
            rotations.append((f"{side}{bone}", rotation))
    legs = pose.get("legs", {})
    spread = math.radians(legs.get("spread", 0))
    for side, sign in (("Left", 1), ("Right", -1)):
        rotations.append((f"{side}UpLeg", Matrix.Rotation(-spread * sign, 4, -body.forward)))

    for name, rotation in rotations:
        bone = armature.pose.bones[body.full_names[name]]
        world = armature.matrix_world @ bone.matrix
        head = world.translation.copy()
        moved = Matrix.Translation(head) @ rotation @ Matrix.Translation(-head) @ world
        bone.matrix = armature.matrix_world.inverted() @ moved
        bpy.context.view_layer.update()


def reset_pose(body):
    for bone in body.armature.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def bone_deltas(body):
    # Matriz de cada hueso (pose actual por la inversa del reposo), en mundo.
    armature = body.armature
    deltas = {}
    for bone in armature.pose.bones:
        rest = armature.matrix_world @ bone.bone.matrix_local
        posed = armature.matrix_world @ bone.matrix
        deltas[base_name(bone.name)] = posed @ rest.inverted()
    return deltas


def posed_coordinates(body):
    # Vértices del cuerpo con la pose actual (mismo orden que las piezas).
    depsgraph = bpy.context.evaluated_depsgraph_get()
    coordinates = []
    for obj in body.meshes:
        evaluated = obj.evaluated_get(depsgraph)
        coordinates.append([obj.matrix_world @ vertex.co for vertex in evaluated.data.vertices])
    return coordinates


def weight_tree(body, bones, coordinates=None):
    # Como Body.weight_tree, con las posiciones posadas si se pasan.
    bones = set(bones)
    verts, weights, triangles = [], [], []
    for mesh_index, piece in enumerate(body.pieces):
        mapping = {}
        for face in piece["faces"]:
            if piece["island_bone"].get(piece["island"][face[0]]) not in bones:
                continue
            for index in face:
                if index not in mapping:
                    mapping[index] = len(verts)
                    co = coordinates[mesh_index][index] if coordinates else piece["verts"][index][0]
                    verts.append(co)
                    weights.append(piece["verts"][index][1])
            ids = [mapping[i] for i in face]
            for k in range(1, len(ids) - 1):
                triangles.append((ids[0], ids[k], ids[k + 1]))
    return BVHTree.FromPolygons(verts, triangles), verts, weights, triangles


def sample_weights(tree, verts, weights, triangles, point):
    location, _, index, _ = tree.find_nearest(point)
    triangle = triangles[index]
    factors = poly_3d_calc([verts[i] for i in triangle], location)
    mix = {}
    for corner, factor in zip(triangle, factors):
        for bone, weight in weights[corner].items():
            mix[bone] = mix.get(bone, 0) + weight * factor
    total = sum(mix.values()) or 1
    return {bone: weight / total for bone, weight in mix.items()}


def unpose(body, obj, pose, bones):
    # Pone el cuerpo en la pose de la prenda, toma los pesos del cuerpo posado
    # y deshace la pose con el skinning inverso: v_reposo = (suma w * M)^-1 v.
    if not pose:
        return
    pose_body(body, pose)
    deltas = bone_deltas(body)
    tree, verts, weights, triangles = weight_tree(body, bones, posed_coordinates(body))
    mesh = obj.data
    for vertex in mesh.vertices:
        mix = sample_weights(tree, verts, weights, triangles, vertex.co)
        blended = Matrix(((0, 0, 0, 0), (0, 0, 0, 0), (0, 0, 0, 0), (0, 0, 0, 0)))
        for bone, weight in mix.items():
            blended += deltas[bone] * weight
        try:
            vertex.co = blended.inverted() @ vertex.co
        except ValueError:
            pass
    mesh.update()
    reset_pose(body)


# ---------- Ajuste al cuerpo ----------


def shorten(body, bm, spec):
    # Acorta una pierna o manga sin cortar el puño: a lo largo del eje
    # from -> to, lo que pasa de `start` se comprime por `factor` (el puño
    # conserva su forma y queda más arriba).
    start, end = body.axis(spec["from"], spec["to"])
    direction = (end - start).normalized()
    length = (end - start).length
    for vert in bm.verts:
        if not on_side(body, spec["from"], vert.co):
            continue
        t = axis_param(vert.co, start, end)
        if t <= spec["start"]:
            continue
        shift = (t - spec["start"]) * (1 - spec["factor"])
        vert.co -= direction * (shift * length)


def neighbours_of(bm):
    bm.verts.ensure_lookup_table()
    return [[edge.other_vert(vert).index for edge in vert.link_edges] for vert in bm.verts]


def smooth_field(field, neighbours, iterations):
    for _ in range(iterations):
        out = []
        for index, around in enumerate(neighbours):
            if not around:
                out.append(field[index])
                continue
            average = Vector((0, 0, 0))
            for other in around:
                average += field[other]
            out.append(field[index] * 0.5 + average * (0.5 / len(around)))
        field = out
    return field


def signed_distance(tree, point, reach=None):
    hit = tree.find_nearest(point, reach) if reach else tree.find_nearest(point)
    location, normal = hit[0], hit[1]
    if location is None:
        return None, None, None
    return (point - location).dot(normal), normal, location


def fit_to_body(body, bm, spec):
    # Ajuste suave: holgura mínima (nunca dentro del cuerpo) y, si la tela
    # flota más de maxGap, se acerca una fracción (pull). El desplazamiento se
    # suaviza sobre la malla: la prenda se mueve en bloque, sin pellizcos.
    tree = body.collision_tree()
    clearance = body.m(spec.get("clearance", 0.008))
    max_gap = body.m(spec.get("maxGap", 0.05))
    pull = spec.get("pull", 0.35)
    neighbours = neighbours_of(bm)
    for _ in range(spec.get("iterations", 4)):
        field = []
        for vert in bm.verts:
            distance, normal, _ = signed_distance(tree, vert.co)
            if distance is None:
                field.append(Vector((0, 0, 0)))
            elif distance < clearance:
                field.append(normal * (clearance - distance))
            elif distance > max_gap:
                field.append(-normal * ((distance - max_gap) * pull))
            else:
                field.append(Vector((0, 0, 0)))
        field = smooth_field(field, neighbours, spec.get("smooth", 12))
        for vert, offset in zip(bm.verts, field):
            vert.co += offset
    return push_clear(tree, bm, clearance * 0.75)


def push_clear(tree, bm, clearance, reach=None):
    # Restricción final, sin suavizado: nada queda a menos de `clearance`.
    moved = 0
    for vert in bm.verts:
        distance, normal, _ = signed_distance(tree, vert.co, reach)
        if distance is not None and distance < clearance:
            vert.co += normal * (clearance - distance)
            moved += 1
    return moved


def layer_targets(body_tree, bm, trees, reach):
    # Distancia al cuerpo de la capa vecina más cercana, por vértice (None si
    # no hay capa a menos de `reach`). Se mide sobre la normal del cuerpo, que
    # es suave y siempre apunta afuera: así las capas no se cruzan aunque la
    # otra prenda tenga caras en cualquier dirección.
    targets = []
    for vert in bm.verts:
        best = None
        for tree in trees:
            location = tree.find_nearest(vert.co, reach)[0]
            if location is None:
                continue
            distance = signed_distance(body_tree, location)[0]
            if distance is not None and (best is None or distance > best):
                best = distance
        targets.append(best)
    return targets


def layer_outside(body, bm, trees, gap, reach, neighbours, rounds=3):
    # La prenda queda por fuera de otra (la sudadera sobre la cintura del
    # pantalón): cada vértice queda al menos `gap` más lejos del cuerpo que la
    # capa de abajo. El desplazamiento se suaviza: el ruedo sube en bloque.
    body_tree = body.collision_tree()
    for _ in range(rounds):
        targets = layer_targets(body_tree, bm, trees, reach)
        field = []
        for vert, target in zip(bm.verts, targets):
            distance, normal, _ = signed_distance(body_tree, vert.co)
            if target is None or distance is None or distance >= target + gap:
                field.append(Vector((0, 0, 0)))
            else:
                field.append(normal * (target + gap - distance))
        field = smooth_field(field, neighbours, 4)
        for vert, offset in zip(bm.verts, field):
            vert.co += offset * 1.3


def cover_band(body, bm, trees, gap, bins=72):
    # Banda del ruedo por fuera de los pantalones: por ángulo alrededor del
    # eje vertical de la cadera, el radio de la prenda en la banda (del ruedo
    # a 6 cm arriba, y 3 cm por debajo, donde el pantalón ya se ensancha)
    # debe superar al del pantalón más `gap`. El factor se
    # suaviza entre ángulos y se apaga hacia arriba (hasta 18 cm): la banda
    # se abre de a poco, sin escalones.
    hips = body.heads["Hips"]
    axis = Vector((hips.x, hips.y, 0))
    hem = min(vert.co.z for vert in bm.verts)
    band, fade = body.m(0.06), body.m(0.18)
    bm.normal_update()
    own = BVHTree.FromBMesh(bm)
    far = body.m(1.0)

    def radius(tree, angle, z):
        direction = Vector((math.cos(angle), math.sin(angle), 0))
        origin = Vector((axis.x, axis.y, z)) + direction * far
        hit = tree.ray_cast(origin, -direction, far)
        return (Vector((hit[0].x, hit[0].y, 0)) - axis).length if hit[0] else None

    factors = []
    for b in range(bins):
        angle = 2 * math.pi * b / bins
        need = 1.0
        for step in range(7):
            z = hem - body.m(0.03) + (band + body.m(0.03)) * step / 6
            mine = radius(own, angle, z)
            if not mine:
                continue
            for tree in trees:
                theirs = radius(tree, angle, z)
                if theirs:
                    need = max(need, (theirs + gap) / mine)
        factors.append(need)
    for _ in range(3):
        factors = [max(factors[i], (factors[i - 1] + 2 * factors[i] + factors[(i + 1) % bins]) / 4) for i in range(bins)]
    for vert in bm.verts:
        height = vert.co.z - hem
        if height > band + fade:
            continue
        ramp = 1.0 if height <= band else 1 - (height - band) / fade
        ramp = ramp * ramp * (3 - 2 * ramp)
        radial = Vector((vert.co.x - axis.x, vert.co.y - axis.y, 0))
        angle = math.atan2(radial.y, radial.x) % (2 * math.pi)
        position = angle / (2 * math.pi) * bins
        low = int(position) % bins
        mix = position - int(position)
        factor = factors[low] * (1 - mix) + factors[(low + 1) % bins] * mix
        vert.co += radial * ((factor - 1) * ramp)
    log(f"banda del ruedo: se abre hasta {max(factors):.3f}x para cubrir los pantalones")


def layer_under(body, bm, trees, gap, reach, neighbours, region=None, rounds=3):
    # La prenda queda por dentro de otra (la cintura del pantalón bajo la
    # camiseta base): al menos `gap` más cerca del cuerpo que la capa de
    # arriba, sin bajar de la holgura mínima.
    body_tree = body.collision_tree()
    floor = body.m(0.004)
    for _ in range(rounds):
        targets = layer_targets(body_tree, bm, trees, reach)
        field = []
        for vert, target in zip(bm.verts, targets):
            distance, normal, _ = signed_distance(body_tree, vert.co)
            if target is None or distance is None or (region and not region(vert.co)):
                field.append(Vector((0, 0, 0)))
                continue
            limit = max(floor, target - gap)
            field.append(-normal * (distance - limit) if distance > limit else Vector((0, 0, 0)))
        field = smooth_field(field, neighbours, 4)
        for vert, offset in zip(bm.verts, field):
            vert.co += offset * 1.3


# ---------- Reglas del cuerpo ----------


def measure_rules(body, obj, rules):
    # Completa los cortes sin `t`: el extremo de la prenda sobre el eje del
    # corte (en su lado del cuerpo y cerca del eje). Así el cuerpo que se
    # oculta en la web llega justo hasta el dobladillo de esta prenda.
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    cuts = []
    for spec in rules.get("cuts", []):
        spec = dict(spec)
        if "t" not in spec:
            start, end = body.axis(spec["from"], spec["to"])
            direction = (end - start).normalized()
            radius = body.m(spec.get("radius", 0.25))
            values = []
            for point in points:
                if not on_side(body, spec["from"], point):
                    continue
                relative = point - start
                radial = relative - direction * relative.dot(direction)
                if radial.length <= radius:
                    values.append(axis_param(point, start, end))
            if not values:
                log(f"AVISO {obj.name}: el corte {spec['from']} -> {spec['to']} no toca la prenda.")
                values = [0.0]
            spec["t"] = round(max(values) if spec["keep"] == "below" else min(values), 3)
        spec.pop("radius", None)
        cuts.append(spec)
    return {"bones": rules["bones"], "cuts": cuts, "holes": rules.get("holes", [])}


# ---------- Prendas ----------


def blend_shoulders(body, obj, span):
    # Hombros caídos (sudaderas holgadas): la parte alta de la manga, cerca del
    # hombro, pasa del hueso del brazo al de la clavícula de a poco (de `start`
    # a `end` sobre el eje del brazo). Así, con los brazos abajo, el hombro de
    # la prenda se estira en vez de levantarse en punta sobre el cuerpo.
    start_t, end_t = span
    groups = {group.name: group for group in obj.vertex_groups}
    for side in ("Left", "Right"):
        arm = groups.get(body.full_names[f"{side}Arm"])
        if arm is None:
            continue
        shoulder_name = body.full_names[f"{side}Shoulder"]
        shoulder = groups.get(shoulder_name) or obj.vertex_groups.new(name=shoulder_name)
        start, end = body.axis(f"{side}Arm", f"{side}ForeArm")
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            if not on_side(body, f"{side}Arm", point):
                continue
            t = axis_param(point, start, end)
            if t >= end_t:
                continue
            ramp = max(0.0, min(1.0, (t - start_t) / (end_t - start_t)))
            ramp = ramp * ramp * (3 - 2 * ramp)
            try:
                weight = arm.weight(vertex.index)
            except RuntimeError:
                continue
            moved = weight * (1 - ramp)
            if moved <= 0:
                continue
            arm.add([vertex.index], weight - moved, "REPLACE")
            try:
                current = shoulder.weight(vertex.index)
            except RuntimeError:
                current = 0.0
            shoulder.add([vertex.index], current + moved, "REPLACE")


def finish_skinned(body, obj, name):
    # Malla final: hija del esqueleto, con su modificador, en coordenadas de
    # mundo (Blender calcula las matrices de enlace al exportar).
    obj.name = name
    obj.data.name = name
    obj.parent = body.armature
    obj.matrix_parent_inverse = body.armature.matrix_world.inverted()
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = body.armature
    return obj


def clean_mesh(obj):
    # Normales recalculadas (la prenda cambió de forma) y caras suaves.
    mesh = obj.data
    if mesh.has_custom_normals:
        bpy.context.view_layer.objects.active = obj
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update()


def build_skinned(body, item, layers):
    spec = item["fit"]
    name = item["node"]
    obj = import_garment(item["source"], name)
    place(body, obj, spec)
    unpose(body, obj, spec.get("pose"), item["bones"])

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    # Mallas livianas (el anorak): una subdivisión para que el ajuste siga
    # al cuerpo entre vértices. fit.mjs vuelve a simplificar al final.
    if spec.get("subdivide"):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=spec["subdivide"], use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    for spec_shorten in spec.get("shorten", []):
        shorten(body, bm, spec_shorten)
    for trim in spec.get("trim", []):
        cut(body, bm, trim)
    moved = fit_to_body(body, bm, spec)
    neighbours = neighbours_of(bm)
    gap = body.m(spec.get("layerGap", 0.006))
    reach = body.m(0.06)
    if item["slot"] == "bottom":
        # Cintura por dentro de la camiseta y la musculosa base.
        waist = body.heads["Hips"].z - body.m(0.12)
        layer_under(body, bm, layers["over_bottoms"], gap, reach, neighbours, lambda co: co.z > waist)
        if layers["under_bottoms"]:
            layer_outside(body, bm, layers["under_bottoms"], gap, reach, neighbours)
    elif item["slot"] == "top" and layers["under_tops"]:
        if spec.get("hidesBottoms"):
            # Prendas propias de ruedo ajustado (pnpm garments): no se
            # deforman para pasar por fuera de los pantalones, que son más
            # anchos en la cadera (el ruedo se abría como una campana). En la
            # web, el pantalón no se dibuja por encima del ruedo mientras la
            # prenda está puesta (AvatarCatalog, hidesBottoms en catalog-fit.json).
            # Solo la banda del ruedo se abre lo justo para cubrir la cintura
            # del pantalón (así el corte del pantalón nunca queda a la vista).
            cover_band(body, bm, layers["under_tops"], body.m(spec.get("bandGap", 0.006)))
        else:
            layer_outside(body, bm, layers["under_tops"], gap, reach, neighbours)
    # La holgura con el cuerpo manda sobre las capas.
    push_clear(body.collision_tree(), bm, body.m(spec.get("clearance", 0.008)) * 0.6)
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    clean_mesh(obj)

    transfer_weights(body, obj, item["bones"], spec.get("weightSmooth", 6))
    if spec.get("shoulderBlend"):
        blend_shoulders(body, obj, spec["shoulderBlend"])
    finish_skinned(body, obj, name)
    rules = measure_rules(body, obj, item["rules"])
    if spec.get("hidesBottoms"):
        rules["hidesBottoms"] = True
    log(f"{item['slug']}: {len(obj.data.polygons)} caras, {moved} vértices separados del cuerpo")
    return obj, rules


def seat_on_head(body, head, obj, spec):
    # Gorra: baja (o sube) en vertical hasta que la copa toque la cabeza con
    # la holgura pedida (seat.clearance). Solo cuenta la copa, no la visera
    # (lo que queda por delante de la frente). Después informa la holgura de
    # la banda (el borde inferior de la copa) adelante, atrás y a los lados,
    # para calibrar escala y cabeceo en fit.json.
    clearance = body.m(spec["seat"].get("clearance", 0.003))
    front = head.surface(head.center + body.forward * body.m(0.3), -body.forward)
    reach = (front - head.center).dot(body.forward) if front else body.m(0.11)
    points = [vertex.co.copy() for vertex in obj.data.vertices]
    crown = [p for p in points if (p - head.center).dot(body.forward) < reach * 0.8]
    band = spec["seat"].get("band")
    if band:
        # Solo la banda (lo más bajo de la copa), adelante y a los lados: la
        # gorra baja hasta que la banda abrace la cabeza. La parte alta de la
        # copa y el interior de atrás pueden quedar dentro de la cabeza, que
        # bajo la gorra no se dibuja (reglas del lugar "head").
        bottom = min((p - head.center).dot(body.up) for p in crown)
        crown = [
            p
            for p in crown
            if (p - head.center).dot(body.up) < bottom + body.m(band)
            and (p - head.center).dot(body.forward) > -abs((p - head.center).dot(body.side))
        ]

    def lowest_gap(shift):
        gap = None
        for point in crown:
            distance = signed_distance(head.tree, point + body.up * shift, body.m(0.12))[0]
            if distance is not None and (gap is None or distance < gap):
                gap = distance
        return gap if gap is not None else body.m(0.12)

    target = spec["seat"].get("bandFront")
    if target is not None:
        # Altura fija de la banda adelante (m sobre el centro de la cabeza):
        # la gorra conserva sus proporciones y la copa puede quedar por dentro
        # de la cabeza alta del maniquí (que bajo la gorra no se dibuja).
        front_band = [p for p in crown if (p - head.center).dot(body.forward) > abs((p - head.center).dot(body.side))]
        bottom = min((p - head.center).dot(body.up) for p in front_band)
        shift = body.m(target) - bottom
    else:
        low, high = -body.m(0.1), body.m(0.1)
        for _ in range(24):
            middle = (low + high) / 2
            if lowest_gap(middle) > clearance:
                high = middle
            else:
                low = middle
        shift = high
    contact = min(crown, key=lambda point: signed_distance(head.tree, point + body.up * shift, body.m(0.12))[0] or 1.0)
    log(f"contacto de la gorra en {to_avatar(body, contact + body.up * shift - head.center + avatar_point(body, [0, 0, 0]))}")
    obj.data.transform(Matrix.Translation(body.up * shift))
    obj.data.update()

    # Banda: vértices de la copa a menos de 2 cm del borde inferior, por zona.
    placed = [p + body.up * shift for p in crown]
    edge = {}
    for point in placed:
        relative = point - head.center
        zone = (
            "adelante" if relative.dot(body.forward) > abs(relative.dot(body.side)) else
            "atrás" if -relative.dot(body.forward) > abs(relative.dot(body.side)) else
            "lados"
        )
        height = relative.dot(body.up)
        edge.setdefault(zone, []).append((height, point))
    report = []
    for zone, items in edge.items():
        bottom = min(height for height, _ in items)
        band = [point for height, point in items if height < bottom + body.m(0.02)]
        gaps = [signed_distance(head.tree, point, body.m(0.12))[0] for point in band]
        gaps = [gap for gap in gaps if gap is not None]
        mean = sum(gaps) / len(gaps) / body.unit if gaps else 0
        report.append(f"{zone}: borde {bottom / body.unit:+.3f} m, holgura media {mean * 1000:.0f} mm")
    log(f"gorra asentada {shift / body.unit * 1000:+.0f} mm; " + "; ".join(report))


def build_rigid(body, head, item):
    # Gorra o lentes: posición respecto del centro de la cabeza (metros del
    # avatar), sin tocarla (se separa lo justo si la atraviesa), hijos del
    # hueso de la cabeza.
    spec = item["fit"]
    name = item["node"]
    obj = import_garment(item["source"], name)
    scale = spec.get("scale", 1.0)
    pitch, yaw = spec.get("rotation", [0, 0])
    center = head.center
    offset = spec["position"]
    origin = center + body.side * body.m(offset[0]) + body.up * body.m(offset[1]) + body.forward * body.m(offset[2])
    rotation = Matrix.Rotation(math.radians(yaw), 4, body.up) @ Matrix.Rotation(math.radians(pitch), 4, body.side)
    matrix = Matrix.Translation(origin) @ rotation @ Matrix.Scale(body.m(scale), 4)
    stretch = spec.get("stretch")
    if stretch:
        # Por eje (x, y, z del avatar): una copa más baja abraza mejor la
        # cabeza del maniquí, más redonda que una cabeza real.
        matrix = matrix @ Matrix.Diagonal((stretch[0], stretch[2], stretch[1], 1.0))
    obj.data.transform(matrix)
    obj.data.update()
    if spec.get("seat"):
        seat_on_head(body, head, obj, spec)
    clearance = spec.get("clearance")
    moved = 0
    if clearance is not None:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        moved = push_clear(head.tree, bm, body.m(clearance), body.m(0.05))
        bm.to_mesh(obj.data)
        bm.free()
    # Reglas para ocultar la cabeza bajo la copa (si el lugar las tiene).
    rules = measure_rules(body, obj, item["rules"]) if item.get("rules") else None
    obj.parent = body.armature
    obj.parent_type = "BONE"
    obj.parent_bone = body.full_names["Head"]
    bpy.context.view_layer.update()
    obj.matrix_world = Matrix.Identity(4)
    log(f"{item['slug']}: {len(obj.data.polygons)} caras, {moved} vértices separados de la cabeza")
    return obj, rules


# ---------- Vista previa ----------


def render_previews(body, folder, sets, garments):
    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x = 700
    scene.render.resolution_y = 900
    for obj in body.meshes:
        obj.color = (0.55, 0.55, 0.58, 1)
    camera_data = bpy.data.cameras.new("preview")
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new("preview", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    looks = {
        "front": body.forward,
        "side": body.side,
        "back": -body.forward,
        "tq": (body.forward + body.side).normalized(),
    }
    for set_name, (visible, target_height, size) in sets.items():
        for obj in garments:
            obj.hide_render = obj.name not in visible
        target = Vector((0, 0, body.floor + body.m(target_height)))
        for look, direction in looks.items():
            camera_data.ortho_scale = body.m(size)
            camera.location = target + direction * body.m(4)
            camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = os.path.join(folder, f"{set_name}-{look}.png")
            bpy.ops.render.render(write_still=True)


# ---------- Ejecución ----------


def main():
    options = parse_args(sys.argv)
    with open(options["config"], encoding="utf-8") as file:
        config = json.load(file)
    out_dir = options["out-dir"]
    os.makedirs(out_dir, exist_ok=True)

    import_fbx(options["character"])
    body = Body(config["heightMeters"])
    head = Head(body)
    log(f"escala: {body.unit:.4f} unidades por metro del avatar")
    # Medidas de la cabeza (referencia para calibrar gorra y lentes).
    front = head.surface(head.center + body.forward * body.m(0.3), -body.forward)
    side = head.surface(head.center + body.side * body.m(0.3), -body.side)
    log(
        f"cabeza: centro {to_avatar(body, head.center)}, alto {(head.top - head.bottom) / body.unit:.3f} m, "
        f"frente a {((front - head.center).dot(body.forward) / body.unit) if front else 0:.3f} m, "
        f"medio ancho {((side - head.center).dot(body.side) / body.unit) if side else 0:.3f} m"
    )

    # Prendas base (las mismas de outfit.py) como referencia de capas.
    settings = config["outfit"]
    fabric = fabric_material("outfit-fabric")
    base = {}
    for key in ("socks", "shorts", "pants", "shirt", "tank"):
        spec = settings["garments"][key]
        under = [surface_tree(base[name]) for name in spec.get("over", []) if name in base]
        base[key] = build_garment(body, key, spec, settings, fabric, under)
    layers = {
        "over_bottoms": [surface_tree(base["shirt"]), surface_tree(base["tank"])],
        "under_bottoms": [surface_tree(base["socks"])],
        "under_tops": [surface_tree(base["shorts"]), surface_tree(base["pants"])],
    }

    items = config["items"]
    # Primero la ropa de abajo: las de arriba van por fuera de ella.
    order = sorted(items, key=lambda item: {"bottom": 0, "top": 1}.get(item["slot"], 2))
    built = {}
    report = {}
    for item in order:
        if item["kind"] == "skinned":
            obj, rules = build_skinned(body, item, layers)
            if item["slot"] == "bottom":
                layers["under_tops"].append(surface_tree(obj))
        else:
            obj, rules = build_rigid(body, head, item)
        built[item["slug"]] = obj
        report[item["slug"]] = {"node": obj.name, "rules": rules}

    # Un GLB por prenda: esqueleto (solo huesos) y la prenda.
    exported = {item["slug"] for item in items if not item.get("layerOnly")}
    for slug, obj in built.items():
        if slug not in exported:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        body.armature.select_set(True)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = body.armature
        target = os.path.join(out_dir, f"{slug}.glb")
        bpy.ops.export_scene.gltf(**export_options(target, animations=False, selection=True))
        log(f"exportado {target}")

    with open(os.path.join(out_dir, "fit-report.json"), "w", encoding="utf-8") as file:
        json.dump(report, file, indent=2)

    if options.get("preview"):
        everything = list(built.values()) + list(base.values())
        # Las vistas previas usan los colores de las texturas de cada prenda.
        sets = {}
        for item in items:
            visible = {item["node"]}
            if item["slot"] == "top":
                visible.add("Outfit_Shorts")
            elif item["slot"] == "bottom":
                visible.add("Outfit_Shirt")
            height, size = (1.64, 0.42) if item["slot"] in ("head", "eyes") else (1.0, 2.0)
            sets[item["slug"]] = (visible, height, size)
        tops = [item["node"] for item in items if item["slot"] == "top"]
        bottoms = [item["node"] for item in items if item["slot"] == "bottom"]
        for top in tops:
            for bottom in bottoms:
                sets[f"combo-{top}-{bottom}"] = ({top, bottom}, 1.0, 2.0)
        for obj in base.values():
            obj.color = (0.2, 0.3, 0.7, 1)
        render_previews(body, options["preview"], sets, everything)


if __name__ == "__main__":
    main()
