// Geometría de cámara del Hangar 360° con avatar. Mismo modelo que el
// tablero (components/home/board/rig.ts): la cámara orbita un punto del
// avatar y un desplazamiento de lente (setViewOffset) lo ubica en (ax, ay)
// del canvas. El piso del mundo es y = 0: ahí apoyan las suelas.

export type AvatarView = 'full' | 'feet';

export const FOV = 26;
export const TAN_HALF = Math.tan(((FOV / 2) * Math.PI) / 180);

// Pose de cámara: ancla en píxeles (ax, ay), escala en píxeles por metro (k),
// elevación en grados y altura del punto que mira (target, m).
export interface StagePose {
  ax: number;
  ay: number;
  k: number;
  elevation: number;
  target: number;
}

// Cuerpo entero (cabe 1,95 m de alto y 1,1 m de ancho) o primer plano de los
// pies (unos 30 cm de alto y 55 cm de ancho).
// `wide`: al caminar, de la punta de adelante al talón de atrás hay hasta
// 1,2 m (de perfil); el primer plano se abre para que los dos zapatos
// queden en cuadro en todo el ciclo y a cualquier giro.
export const VIEWS: Record<AvatarView, (width: number, height: number, wide?: boolean) => StagePose> = {
  full: (width, height) => ({
    ax: width / 2,
    ay: height * 0.5,
    k: Math.min((height * 0.84) / 1.95, (width * 0.9) / 1.1),
    elevation: 5,
    target: 0.9,
  }),
  feet: (width, height, wide = false) => ({
    ax: width / 2,
    ay: height * (wide ? 0.6 : 0.56),
    k: Math.min((height * 0.62) / (wide ? 0.46 : 0.3), (width * 0.84) / (wide ? 1.2 : 0.55)),
    elevation: 12,
    target: wide ? 0.14 : 0.08,
  }),
};

const rad = (degrees: number) => (degrees * Math.PI) / 180;

// Los anillos SVG de la plataforma se proyectan con una transformación CSS
// 3D que replica la cámara: su plano coincide con el piso (y = 0). El SVG
// mide 600 x 600 unidades y representa `diameter` metros.
export function ringTransform(pose: StagePose, size: { width: number; height: number }, baseK: number): string {
  const focal = size.height / 2 / TAN_HALF;
  const elevation = rad(pose.elevation);
  const floor = -pose.target;
  const offsetY = -pose.k * floor * Math.cos(elevation);
  const offsetZ = pose.k * floor * Math.sin(elevation);
  const tilt = 90 - pose.elevation;
  const scale = pose.k / baseK;
  return (
    `translate(${pose.ax.toFixed(1)}px, ${pose.ay.toFixed(1)}px) perspective(${focal.toFixed(1)}px) ` +
    `translate3d(0, ${offsetY.toFixed(2)}px, ${offsetZ.toFixed(2)}px) rotateX(${tilt.toFixed(3)}deg) scale(${scale.toFixed(4)})`
  );
}
