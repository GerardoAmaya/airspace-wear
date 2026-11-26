'use client';

import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Entorno de estudio generado en local (sin descargar HDR). Se adjunta a
// scene.environment; R3F lo libera al desmontar.
export function StudioEnvironment() {
  const gl = useThree((state) => state.gl);
  const texture = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return environment;
  }, [gl]);
  return <primitive object={texture} attach="environment" />;
}
