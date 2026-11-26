import type { Locale } from '@airspace/contracts';
import { getProduct, getProducts } from '@/lib/api';
import { BoardSection } from './BoardSection';
import type { BoardProduct } from './types';

// Catálogo de la home: tablero split-flap con vista 3D y el adelanto del
// Hangar 360° (portado de design/prototype/sections/departures). Componente de
// servidor: pide los sneakers en el orden destacado del dueño (el de la API) y
// el detalle de cada uno (etiquetas y tallas), todo en la caché de Next. La
// interacción y el 3D viven en BoardSection (cliente).
export async function HomeBoard({ locale }: { locale: Locale }) {
  const list = await getProducts({ locale, category: 'sneaker' });
  const details = await Promise.all(list.items.map((item) => getProduct(item.slug, locale).catch(() => null)));
  const products: BoardProduct[] = list.items.map((item, index) => ({
    slug: item.slug,
    reference: item.reference,
    name: item.name,
    brand: item.brand,
    colorway: item.colorway,
    tagline: item.tagline,
    tags: details[index]?.tags ?? [],
    price: item.price,
    availability: item.availability,
    sizeRange: item.sizeRange,
    sizes: details[index]?.sizes ?? [],
    model: item.model,
    accent: item.accent,
  }));
  if (!products.length) return null;
  return <BoardSection products={products} locale={locale} />;
}
