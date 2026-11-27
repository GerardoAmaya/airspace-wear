// Datos fijos del avatar del Hangar 360° (Mixamo Y Bot, pnpm avatar:build).
// Los valores salen de assets/avatar/manifest.json; aquí se copian solo los
// nombres, porque el build de la web (Docker y Vercel) no ve la carpeta assets.

// URLs del GLB. El avatar no se versiona (licencia de Mixamo): en producción
// llega de Vercel Blob; en desarrollo, de public/avatar-local/ (ver .env.example).
export const AVATAR_URL = process.env.NEXT_PUBLIC_AVATAR_URL || '/avatar-local/avatar.glb';
export const AVATAR_LITE_URL = process.env.NEXT_PUBLIC_AVATAR_LITE_URL || AVATAR_URL.replace(/\.glb$/, '-lite.glb');

// Vestuario del maniquí (pnpm avatar:build, prendas generadas por el
// proyecto). Va aparte del avatar: si falta la URL (por ejemplo, en
// producción antes de subirlo con pnpm avatar:upload), el Hangar muestra el
// maniquí sin ropa y no ofrece el panel. En Blob cada archivo lleva su hash,
// así que el lite necesita su propia variable; sin ella se usa el hero.
const DEV = process.env.NODE_ENV !== 'production';
export const OUTFIT_URL = process.env.NEXT_PUBLIC_OUTFIT_URL || (DEV ? '/avatar-local/outfit.glb' : '');
export const OUTFIT_LITE_URL =
  process.env.NEXT_PUBLIC_OUTFIT_LITE_URL || (process.env.NEXT_PUBLIC_OUTFIT_URL ? OUTFIT_URL : DEV ? '/avatar-local/outfit-lite.glb' : '');

// El Hangar existe solo si hay avatar: en producción la copia local no se
// publica, así que sin NEXT_PUBLIC_AVATAR_URL la página responde 404 y la
// home no la enlaza. Next fija estas variables al compilar.
export const HANGAR_ENABLED = process.env.NODE_ENV !== 'production' || !!process.env.NEXT_PUBLIC_AVATAR_URL;

// Huesos de los pies con el nombre que les deja three.js (GLTFLoader quita
// los ":" de "mixamorig:LeftFoot"; es el threeName del manifiesto).
export const FOOT_BONES = { left: 'mixamorigLeftFoot', right: 'mixamorigRightFoot' } as const;

// Clips del GLB, en el orden de los chips de la página.
export const CLIPS = ['idle', 'walk', 'turn', 'pose'] as const;
export type Clip = (typeof CLIPS)[number];

// Caminar más tranquilo: velocidad del clip de Mixamo.
export const WALK_SPEED = 0.72;

// "Girar": una vuelta completa procedural (s por vuelta), sobre el reposo.
export const TURN_SECONDS = 4.6;

// Cruce entre clips (s).
export const CROSSFADE = 0.5;

// Alto del avatar (m), de la suela a la coronilla.
export const AVATAR_HEIGHT = 1.75;
