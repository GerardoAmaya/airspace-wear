import { NextResponse } from 'next/server';
import { fetchOrders } from '@/lib/orders/api';

// ¿La persona tiene pedidos pagados? Lo usa el robot para decidir si muestra
// el globo "¿Ya pediste? Pregúntame cómo va tu pedido." (solo tiene sentido
// con un pedido). Sin sesión, o si la API falla, la respuesta es false.
// Dato personal: nunca en caché.
export async function GET() {
  const result = await fetchOrders();
  const hasOrders = result.ok && result.data.items.some((order) => order.status === 'paid');
  return NextResponse.json({ hasOrders }, { headers: { 'Cache-Control': 'private, no-store' } });
}
