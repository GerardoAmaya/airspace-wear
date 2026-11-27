# Modela el hoodie propio del proyecto a partir del cuerpo del Y Bot.
# Lo ejecuta scripts/garments/build.mjs (pnpm garments); no hace falta llamarlo a mano.
#
# Uso:
#   blender --background --factory-startup --python-exit-code 1 \
#     --python scripts/garments/hoodie.py -- \
#     --character ybot.fbx --config hoodie-config.json --out-dir carpeta
#
# Pasos:
#   1. Cuerpo de la prenda: las piezas del torso y los brazos del maniquí,
#      infladas y unidas con un remallado de vóxeles (como el vestuario base),
#      más un cilindro elíptico en la cadera para que el ruedo baje recto por
#      encima de los muslos. Se suaviza, se corta (ruedo, puños, escote) y se
#      reduce.
#   2. Forma holgada: el torso cae recto desde el pecho y se ensancha un poco
#      hacia el ruedo, las mangas caen con volumen y se juntan en el puño de
#      canalé, y unos pliegues suaves en los codos, la espalda baja y sobre los
#      puños. Nunca queda a menos de la holgura mínima del cuerpo.
#   3. Capucha baja (rollo cerrado alrededor del cuello que cae sobre la
#      espalda), bolsillo canguro, ojales de metal y cordones.
#   4. UV en un atlas: frente y espalda (proyección plana), mangas (cilíndrica,
#      costura abajo), capucha, bolsillo y cordones. layout.json guarda cómo
#      pasar de metros a píxeles en cada isla y las costuras, para dibujar la
#      textura en build.mjs.
#   5. Pesos copiados del cuerpo y dos salidas sin esqueleto, en metros del
#      avatar (frente a +Z, piso en y = 0): rest.glb (T-pose, para pnpm
#      avatar:fit) y display.glb (brazos abajo, para el catálogo).

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.dont_write_bytecode = True
AVATAR_SCRIPTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "avatar")
sys.path.insert(0, os.path.abspath(AVATAR_SCRIPTS))
from fbx_to_glb import export_options, import_fbx  # noqa: E402
from outfit import (  # noqa: E402
    Body,
    apply_modifier,
    base_name,
    axis_param,
    cut,
    mesh_object,
    object_bmesh,
    open_hole,
    push_out,
    remove_small_parts,
    transfer_weights,
    triangle_count,
    write_bmesh,
)
from fit import blend_shoulders, bone_deltas, pose_body, reset_pose  # noqa: E402


def parse_args(argv):
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    options = {}
    for index in range(0, len(args), 2):
        options[args[index].lstrip("-")] = args[index + 1]
    for required in ("character", "config", "out-dir"):
        if required not in options:
            raise SystemExit(f"Falta --{required}")
    return options


def log(message):
    print(f"[garment] {message}", flush=True)


def smoothstep(edge0, edge1, value):
    if edge0 == edge1:
        return 1.0 if value >= edge1 else 0.0
    x = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return x * x * (3 - 2 * x)


def lerp(a, b, t):
    return a + (b - a) * t


# ---------- Espacio del avatar ----------


class Frame:
    """Conversión entre el mundo de Blender y los metros del avatar."""

    def __init__(self, body):
        self.body = body
        hips = body.heads["Hips"]
        self.base = Vector((hips.x, hips.y, body.floor))

    def to_avatar(self, co):
        b = self.body
        relative = co - self.base
        return Vector((relative.dot(b.side) / b.unit, relative.dot(b.up) / b.unit, relative.dot(b.forward) / b.unit))

    def to_world(self, x, y, z):
        b = self.body
        return self.base + b.side * b.m(x) + b.up * b.m(y) + b.forward * b.m(z)

    def matrix_to_avatar(self):
        # Mundo de Blender -> metros del avatar con los ejes de Blender que el
        # exportador lleva a glTF (x: lado, -y: adelante, z: arriba).
        b = self.body
        rows = Matrix((
            (b.side.x, b.side.y, b.side.z, 0),
            (-b.forward.x, -b.forward.y, -b.forward.z, 0),
            (b.up.x, b.up.y, b.up.z, 0),
            (0, 0, 0, 1),
        ))
        return Matrix.Scale(1 / b.unit, 4) @ rows @ Matrix.Translation(-self.base)


def spine_axis(body, frame):
    # Eje del torso por alturas (metros del avatar): (y, x, z) de cada hueso.
    points = []
    for name in ("Hips", "Spine", "Spine1", "Spine2", "Neck"):
        p = frame.to_avatar(body.heads[name])
        points.append((p.y, p.x, p.z))
    points.sort()

    def at(y):
        if y <= points[0][0]:
            return points[0][1], points[0][2]
        for (y0, x0, z0), (y1, x1, z1) in zip(points, points[1:]):
            if y <= y1:
                t = (y - y0) / (y1 - y0)
                return lerp(x0, x1, t), lerp(z0, z1, t)
        return points[-1][1], points[-1][2]

    return at


# ---------- Cuerpo de la prenda ----------


