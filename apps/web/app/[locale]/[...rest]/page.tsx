import { notFound } from 'next/navigation';

// Cualquier ruta que no existe dentro de un idioma muestra el 404 del sitio
// (not-found.tsx, traducido) con estado 404, no la página genérica de Next.
// El proxy también reescribe aquí las fichas de productos que no existen.
export default function CatchAll() {
  notFound();
}
