import { revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';

// Refresca las lecturas en caché del catálogo y los créditos (lo llama el
// seed de la API al terminar). En producción exige REVALIDATE_SECRET en la
// cabecera x-revalidate-secret; en desarrollo basta con llamarlo en local.
export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  const isDevelopment = process.env.NODE_ENV !== 'production';
  if (secret ? request.headers.get('x-revalidate-secret') !== secret : !isDevelopment) {
    return NextResponse.json({ code: 'forbidden' }, { status: 403 });
  }
  // Vence de inmediato: la próxima visita ya trae los datos nuevos.
  revalidateTag('catalog', { expire: 0 });
  revalidateTag('credits', { expire: 0 });
  return NextResponse.json({ revalidated: ['catalog', 'credits'] });
}