def hip_filler(body, frame, bm, spec):
    # Tronco de cono elíptico del pecho a bajo el ruedo: abraza cadera y
    # muslos y se ensancha de a poco desde el pecho, para que la prenda caiga
    # recta (holgada) sin seguir la cintura ni la entrepierna.
    low = spec["hemHeight"] - 0.04
    chest = 1.22

    def extents(y0, y1, limit):
        xs, zs = [], []
        for piece in body.pieces:
            for co, _ in piece["verts"]:
                p = frame.to_avatar(co)
                if y0 <= p.y <= y1 and abs(p.x) < limit:
                    xs.append(p.x)
                    zs.append(p.z)
        return max(abs(min(xs)), abs(max(xs))), min(zs), max(zs)

    ease = spec["offset"] * 0.6
    hip_x, hip_z0, hip_z1 = extents(low, 1.0, 0.4)
    chest_x, chest_z0, chest_z1 = extents(chest - 0.05, chest + 0.03, 0.16)
    bottom = (hip_x + ease, (hip_z1 - hip_z0) / 2 + ease, (hip_z0 + hip_z1) / 2)
    top = (chest_x + ease * 0.5, (chest_z1 - chest_z0) / 2 + ease * 0.5, (chest_z0 + chest_z1) / 2)
    result = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=48, radius1=1.0, radius2=1.0, depth=1.0)
    for vert in result["verts"]:
        local = vert.co.copy()
        f = local.z + 0.5
        # Ensancha en la mitad de abajo (suave): recto en la cadera.
        w = smoothstep(0.0, 0.75, f)
        ax, az, cz = (lerp(bottom[i], top[i], w) for i in range(3))
        vert.co = frame.to_world(local.x * ax, lerp(low, chest, f), cz + local.y * az)
    log(f"relleno: cadera {bottom[0]:.3f} x {bottom[1]:.3f} m, pecho {top[0]:.3f} x {top[1]:.3f} m")


def arm_axis(body, side):
    start = body.heads[f"{side}Arm"]
    end = body.heads[f"{side}Hand"]
    return start, end


def radial_from(point, start, direction):
    relative = point - start
    along = relative.dot(direction)
    return relative - direction * along, along


def shape_sleeves(body, frame, bm, spec):
    # Mangas: caen con volumen (el radio no se achica hacia la muñeca hasta el
    # puño), se juntan sobre el puño y terminan en un canalé redondo y
    # holgado sobre la muñeca. Pliegues suaves en el codo y sobre el puño.
    unit = body.unit
    for side in ("Left", "Right"):
        start, end = arm_axis(body, side)
        direction = (end - start).normalized()
        length = (end - start).length
        seam_t = spec["shoulderSeam"] * unit / length
        cuff_end = spec["sleeveEnd"]
        cuff_start = cuff_end - spec["cuffLength"] * unit / length
        # Radio de la muñeca: puntos del cuerpo cerca del final del antebrazo.
        wrist = 0.0
        for piece in body.pieces:
            for co, _ in piece["verts"]:
                relative = co - start
                t = relative.dot(direction) / length
                if 0.9 <= t <= 1.0 and (co - body.heads["Hips"]).dot(body.side) * (1 if side == "Left" else -1) > 0:
                    radial = relative - direction * relative.dot(direction)
                    if radial.length < body.m(0.07):
                        wrist = max(wrist, radial.length)
        cuff_radius = wrist + body.m(spec["cuffEase"] + spec["clearance"] * 0.35)
        # Perfil del radio por ángulo y tramo: máximo acumulado del hombro al puño.
        bins, slices = 36, 40
        table = [[0.0] * bins for _ in range(slices)]
        u = (body.up - direction * body.up.dot(direction)).normalized()
        v = direction.cross(u).normalized()
        chosen = []
        for vert in bm.verts:
            offset = (vert.co - body.heads["Hips"]).dot(body.side)
            if (offset > 0) != (side == "Left"):
                continue
            radial, along = radial_from(vert.co, start, direction)
            t = along / length
            # Solo la manga: cerca del eje del brazo (el costado del torso
            # también queda de este lado, pero lejos del eje).
            if t < seam_t * 0.5 or radial.length > body.m(0.16):
                continue
            angle = math.atan2(radial.dot(v), radial.dot(u))
            slice_index = max(0, min(slices - 1, int((t - seam_t) / (cuff_end - seam_t) * slices)))
            bin_index = int((angle + math.pi) / (2 * math.pi) * bins) % bins
            if t >= seam_t * 1.5:
                table[slice_index][bin_index] = max(table[slice_index][bin_index], radial.length)
            chosen.append((vert, t, angle, radial, slice_index, bin_index))
        # Cuánto del radio de arriba se arrastra hacia la muñeca (por tramo):
        # cerca de 1 la manga cae recta y ancha; más bajo, se afina hacia el
        # antebrazo como una manga entallada.
        taper = spec.get("sleeveTaper", 0.982)
        for s in range(1, slices):
            for b in range(bins):
                table[s][b] = max(table[s][b], table[s - 1][b] * taper)
        for s in range(slices):
            row = table[s]
            table[s] = [max(row[i], (row[i - 1] + 2 * row[i] + row[(i + 1) % bins]) / 4) for i in range(bins)]
        ease = body.m(spec["sleeveEase"])
        bunch = body.m(spec["cuffBunch"])
        folds = spec["folds"]
        for vert, t, angle, radial, s, b in chosen:
            if radial.length < 1e-9:
                continue
            target = max(radial.length, table[s][b]) if t >= seam_t else radial.length
            # Holgura de la manga (más en el antebrazo), sin tocar el hombro.
            target += ease * smoothstep(seam_t * 0.5, seam_t * 2.5, t)
            # Volumen sobre el puño: la tela se junta antes del canalé.
            gather = smoothstep(cuff_start - 0.14, cuff_start - 0.03, t) * (1 - smoothstep(cuff_start - 0.03, cuff_start, t))
            target += bunch * gather
            # Pliegues: anillos suaves en el codo y sobre el puño.
            elbow = math.exp(-((t - 0.5) / 0.06) ** 2)
            target += body.m(folds["elbow"]) * elbow * math.sin(t * length / body.m(0.03) * 2 * math.pi + angle * 1.5)
            above = math.exp(-((t - (cuff_start - 0.06)) / 0.05) ** 2)
            target += body.m(folds["cuff"]) * above * math.sin(t * length / body.m(0.022) * 2 * math.pi + angle)
            # Puño de canalé: radio fijo (redondo) desde cuff_start.
            rib = smoothstep(cuff_start - 0.008, cuff_start + 0.004, t)
            final = lerp(target, cuff_radius, rib)
            vert.co += radial.normalized() * (final - radial.length)
        log(f"manga {side}: muñeca {wrist / unit:.3f} m, puño {cuff_radius / unit:.3f} m, costura del hombro t={seam_t:.2f}")
    return


