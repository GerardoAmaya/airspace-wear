import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { limitResponse } from '@/lib/security/rate-limit';

// Compara en tiempo constante (sobre el SHA-256 de cada valor, así el largo
// tampoco se filtra por el tiempo de respuesta).
function sameSecret(received: string | null, expected: string): boolean {
  if (!received) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

// Refresca las lecturas en caché del catálogo y los créditos (lo llama el
// seed de la API al terminar). En producción exige REVALIDATE_SECRET en la
// cabecera x-revalidate-secret; en desarrollo basta con llamarlo en local.
export async function POST(request: NextRequest) {
  const limited = limitResponse('revalidate', request);
  if (limited) return limited;
  const secret = process.env.REVALIDATE_SECRET;
  const isDevelopment = process.env.NODE_ENV !== 'production';
  if (secret ? !sameSecret(request.headers.get('x-revalidate-secret'), secret) : !isDevelopment) {
    return NextResponse.json({ code: 'forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  // Vence de inmediato: la próxima visita ya trae los datos nuevos.
  revalidateTag('catalog', { expire: 0 });
  revalidateTag('credits', { expire: 0 });
  return NextResponse.json({ revalidated: ['catalog', 'credits'] }, { headers: { 'Cache-Control': 'no-store' } });
}
