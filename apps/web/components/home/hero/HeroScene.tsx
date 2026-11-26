'use client';

import type { Model3D } from '@airspace/contracts';
import { Shadow, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type RefObject, Suspense, useEffect, useMemo, useRef } from 'react';
import { Box3, type Group, type Mesh, type MeshBasicMaterial, NeutralToneMapping, type PlaneGeometry, Vector3 } from 'three';
import { StudioEnvironment } from '@/components/three/kit/StudioEnvironment';
import { LIGHT_PRESETS, StudioLights } from '@/components/three/kit/StudioLights';
import { useThemeStore } from '@/lib/theme';
import { FOV, type ShoeDims, type Vec3 } from './geometry';
import type { HeroRig, OnSceneReady } from './rig';

// Escena 3D de la portada. No decide nada: en cada cuadro compone la pose
// que GSAP anima (rig.pose) con la entrada, la flotación, el puntero y el
// giro manual, mueve cámara y zapato, y le pasa a la interfaz una función
// de proyección para que mueva la retícula, el halo y los rótulos.

interface SceneProps {
  model: Model3D;
  lite: boolean;
  active: boolean;
  reducedMotion: boolean;
  baseYaw: number;
  rig: RefObject<HeroRig>;
  onReady: OnSceneReady;
}

export default function HeroScene(props: SceneProps) {
  // Inactiva (otro lienzo se ve más): no dibuja. Con movimiento reducido no
  // hay ciclo de dibujo: cada cambio pide un cuadro.
  const frameloop = !props.active ? 'never' : props.reducedMotion ? 'demand' : 'always';
  return (
    <Canvas
      dpr={props.lite ? 1 : [1, 1.5]}
      frameloop={frameloop}
      camera={{ fov: FOV, near: 0.01, far: 20, position: [0, 0.02, 1] }}
      gl={{ antialias: !props.lite, alpha: true, toneMapping: NeutralToneMapping, powerPreference: 'high-performance' }}
    >
      <StudioEnvironment />
      <StudioLights />
      <Suspense fallback={null}>
        <Sneaker {...props} />
      </Suspense>
    </Canvas>
  );
}