def shape_torso(body, frame, bm, spec, axis_at):
    # Torso: cae recto desde el pecho (el radio no se achica al bajar), se
    # ensancha un poco hacia el ruedo y la banda de canalé se junta apenas.
    # Pliegues horizontales suaves en la espalda baja.
    seam_x = frame.to_avatar(body.heads["LeftArm"]).x + spec["shoulderSeam"] * 0.5
    hem = spec["hemHeight"]
    rib_top = hem + spec["hemRib"]
    bins, slices = 48, 48
    top, bottom = 1.32, hem
    column = (0.0, axis_at(1.15)[1])
    table = [[0.0] * bins for _ in range(slices)]
    chosen = []
    for vert in bm.verts:
        p = frame.to_avatar(vert.co)
        if (abs(p.x) > seam_x and p.y > 1.18) or p.y > top:
            continue
        # Eje vertical fijo (no sigue la curva de la columna): así el radio
        # que no se achica al bajar da una silueta recta en cualquier
        # dirección, sin cintura marcada.
        cx, cz = column
        dx, dz = p.x - cx, p.z - cz
        radius = math.hypot(dx, dz)
        angle = math.atan2(dx, dz)
        s = max(0, min(slices - 1, int((top - p.y) / (top - bottom) * slices)))
        b = int((angle + math.pi) / (2 * math.pi) * bins) % bins
        if abs(p.x) < seam_x * 0.8 or p.y < 1.2:
            table[s][b] = max(table[s][b], radius)
        chosen.append((vert, p, cx, cz, radius, angle, s, b))
    # Perfil de cada ángulo: corte en A. Desde la sisa (anchor) hasta el
    # ruedo el radio es una recta que pasa por encima de todo el cuerpo
    # (tangente al perfil desde la sisa): ni cintura marcada ni barriga en la
    # cadera, solo una caída que se abre apenas hacia abajo.
    for s in range(1, slices):
        for b in range(bins):
            table[s][b] = max(table[s][b], table[s - 1][b])
    anchor = max(0, min(slices - 2, int((top - spec["aLineFrom"]) / (top - bottom) * slices)))
    for b in range(bins):
        r0 = table[anchor][b]
        slope = 0.0
        for s in range(anchor + 1, slices):
            slope = max(slope, (table[s][b] - r0) / (s - anchor))
        for s in range(anchor + 1, slices):
            table[s][b] = r0 + slope * (s - anchor)
    for s in range(slices):
        row = table[s]
        for _ in range(2):
            row = [max(row[i], (row[i - 1] + 2 * row[i] + row[(i + 1) % bins]) / 4) for i in range(bins)]
        table[s] = row
    ease = spec["torsoEase"]
    folds = spec["folds"]
    for vert, p, cx, cz, radius, angle, s, b in chosen:
        if radius < 1e-6:
            continue
        # Cerca de la sisa se mezcla con la forma original (la manga manda).
        blend = 1 - smoothstep(seam_x * 0.75, seam_x, abs(p.x)) * smoothstep(1.2, 1.3, p.y)
        target = max(radius, table[s][b])
        # Holgura que crece en línea recta desde la sisa (corte en A).
        down = max(0.0, min(1.0, (spec["aLineFrom"] - p.y) / (spec["aLineFrom"] - hem)))
        # A los costados (donde pasan los brazos al caminar) la holgura crece
        # menos que adelante y atrás.
        side = abs(math.sin(angle))
        target += lerp(ease["chest"], ease["hem"], down) * (1 - 0.55 * side ** 2)
        # Banda del ruedo: se junta un poco (sin ceñir).
        rib = 1 - smoothstep(rib_top - 0.004, rib_top + 0.008, p.y)
        # La banda abraza la cadera: vuelve al contorno del cuerpo inflado
        # (el perfil) más `hemGather` m, sin quedar por dentro.
        target = lerp(target, table[s][b] + spec["hemGather"], rib)
        # Pliegues de la espalda baja, solo atrás y sobre la banda.
        back = max(0.0, -math.cos(angle))
        window = smoothstep(rib_top, rib_top + 0.03, p.y) * (1 - smoothstep(1.02, 1.12, p.y))
        target += folds["lowerBack"] * back * window * math.sin(p.y / 0.045 * 2 * math.pi + math.sin(angle * 3))
        # Caída suelta del ruedo: ondas verticales suaves que crecen hacia
        # abajo (la banda de canalé las junta).
        loose = smoothstep(1.02, rib_top + 0.01, p.y) * (1 - rib * 0.7)
        target += folds["hem"] * loose * (math.sin(angle * 7 + 0.6) * 0.6 + math.sin(angle * 11 + 1.9) * 0.4)
        final = lerp(radius, target, blend)
        dx, dz = (p.x - cx) / radius, (p.z - cz) / radius
        new = frame.to_world(cx + dx * final, p.y, cz + dz * final)
        vert.co = new
    return seam_x


def straighten_edges(body, frame, bm, spec):
    # Ruedo y puños limpios: los bordes vuelven a su plano de corte (la
    # reducción de triángulos los dejó en zigzag) y se suavizan a lo largo.
    planes = []
    hips, spine = body.heads["Hips"], body.heads["Spine"]
    axis = (spine - hips).normalized()
    hem_point = frame.to_world(0, spec["hemHeight"], 0)
    planes.append((hem_point, axis, lambda p: frame.to_avatar(p).y < spec["hemHeight"] + 0.05))
    for side in ("Left", "Right"):
        start, end = arm_axis(body, side)
        point = start + (end - start) * spec["sleeveEnd"]
        sign = 1 if side == "Left" else -1
        planes.append((point, (end - start).normalized(), lambda p, sign=sign: frame.to_avatar(p).x * sign > 0.4))
    for point, normal, select in planes:
        loop = [v for v in bm.verts if v.is_boundary and select(v.co)]
        members = set(loop)
        for _ in range(6):
            moved = {}
            for vert in loop:
                around = [e.other_vert(vert) for e in vert.link_edges if e.is_boundary and e.other_vert(vert) in members]
                if len(around) == 2:
                    moved[vert] = vert.co * 0.5 + (around[0].co + around[1].co) * 0.25
            for vert, co in moved.items():
                vert.co = co
            for vert in loop:
                vert.co -= normal * (vert.co - point).dot(normal)


