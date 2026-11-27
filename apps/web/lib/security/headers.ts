// Cabeceras de seguridad de todas las respuestas de la web (next.config.ts).
// Se calculan al cargar la configuración: next dev y next build fijan
// NODE_ENV antes, y Vercel define VERCEL_ENV en el build.
//
// Content-Security-Policy, por directiva:
// - script-src: 'unsafe-inline' es obligatorio sin nonces. Next escribe
//   scripts en línea con los datos de React en cada página, y con Cache
//   Components el HTML es un cascarón prerenderizado igual para todos: un
//   nonce por petición obligaría a renderizar todo en cada visita. El riesgo
//   lo acotan el resto de directivas y que el sitio no inserta HTML ajeno
//   (docs/security.md). 'wasm-unsafe-eval': el decodificador Meshopt de los
//   modelos 3D es WebAssembly. En desarrollo, 'unsafe-eval' (React y HMR).
// - connect-src: la propia web (la API se llama desde el servidor, nunca
//   desde el navegador), blob: y data: (texturas de los GLB) y el Blob store
//   de Vercel con el avatar y el vestuario del Hangar.
// - img-src: fotos de perfil de Google (googleusercontent.com).
// - form-action: Google y Stripe por si un envío termina en una redirección.
// - frame-ancestors 'none': nadie puede enmarcar el sitio (clickjacking).
// - Vercel Toolbar (vercel.live) solo en las vistas previas.

const isDevelopment = process.env.NODE_ENV !== 'production';
const isPreview = process.env.VERCEL_ENV === 'preview';

const BLOB_STORE = 'https://*.public.blob.vercel-storage.com';
const GOOGLE_PHOTOS = 'https://*.googleusercontent.com';
const VERCEL_LIVE = 'https://vercel.live';

function csp(): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(isDevelopment ? ["'unsafe-eval'"] : []), ...(isPreview ? [VERCEL_LIVE] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', GOOGLE_PHOTOS, ...(isPreview ? [VERCEL_LIVE, 'https://vercel.com'] : [])],
    'font-src': ["'self'", 'data:', ...(isPreview ? [VERCEL_LIVE] : [])],
    'connect-src': ["'self'", 'blob:', 'data:', BLOB_STORE, ...(isDevelopment ? ['ws:', 'wss:'] : []), ...(isPreview ? [VERCEL_LIVE, 'wss://ws-us3.pusher.com'] : [])],
    'media-src': ["'self'", 'blob:', 'data:'],
    'worker-src': ["'self'", 'blob:'],
    'frame-src': isPreview ? [VERCEL_LIVE] : ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", 'https://accounts.google.com', 'https://checkout.stripe.com'],
    'frame-ancestors': ["'none'"],
    'manifest-src': ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

// Permisos del navegador: solo lo que usa la vista AR (cámara y sensores de
// WebXR en el propio sitio, pantalla completa); el resto, apagado.
const PERMISSIONS_POLICY = [
  'camera=(self)',
  'xr-spatial-tracking=(self)',
  'accelerometer=(self)',
  'gyroscope=(self)',
  'magnetometer=()',
  'fullscreen=(self)',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'browsing-topics=()',
].join(', ');

export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'Content-Security-Policy', value: csp() },
  // Dos años, subdominios y preload (los valores que pide hstspreload.org).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  // Las ventanas de otros sitios no conservan referencia a esta (Google y
  // Stripe se abren con redirecciones, no en ventanas emergentes).
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];
