# Convierte archivos FBX de Mixamo a GLB con Blender en modo línea de comandos.
# Lo ejecuta scripts/avatar/build.mjs; no hace falta llamarlo a mano.
#
# Uso:
#   blender --background --factory-startup --python-exit-code 1 \
#     --python scripts/avatar/fbx_to_glb.py -- \
#     --skin entrada.fbx salida.glb \
#     --anim idle.fbx idle.glb [--anim ...]
#
# Cada archivo se convierte por separado, en una escena vacía, con los mismos
# ajustes de importación y exportación: así el esqueleto queda idéntico en
# todos y build.mjs puede copiar las animaciones al personaje por nombre de
# hueso. Blender solo convierte; juntar, escalar, recortar y comprimir lo hace
# build.mjs con gltf-transform, que no depende de la versión de Blender.

import sys

import bpy


def parse_args(argv):
    # Los argumentos propios van después de "--".
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    jobs = []
    index = 0
    while index < len(args):
        flag = args[index]
        if flag not in ("--skin", "--anim"):
            raise SystemExit(f"Argumento inesperado: {flag}")
        if index + 2 >= len(args):
            raise SystemExit(f"Faltan rutas después de {flag}")
        jobs.append({"skin": flag == "--skin", "source": args[index + 1], "target": args[index + 2]})
        index += 3
    if not jobs:
        raise SystemExit("No hay archivos para convertir.")
    return jobs


def supported_kwargs(operator, wanted):
    # Los nombres de las opciones cambian entre versiones de Blender: se pasan
    # solo las que el operador conoce, para que el script funcione en 4.x y 5.x.
    known = set(operator.get_rna_type().properties.keys())
    return {key: value for key, value in wanted.items() if key in known}


def fbx_importer():
    # El importador clásico (complemento en Python) es el probado con Mixamo.
    # Si una versión futura lo quita, se usa el nuevo importador nativo.
    for operator in (bpy.ops.import_scene.fbx, getattr(bpy.ops.wm, "fbx_import", None)):
        if operator is None:
            continue
        try:
            operator.get_rna_type()
            return operator
        except (KeyError, AttributeError, RuntimeError):
            continue
    raise SystemExit("Esta versión de Blender no tiene importador FBX.")


def convert(job):
    # Escena vacía con los valores de fábrica en cada archivo.
    bpy.ops.wm.read_factory_settings(use_empty=True)

    import_operator = fbx_importer()
    import_options = supported_kwargs(
        import_operator,
        {
            "filepath": job["source"],
            "use_anim": True,
            # Quita los huesos hoja "_End" (HeadTop_End, LeftToe_End...): no
            # deforman nada y sumarían canales de animación.
            "ignore_leaf_bones": True,
            # Conserva la orientación original de los huesos: la misma en el
            # personaje y en las animaciones.
            "automatic_bone_orientation": False,
            "use_custom_props": False,
        },
    )
    import_operator(**import_options)

    scene = bpy.context.scene
    armatures = [obj for obj in scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    if len(armatures) != 1:
        raise SystemExit(f"{job['source']}: se esperaba 1 esqueleto y hay {len(armatures)}.")
    if job["skin"] and not meshes:
        raise SystemExit(f"{job['source']}: no tiene malla. Descarga el personaje con 'With Skin'.")

    fps = scene.render.fps / scene.render.fps_base
    print(f"[fbx_to_glb] {job['source']}: {len(meshes)} mallas, {fps:.2f} fps")

    export_options = supported_kwargs(
        bpy.ops.export_scene.gltf,
        {
            "filepath": job["target"],
            "export_format": "GLB",
            "export_yup": True,
            "export_apply": False,
            "export_skins": True,
            "export_morph": False,
            "export_cameras": False,
            "export_lights": False,
            "export_extras": False,
            "export_materials": "EXPORT",
            # El personaje trae una animación de un fotograma (la T-pose): no
            # se exporta. Las animaciones exportan solo su acción.
            "export_animations": not job["skin"],
            "export_force_sampling": True,
            "export_anim_slide_to_zero": True,
            "export_reset_pose_bones": True,
            "export_def_bones": False,
            # Sin compresión aquí: build.mjs aplica Meshopt al final.
            "export_draco_mesh_compression_enable": False,
        },
    )
    bpy.ops.export_scene.gltf(**export_options)


def main():
    for job in parse_args(sys.argv):
        convert(job)


main()