def build_shell(body, frame, spec, axis_at):
    bm = body.region(spec["bones"])
    for vert in bm.verts:
        vert.co += vert.normal * body.m(spec["offset"])
    hip_filler(body, frame, bm, spec)
    obj = mesh_object("tmp-shell", bm)
    bm.free()
    apply_modifier(obj, "REMESH", mode="VOXEL", voxel_size=body.m(spec["voxelMeters"]), adaptivity=0)
    apply_modifier(obj, "SMOOTH", factor=1.0, iterations=spec["smoothIterations"])
    bm = object_bmesh(obj)
    remove_small_parts(bm)
    hips_to_spine = frame.to_avatar(body.heads["Spine"]).y - frame.to_avatar(body.heads["Hips"]).y
    hem_t = (spec["hemHeight"] - frame.to_avatar(body.heads["Hips"]).y) / hips_to_spine
    cut(body, bm, {"from": "Hips", "to": "Spine", "t": hem_t, "keep": "above"})
    for side in ("Left", "Right"):
        # El corte de la manga va sobre el eje del brazo entero (hombro a mano).
        start, end = arm_axis(body, side)
        point = start + (end - start) * spec["sleeveEnd"]
        direction = (end - start).normalized()
        geom = [vert for vert in bm.verts if ((vert.co - body.heads["Hips"]).dot(body.side) > 0) == (side == "Left")]
        faces = {face for vert in geom for face in vert.link_faces}
        edges = {edge for vert in geom for edge in vert.link_edges}
        bmesh.ops.bisect_plane(bm, geom=list(geom) + list(edges) + list(faces), dist=1e-7, plane_co=point, plane_no=direction, clear_outer=True)
    hole = dict(spec["neckHole"], **{"from": "Neck", "to": "Head"})
    open_hole(body, bm, hole)
    remove_small_parts(bm)
    write_bmesh(obj, bm)
    bm.free()
    current = triangle_count(obj)
    if current > spec["triangles"]:
        apply_modifier(obj, "DECIMATE", decimate_type="COLLAPSE", ratio=spec["triangles"] / current)
    bm = object_bmesh(obj)
    bm.normal_update()
    seam_x = shape_torso(body, frame, bm, spec, axis_at)
    shape_sleeves(body, frame, bm, spec)
    # Suavizado leve (une torso y mangas) y holgura mínima.
    straighten_edges(body, frame, bm, spec)
    inner = [v for v in bm.verts if not v.is_boundary]
    for _ in range(spec["finalSmooth"]):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    moved = push_out(body, bm, body.m(spec["clearance"]))
    bm.normal_update()
    write_bmesh(obj, bm)
    bm.free()
    log(f"cuerpo: {triangle_count(obj)} triángulos, {moved} vértices separados del cuerpo")
    return obj, seam_x


# ---------- UV ----------


class Atlas:
    """Islas del atlas: coordenadas locales en metros -> UV."""

    def __init__(self, rects, size):
        self.rects = rects
        self.size = size
        self.islands = {}

    def fit(self, name, points, uniform=True, margin=10):
        # Escala y desplazamiento para que la isla quepa en su rectángulo.
        x0, y0, x1, y1 = self.rects[name]
        width = (x1 - x0) * self.size - 2 * margin
        height = (y1 - y0) * self.size - 2 * margin
        ax = [p[0] for p in points]
        bx = [p[1] for p in points]
        a0, a1, b0, b1 = min(ax), max(ax), min(bx), max(bx)
        sa = width / max(1e-6, a1 - a0)
        sb = height / max(1e-6, b1 - b0)
        if uniform:
            sa = sb = min(sa, sb)
        ox = x0 * self.size + margin + (width - (a1 - a0) * sa) / 2 - a0 * sa
        oy = y0 * self.size + margin + (height - (b1 - b0) * sb) / 2 - b0 * sb
        self.islands[name] = {"scale": [sa, sb], "offset": [ox, oy], "bounds": [a0, b0, a1, b1]}

    def px(self, name, a, b):
        island = self.islands[name]
        return island["offset"][0] + a * island["scale"][0], island["offset"][1] + b * island["scale"][1]

    def uv(self, name, a, b):
        x, y = self.px(name, a, b)
        # Blender guarda v desde abajo; el exportador la invierte para glTF.
        return x / self.size, 1 - y / self.size


def sleeve_coords(body, side, point, radius0):
    start, end = arm_axis(body, side)
    direction = (end - start).normalized()
    radial, along = radial_from(point, start, direction)
    theta = math.atan2(radial.dot(body.forward), radial.dot(body.up))
    return along / body.unit, theta, theta * radius0