function Sneaker({ model, lite, baseYaw, rig, onReady }: SceneProps) {
  const { scene } = useGLTF(lite ? model.liteUrl : model.heroUrl);
  // Copia propia: el mismo GLB puede estar en otro lienzo (catálogo).
  const object = useMemo(() => scene.clone(true), [scene]);
  // Caja precisa (por vértice) para girar sobre el centro real.
  const dims = useMemo<ShoeDims>(() => {
    const box = new Box3().setFromObject(object, true);
    return { length: box.max.x - box.min.x, height: box.max.y - box.min.y, halfWidth: Math.max(Math.abs(box.min.z), Math.abs(box.max.z)) };
  }, [object]);

  const sneaker = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const shadowGroup = useRef<Group>(null);
  const shadowMesh = useRef<Mesh<PlaneGeometry, MeshBasicMaterial>>(null);
  const theme = useThemeStore((state) => state.theme);
  const invalidate = useThree((state) => state.invalidate);
  const scratch = useMemo(() => ({ vector: new Vector3(), out: { x: 0, y: 0 } }), []);

  const get = useThree((state) => state.get);
  // Cuadros ya dibujados: el aviso de "listo" espera al segundo, cuando los
  // shaders ya se compilaron y las texturas ya subieron a la GPU. Así la
  // pausa de esa primera vez ocurre con el lienzo todavía oculto (detrás del
  // póster) y nunca en medio de la entrada del zapato.
  const drawn = useRef(0);

  useEffect(() => {
    const current = rig.current;
    current.invalidate = invalidate;
    // Compila los materiales por adelantado (mismo trabajo, antes de mostrar).
    const { gl, scene: root, camera } = get();
    gl.compile(root, camera);
    invalidate();
    return () => {
      current.invalidate = null;
    };
  }, [rig, invalidate, get]);

  // Si la escena se vuelve a montar con el modelo en caché, avisa otra vez.
  useEffect(() => {
    drawn.current = 0;
  }, [onReady, dims]);

  // Un cambio de tema cambia la sombra: pide un cuadro (movimiento reducido).
  useEffect(() => invalidate(), [theme, invalidate]);

  useFrame((state, delta) => {
    const group = sneaker.current;
    const model3d = inner.current;
    if (!group || !model3d) return;
    const { pose, intro, spin, pointer, reducedMotion } = rig.current;
    // Defensa: un valor no finito (gesto o tween interrumpido) se descarta en
    // vez de dejar el zapato y los rótulos fuera de cuadro.
    if (!Number.isFinite(spin.yaw) || !Number.isFinite(spin.tilt)) spin.yaw = spin.tilt = 0;
    if (!Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) pointer.x = pointer.y = 0;
    if (![pose.x, pose.y, pose.z, pose.yaw, pose.pitch, pose.bank, pose.scale, pose.cx, pose.cy, pose.cz, pose.tx, pose.ty, pose.tz].every(Number.isFinite)) return;
    const time = state.clock.elapsedTime;
    const dt = Math.min(Math.max(delta, 0.001), 0.064);
    const follow = 1 - Math.exp(-dt * 3.2);
    pointer.x += (pointer.targetX - pointer.x) * follow;
    pointer.y += (pointer.targetY - pointer.y) * follow;

    // Flotación, deriva y paralaje solo en la portada (idle) y con movimiento.
    const idle = reducedMotion ? 0 : pose.idle;
    const float = Math.sin(time * 1.15) * 0.006 * idle;
    const drift = Math.sin(time * 0.3) * 0.18 * idle;
    group.position.set(pose.x + intro.x * idle, pose.y + float + intro.y * idle, pose.z + intro.z * idle);
    group.rotation.set(
      pose.bank + spin.tilt + (intro.bank + pointer.y * 0.08) * idle,
      pose.yaw + spin.yaw + (intro.yaw + drift + pointer.x * 0.2) * idle,
      pose.pitch + (intro.pitch + Math.sin(time * 0.8) * 0.01) * idle,
    );
    group.scale.setScalar(pose.scale);
    group.updateMatrixWorld(true);

    // Sombra de contacto: en el piso bajo el zapato; se desvanece al elevarse.
    const lift = Math.max(0, group.position.y);
    if (shadowGroup.current) {
      shadowGroup.current.position.set(group.position.x, -dims.height / 2 + 0.0005, group.position.z);
      shadowGroup.current.rotation.y = group.rotation.y;
      shadowGroup.current.scale.setScalar(pose.scale * (1 + lift * 2));
    }
    const material = shadowMesh.current?.material;
    if (material) material.opacity = LIGHT_PRESETS[theme].shadow * pose.shadow * Math.max(0, 1 - lift * 6);

    const camera = state.camera;
    camera.position.set(pose.cx + pointer.x * 0.025 * idle, pose.cy - pointer.y * 0.018 * idle, pose.cz);
    camera.lookAt(pose.tx, pose.ty, pose.tz);
    camera.updateMatrixWorld();

    // Giro real del zapato (crece al arrastrar hacia la derecha).
    const degrees = ((group.rotation.y - baseYaw) * 180) / Math.PI;
    rig.current.turn = Math.round(((degrees % 360) + 360) % 360) % 360;

    if (drawn.current < 2) {
      drawn.current += 1;
      if (drawn.current === 2) onReady(dims);
      // Con movimiento reducido (frameloop "demand") hace falta pedir el segundo cuadro.
      else state.invalidate();
    }

    const onFrame = rig.current.onFrame;
    if (onFrame) {
      const { width, height } = state.size;
      const project = (point: Vec3) => {
        const vector = scratch.vector.set(point[0], point[1], point[2]);
        model3d.localToWorld(vector);
        vector.project(camera);
        scratch.out.x = ((vector.x + 1) / 2) * width;
        scratch.out.y = ((1 - vector.y) / 2) * height;
        return scratch.out;
      };
      const distance = camera.position.distanceTo(group.position);
      onFrame(project, distance);
    }
  });

  return (
    <>
      <group ref={sneaker}>
        <group ref={inner} position={[0, -dims.height / 2, 0]}>
          <primitive object={object} />
        </group>
      </group>
      <group ref={shadowGroup}>
        <Shadow ref={shadowMesh} scale={[0.42, 0.2, 1]} rotation-x={-Math.PI / 2} color="black" colorStop={0} opacity={0} fog={false} />
      </group>
    </>
  );
}
