import { hasLocale } from 'next-intl';
import { type NextRequest, NextResponse } from 'next/server';
import { buildStylistData } from '@/components/home/stylist/stylist-data';
import { routing } from '@/i18n/routing';

// Datos del panel flotante del estilista (guion de respaldo, ideas sugeridas
// y catálogo para las tarjetas) en el idioma pedido. El panel los pide la
// primera vez que se abre (o al pasar sobre el robot), no con cada página:
// así no pesan en el HTML de todo el sitio. El navegador nunca llama a la API
// directo para leer el catálogo; esta ruta lo hace desde el servidor.
export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get('locale');
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  try {
    const { script, chips, catalog } = await buildStylistData(locale);
    return NextResponse.json({ script, chips, catalog }, { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' } });
  } catch {
    return NextResponse.json({ code: 'unavailable' }, { status: 503 });
  }
}