def unwrap_shell(body, frame, obj, atlas, seam_x, axis_at):
    # Islas: frente y espalda del torso (plano), mangas (cilindro con la
    # costura abajo). Devuelve la isla de cada cara.
    mesh = obj.data
    radius0 = 0.07
    face_island = []
    loop_coords = {}
    for polygon in mesh.polygons:
        world_center = obj.matrix_world @ polygon.center
        center = frame.to_avatar(world_center)
        side = "Left" if center.x > 0 else "Right"
        start, end = arm_axis(body, side)
        radial, _ = radial_from(world_center, start, (end - start).normalized())
        # Manga: pasada la costura del hombro y cerca del eje del brazo (el
        # costado del torso, más abajo, sigue en el frente o la espalda).
        if abs(center.x) > seam_x and radial.length < body.m(0.17):
            island = "sleeveL" if side == "Left" else "sleeveR"
        else:
            _, cz = axis_at(min(center.y, 1.45))
            island = "front" if center.z >= cz else "back"
        face_island.append(island)
        coords = []
        for loop_index in polygon.loop_indices:
            co = obj.matrix_world @ mesh.vertices[mesh.loops[loop_index].vertex_index].co
            p = frame.to_avatar(co)
            if island == "front":
                coords.append([p.x, -p.y])
            elif island == "back":
                coords.append([-p.x, -p.y])
            else:
                along, theta, arc = sleeve_coords(body, "Left" if island == "sleeveL" else "Right", co, radius0)
                coords.append([along, theta])
        if island.startswith("sleeve"):
            thetas = [c[1] for c in coords]
            if max(thetas) - min(thetas) > math.pi:
                for c in coords:
                    if c[1] < 0:
                        c[1] += 2 * math.pi
            for c in coords:
                c[1] *= radius0
        loop_coords[polygon.index] = coords
    for name in ("front", "back", "sleeveL", "sleeveR"):
        points = [c for index, coords in loop_coords.items() if face_island[index] == name for c in coords]
        atlas.fit(name, points)
    uv_layer = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        island = face_island[polygon.index]
        for loop_index, (a, b) in zip(polygon.loop_indices, loop_coords[polygon.index]):
            uv_layer.data[loop_index].uv = atlas.uv(island, a, b)
    atlas.islands["sleeveL"]["radius0"] = radius0
    atlas.islands["sleeveR"]["radius0"] = radius0
    return face_island


def seam_lines(obj, face_island, atlas):
    # Costuras: aristas entre caras de islas distintas, en píxeles de cada isla.
    mesh = obj.data
    uv = mesh.uv_layers["UVMap"].data
    edge_faces = {}
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            loop = mesh.loops[loop_index]
            edge_faces.setdefault(loop.edge_index, []).append((polygon.index, loop_index))
    lines = []
    for edge_index, users in edge_faces.items():
        if len(users) != 2:
            continue
        (fa, la), (fb, lb) = users
        if face_island[fa] == face_island[fb]:
            continue
        for polygon_index, loop_index in users:
            polygon = mesh.polygons[polygon_index]
            loops = list(polygon.loop_indices)
            position = loops.index(loop_index)
            nxt = loops[(position + 1) % len(loops)]
            a = uv[loop_index].uv
            b = uv[nxt].uv
            lines.append([
                round(a.x * atlas.size, 1), round((1 - a.y) * atlas.size, 1),
                round(b.x * atlas.size, 1), round((1 - b.y) * atlas.size, 1),
            ])
    return lines


# ---------- Capucha ----------


def neck_ring(body, frame, shell):
    # Borde del escote: vértices de borde sobre el pecho, por ángulo alrededor
    # del cuello.
    bm = object_bmesh(shell)
    neck = frame.to_avatar(body.heads["Neck"])
    points = []
    for vert in bm.verts:
        if not vert.is_boundary:
            continue
        p = frame.to_avatar(shell.matrix_world @ vert.co)
        if p.y < 1.3 or math.hypot(p.x - neck.x, p.z - neck.z) > 0.15:
            continue
        angle = math.atan2(p.x - neck.x, p.z - (neck.z + 0.012))
        points.append((angle, p))
    bm.free()
    points.sort(key=lambda item: item[0])
    center = Vector((neck.x, 0, neck.z + 0.012))

    def at(theta):
        theta = (theta + math.pi) % (2 * math.pi) - math.pi
        # Promedio ponderado de los vecinos en ángulo (suaviza el borde).
        total, weight = Vector((0, 0, 0)), 0.0
        for angle, p in points:
            delta = abs((angle - theta + math.pi) % (2 * math.pi) - math.pi)
            if delta < 0.12:
                w = 1 - delta / 0.12
                total += p * w
                weight += w
        return total / weight

    return at, center


