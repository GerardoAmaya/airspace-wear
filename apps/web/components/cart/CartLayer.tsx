import type { Locale } from '@airspace/contracts';
import { getProducts } from '@/lib/api';
import { type CartProductInfo, CartCatalogProvider } from './CartCatalog';
import { LazyCartDrawer } from './LazyCartDrawer';

// Panel del carrito con los datos del catálogo en el idioma activo (lectura
// en caché de la API, la misma para todas las páginas).
export async function CartLayer({ locale }: { locale: Locale }) {
  const { items } = await getProducts({ locale });
  const products: Record<string, CartProductInfo> = Object.fromEntries(
    items.map((item) => [item.slug, { name: item.name, brand: item.brand.name, detail: item.colorway ?? item.edition, price: item.price }]),
  );
  return (
    <CartCatalogProvider products={products}>
      <LazyCartDrawer />
    </CartCatalogProvider>
  );
}
