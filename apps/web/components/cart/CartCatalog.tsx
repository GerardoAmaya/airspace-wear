'use client';

import type { Price } from '@airspace/contracts';
import { createContext, type ReactNode, use } from 'react';

// Datos mínimos de cada producto para el carrito, en el idioma activo. Los
// arma el layout (servidor) desde la API y los pasa una sola vez.
export interface CartProductInfo {
  name: string;
  brand: string;
  detail: string | null;
  price: Price;
}

const CartCatalogContext = createContext<Record<string, CartProductInfo>>({});

export function CartCatalogProvider({ products, children }: { products: Record<string, CartProductInfo>; children: ReactNode }) {
  return <CartCatalogContext value={products}>{children}</CartCatalogContext>;
}

export const useCartCatalog = () => use(CartCatalogContext);