def surface_tree(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def march_down(tree, start, radial, up, distance, count, lateral=Vector((0, 0, 0))):
    # Camina sobre la superficie "cuesta abajo" (hacia abajo y hacia afuera)
    # y devuelve `count` puntos con su normal, repartidos en `distance`.
    points = []
    location, normal, _, _ = tree.find_nearest(start)
    current = location
    travelled = 0.0
    step = distance / count
    for _ in range(count):
        direction = -up + radial * 0.15 + lateral
        direction = direction - normal * direction.dot(normal)
        if direction.length < 1e-9:
            direction = -up
        current = current + direction.normalized() * step
        location, normal, _, _ = tree.find_nearest(current)
        current = location
        travelled += step
        points.append((current.copy(), normal.copy(), travelled))
    return points


def build_hood(body, frame, shell, spec, atlas):
    # Rollo cerrado alrededor del cuello: por dentro se apoya en la prenda y
    # por fuera tiene el grosor del rollo; cae poco adelante y mucho atrás.
    ring, center = neck_ring(body, frame, shell)
    tree = surface_tree(shell)
    unit = body.unit
    segments, profile = spec["segments"], spec["profile"]
    bm = bmesh.new()
    rows = []
    coords = []
    for i in range(segments):
        theta = -math.pi + 2 * math.pi * i / segments
        back = (1 - math.cos(theta)) / 2
        base = ring(theta)
        radial_a = Vector((base.x - center.x, 0, base.z - center.z)).normalized()
        radial = body.side * radial_a.x + body.forward * radial_a.z
        start = frame.to_world(base.x, base.y, base.z)
        stand = lerp(spec["stand"][0], spec["stand"][1], back)
        # Caída: poca adelante, la capucha apoyada en los hombros a los costados
        # y una U ancha sobre la espalda.
        front, sides, rear = spec["drop"]
        drop = front + (sides - front) * smoothstep(0.0, 0.5, back) + (rear - sides) * smoothstep(0.4, 1.0, back) ** 1.3
        thickness = lerp(spec["thickness"][0], spec["thickness"][1], back ** 1.4)
        # Base: cuello de la capucha (sube y se abre un poco) y caída sobre la prenda.
        base_points = []
        samples = profile
        for k in range(samples):
            d = -stand + (stand) * k / samples
            point = start + body.up * body.m(-d) + radial * body.m(-d * 0.35)
            base_points.append((point, radial.copy(), d))
        for point, normal, travelled in march_down(tree, start, radial, body.up, body.m(drop), samples, body.side * (radial_a.x * spec["spread"] * back)):
            base_points.append((point, normal, travelled / unit))
        total = stand + drop
        ring_points = []
        n = len(base_points)
        # Por dentro (de arriba a abajo) y por fuera (de abajo a arriba).
        for k, (point, normal, d) in enumerate(base_points):
            ring_points.append((point + normal * body.m(spec["gap"]), (d + stand) / total))
        for k in range(n - 2, 0, -1):
            point, normal, d = base_points[k]
            t = (d + stand) / total
            tau = thickness * math.sqrt(max(0.0, math.sin(math.pi * t))) * (1.15 - 0.45 * t)
            ring_points.append((point + normal * body.m(spec["gap"] + tau), 1 + (1 - t)))
        rows.append([bm.verts.new(p) for p, _ in ring_points])
        coords.append([s for _, s in ring_points])
    count = min(len(row) for row in rows)
    # Todas las filas con el mismo número de puntos (remuestreo simple).
    for index, row in enumerate(rows):
        if len(row) != count:
            raise SystemExit(f"capucha: fila {index} con {len(row)} puntos (se esperaban {count}).")
    uv_layer = bm.loops.layers.uv.new("UVMap")
    perimeter = 0.0
    for i in range(segments):
        a = frame.to_avatar(rows[i][0].co)
        b = frame.to_avatar(rows[(i + 1) % segments][0].co)
        perimeter += (a - b).length
    atlas.fit("hood", [(0, 0), (perimeter, 0.5)], uniform=False)
    atlas.islands["hood"]["perimeter"] = perimeter
    faces = []
    for i in range(segments):
        for j in range(count):
            a, b = rows[i][j], rows[(i + 1) % segments][j]
            c, d = rows[(i + 1) % segments][(j + 1) % count], rows[i][(j + 1) % count]
            try:
                face = bm.faces.new([a, d, c, b])
            except ValueError:
                continue
            u0, u1 = i / segments, (i + 1) / segments
            s0 = coords[i][j]
            s1 = coords[i][(j + 1) % count] if j + 1 < count else 2.0
            for loop, (u, s) in zip(face.loops, ((u0, s0), (u0, s1), (u1, s1), (u1, s0))):
                loop[uv_layer].uv = atlas.uv("hood", u * perimeter, s * 0.25)
            faces.append(face)
    bm.normal_update()
    # Normales hacia afuera: el centro del rollo queda adentro.
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = mesh_object("tmp-hood", bm)
    bm.free()
    log(f"capucha: {triangle_count(obj)} caras, perímetro {perimeter:.2f} m")
    return obj


# ---------- Bolsillo canguro ----------


def pocket_relief(body, frame, shell, spec):
    # El panel del bolsillo sale apenas de la tela (relieve suave, más hacia el
    # centro) y se hunde un poco en las aberturas laterales: se lee el
    # bolsillo sin una segunda capa que pueda cruzarse con la primera.
    mesh = shell.data
    for vertex in mesh.vertices:
        p = frame.to_avatar(shell.matrix_world @ vertex.co)
        if p.z < 0 or not (spec["bottom"] - 0.01 <= p.y <= spec["top"] + 0.01):
            continue
        fy = (p.y - spec["bottom"]) / (spec["top"] - spec["bottom"])
        half = lerp(spec["halfWidthBottom"], spec["halfWidthTop"], max(0.0, min(1.0, fy)))
        fx = p.x / half
        if abs(fx) > 1.05:
            continue
        inside = smoothstep(1.05, 0.9, abs(fx)) * smoothstep(-0.06, 0.06, fy) * smoothstep(1.06, 0.94, fy)
        lift = spec["bulge"] * inside * max(0.0, math.cos(min(1.0, abs(fx)) * math.pi / 2)) ** 0.5
        normal = (shell.matrix_world.to_3x3() @ vertex.normal).normalized()
        vertex.co += shell.matrix_world.inverted().to_3x3() @ (normal * body.m(lift))
    mesh.update()




def build_pocket(body, frame, shell, spec, atlas):
    tree = surface_tree(shell)
    rows, cols = 24, 36
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    grid = []
    local = []
    for r in range(rows + 1):
        fy = r / rows
        y = lerp(spec["bottom"], spec["top"], fy)
        half = lerp(spec["halfWidthBottom"], spec["halfWidthTop"], fy)
        row = []
        for c in range(cols + 1):
            fx = c / cols
            x = lerp(-half, half, fx)
            origin = frame.to_world(x, y, 0.5)
            hit, normal, _, _ = tree.ray_cast(origin, -body.forward, body.m(1.0))
            if hit is None:
                hit, normal, _, _ = tree.find_nearest(frame.to_world(x, y, 0.1))
            edge = min(fx, 1 - fx)
            bulge = math.sin(math.pi * fx) * math.sin(math.pi * fy)
            # Aberturas laterales: la tela se separa del cuerpo en el tramo alto
            # de los lados inclinados.
            opening = (1 - smoothstep(0.0, 0.12, edge)) * smoothstep(0.2, 0.8, fy)
            gap = spec["gap"] + spec["bulge"] * bulge + spec["opening"] * opening
            row.append(bm.verts.new(hit + normal * body.m(gap)))
            local.append((x, -y))
        grid.append(row)
    atlas.fit("pocket", local)
    for r in range(rows):
        for c in range(cols):
            verts = [grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]]
            bm.faces.new(verts)
    bm.verts.ensure_lookup_table()
    lookup = {}
    for r in range(rows + 1):
        for c in range(cols + 1):
            lookup[grid[r][c]] = local[r * (cols + 1) + c]
    for face in bm.faces:
        for loop in face.loops:
            a, b = lookup[loop.vert]
            loop[uv_layer].uv = atlas.uv("pocket", a, b)
    bm.normal_update()
    for face in bm.faces:
        if face.normal.dot(body.forward) < 0:
            face.normal_flip()
    obj = mesh_object("tmp-pocket", bm)
    bm.free()
    apply_modifier(obj, "SOLIDIFY", thickness=body.m(spec["thickness"]), offset=-1.0, use_rim=True, use_even_offset=True)
    log(f"bolsillo: {triangle_count(obj)} caras")
    return obj


# ---------- Cordones y ojales ----------


def tube_along(bm, path, radius, sides, uv_layer, uv_point, material_index=0, cap=True):
    rings = []
    count = len(path)
    previous_normal = None
    for index, point in enumerate(path):
        tangent = (path[min(index + 1, count - 1)] - path[max(index - 1, 0)]).normalized()
        if previous_normal is None:
            helper = Vector((1, 0, 0)) if abs(tangent.x) < 0.9 else Vector((0, 1, 0))
            normal = tangent.cross(helper).normalized()
        else:
            normal = (previous_normal - tangent * previous_normal.dot(tangent)).normalized()
        previous_normal = normal
        binormal = tangent.cross(normal).normalized()
        ring = []
        for k in range(sides):
            angle = 2 * math.pi * k / sides
            ring.append(bm.verts.new(point + (normal * math.cos(angle) + binormal * math.sin(angle)) * radius))
        rings.append(ring)
    faces = []
    for index in range(count - 1):
        a, b = rings[index], rings[index + 1]
        for k in range(sides):
            n = (k + 1) % sides
            faces.append(bm.faces.new([a[k], a[n], b[n], b[k]]))
    if cap:
        faces.append(bm.faces.new(list(reversed(rings[0]))))
        faces.append(bm.faces.new(rings[-1]))
    for face in faces:
        face.material_index = material_index
        for loop in face.loops:
            loop[uv_layer].uv = uv_point
    return faces


def build_cords(body, frame, shell, hood, spec, atlas, materials):
    # Ojales en el frente del cuello de la capucha y cordones que caen sobre
    # el pecho (se apoyan en la capucha y en la prenda, sin atravesarlas).
    bm_all = bmesh.new()
    for obj in (shell, hood):
        temp = bmesh.new()
        temp.from_mesh(obj.data)
        temp.transform(obj.matrix_world)
        mesh = bpy.data.meshes.new("tmp")
        temp.to_mesh(mesh)
        bm_all.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
        temp.free()
    bm_all.normal_update()
    tree = BVHTree.FromBMesh(bm_all)
    bm_all.free()
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    x0, y0, x1, y1 = atlas.rects["cords"]
    cord_uv = ((x0 + x1) / 2, 1 - (y0 + y1) / 2)
    atlas.islands["cords"] = {"rect": [x0, y0, x1, y1]}
    neck = frame.to_avatar(body.heads["Neck"])
    radius = body.m(spec["radius"])
    eyelets = []
    for sign in (-1, 1):
        theta = math.radians(spec["angle"]) * sign
        # Punto del frente de la capucha: rayo desde adelante a la altura del ojal.
        target_y = neck.y - 0.012
        direction = Vector((math.sin(theta), 0, math.cos(theta)))
        origin = frame.to_world(neck.x + direction.x * 0.4, target_y, neck.z + direction.z * 0.4)
        aim = frame.to_world(neck.x, target_y, neck.z) - origin
        hit, normal, _, _ = tree.ray_cast(origin, aim.normalized(), body.m(1.0))
        if hit is None:
            raise SystemExit("cordones: el rayo no encontró la capucha.")
        eyelets.append((hit, normal))
        # Ojal: anillo de metal sobre la tela.
        ring = []
        tangent = normal.cross(body.up).normalized()
        bitangent = normal.cross(tangent).normalized()
        major, minor = body.m(spec["eyelet"]["radius"]), body.m(spec["eyelet"]["tube"])
        segments, sides = 16, 6
        grid = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            center = hit + normal * minor + (tangent * math.cos(angle) + bitangent * math.sin(angle)) * major
            radial = (center - hit - normal * minor).normalized()
            row = []
            for k in range(sides):
                phi = 2 * math.pi * k / sides
                row.append(bm.verts.new(center + (radial * math.cos(phi) + normal * math.sin(phi)) * minor))
            grid.append(row)
        for i in range(segments):
            for k in range(sides):
                face = bm.faces.new([grid[i][k], grid[(i + 1) % segments][k], grid[(i + 1) % segments][(k + 1) % sides], grid[i][(k + 1) % sides]])
                face.material_index = 1
                for loop in face.loops:
                    loop[uv_layer].uv = cord_uv
        # Cordón: sale del ojal y cae apoyado sobre la tela.
        path = [hit - normal * body.m(0.004), hit + normal * (radius * 1.2)]
        steps = 26
        length = body.m(spec["length"])
        current = hit + normal * (radius * 1.2)
        start_avatar = frame.to_avatar(hit)
        for step in range(1, steps + 1):
            f = step / steps
            y = start_avatar.y - spec["length"] * f * 0.97
            x = start_avatar.x * (1 + 0.25 * f) + sign * 0.004 * math.sin(f * 3)
            origin = frame.to_world(x, y, start_avatar.z + 0.4)
            hit2, normal2, _, _ = tree.ray_cast(origin, -body.forward, body.m(1.0))
            if hit2 is None:
                continue
            point = hit2 + normal2 * (radius * 1.25 + body.m(0.001))
            path.append(point)
        # Puntera de metal en el último tramo.
        total = 0.0
        lengths = [0.0]
        for a, b in zip(path, path[1:]):
            total += (b - a).length
            lengths.append(total)
        aglet_start = total - body.m(spec["aglet"])
        cord_path = [p for p, l in zip(path, lengths) if l <= aglet_start]
        tip_path = [p for p, l in zip(path, lengths) if l >= aglet_start - body.m(0.002)]
        tube_along(bm, cord_path, radius, 8, uv_layer, cord_uv, 0, cap=False)
        tube_along(bm, tip_path, radius * 1.15, 8, uv_layer, cord_uv, 1, cap=True)
    bm.normal_update()
    # Ranuras de material antes de pasar la malla: sin ellas, Blender recorta
    # el índice del metal (ojales y punteras) a la tela.
    mesh = bpy.data.meshes.new("tmp-cords")
    for item in materials:
        mesh.materials.append(item)
    bm.to_mesh(mesh)
    obj = bpy.data.objects.new("tmp-cords", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm.free()
    log(f"cordones y ojales: {triangle_count(obj)} caras")
    return obj, [frame.to_avatar(p) for p, _ in eyelets]


# ---------- Salida ----------


def material(name, color, metallic, roughness):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat


def join(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    return obj


def export_static(frame, mesh, target, materials):
    # Malla sin esqueleto en metros del avatar.
    mesh = mesh.copy()
    mesh.transform(frame.matrix_to_avatar())
    mesh.update()
    obj = bpy.data.objects.new("Hoodie", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    options = export_options(target, animations=False, selection=True)
    options["export_skins"] = False
    bpy.ops.export_scene.gltf(**options)
    bpy.data.objects.remove(obj, do_unlink=True)
    log(f"exportado {target}")


def main():
    options = parse_args(sys.argv)
    with open(options["config"], encoding="utf-8") as file:
        config = json.load(file)
    out_dir = options["out-dir"]
    os.makedirs(out_dir, exist_ok=True)

    import_fbx(options["character"])
    body = Body(config["heightMeters"])
    frame = Frame(body)
    axis_at = spine_axis(body, frame)
    spec = config["shell"]

    shell, seam_x = build_shell(body, frame, spec, axis_at)
    atlas = Atlas(config["atlas"], config["textureSize"])
    face_island = unwrap_shell(body, frame, shell, atlas, seam_x, axis_at)
    seams = seam_lines(shell, face_island, atlas)
    hood = build_hood(body, frame, shell, config["hood"], atlas)
    # Bolsillo canguro: relieve en la misma malla (sin capa aparte, que se
    # cruzaba con el cuerpo al ajustar); el contorno va en la textura.
    pocket_relief(body, frame, shell, config["pocket"])
    fabric = material("hoodie-fabric", (0.9, 0.9, 0.9), 0.0, 0.92)
    metal = material("hoodie-metal", (0.75, 0.75, 0.78), 1.0, 0.35)
    cords, eyelets = build_cords(body, frame, shell, hood, config["cords"], atlas, [fabric, metal])
    # Canto del ruedo y los puños.
    apply_modifier(shell, "SOLIDIFY", thickness=body.m(spec["hem"]), offset=-1.0, use_rim=True, use_rim_only=True, use_even_offset=True)

    for obj in (shell, hood):
        obj.data.materials.clear()
        obj.data.materials.append(fabric)
        obj.data.materials.append(metal)
    for obj in (shell, hood):
        for polygon in obj.data.polygons:
            polygon.material_index = 0
    garment = join([shell, hood, cords], "Hoodie")
    for polygon in garment.data.polygons:
        polygon.use_smooth = True
    garment.data.update()
    log(f"prenda: {triangle_count(garment)} triángulos")

    # Reposo (T-pose) para el ajuste al avatar.
    export_static(frame, garment.data, os.path.join(out_dir, "hoodie-rest.glb"), [fabric, metal])

    # Pose de exhibición: pesos del cuerpo y brazos abajo.
    bones = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm"]
    transfer_weights(body, garment, bones, 24)
    blend_shoulders(body, garment, [-0.2, 0.75])
    # Skinning lineal hecho aquí (mismas matrices que fit.py usa para
    # deshacer una pose): cada vértice por la suma de las matrices de sus huesos.
    pose_body(body, config["displayPose"])
    deltas = bone_deltas(body)
    names = {group.index: base_name(group.name) for group in garment.vertex_groups}
    posed = garment.data.copy()
    for vertex, source in zip(posed.vertices, garment.data.vertices):
        blended = Matrix(((0, 0, 0, 0), (0, 0, 0, 0), (0, 0, 0, 0), (0, 0, 0, 0)))
        total = 0.0
        for group in source.groups:
            blended += deltas[names[group.group]] * group.weight
            total += group.weight
        if total > 0:
            vertex.co = (blended * (1 / total)) @ (garment.matrix_world @ source.co)
        else:
            vertex.co = garment.matrix_world @ source.co
    posed.update()
    log(f"pose de exhibición: {len(posed.vertices)} vértices")
    export_static(frame, posed, os.path.join(out_dir, "hoodie-display.glb"), [fabric, metal])
    reset_pose(body)

    # Medidas de la pose de exhibición (para config.mjs del pipeline).
    points = [frame.to_avatar(v.co) for v in posed.vertices]
    low = min(p.y for p in points)
    high = max(p.y for p in points)
    layout = {
        "size": config["textureSize"],
        "islands": atlas.islands,
        "rects": config["atlas"],
        "seams": seams,
        "hemHeight": spec["hemHeight"],
        "hemRib": spec["hemRib"],
        "cuffLength": spec["cuffLength"],
        "sleeveEnd": spec["sleeveEnd"],
        "armLength": (body.heads["LeftHand"] - body.heads["LeftArm"]).length / body.unit,
        "pocket": config["pocket"],
        "eyelets": [[round(p.x, 4), round(p.y, 4), round(p.z, 4)] for p in eyelets],
        "display": {"bottom": round(low, 4), "top": round(high, 4), "height": round(high - low, 4)},
    }
    with open(os.path.join(out_dir, "layout.json"), "w", encoding="utf-8") as file:
        json.dump(layout, file, indent=1)
    log(f"exhibición: alto {high - low:.3f} m (de {low:.3f} a {high:.3f})")


if __name__ == "__main__":
    main()
