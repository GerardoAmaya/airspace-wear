'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useCartStore } from './cart-store';

// El panel del carrito está en todas las páginas pero empieza cerrado. Su
// código (y Motion, que anima su entrada) se carga aparte: se pide en reposo
// después de la carga y se monta la primera vez que el panel se abre. Así no
// pesa en el JS inicial ni retrasa el primer pintado.
const loadDrawer = () => import('./CartDrawer');
const CartDrawer = dynamic(() => loadDrawer().then((module) => module.CartDrawer), { ssr: false });

export function LazyCartDrawer() {
  const open = useCartStore((state) => state.open);
  const [mounted, setMounted] = useState(false);
  // Una vez abierto queda montado, para que AnimatePresence anime la salida.
  if (open && !mounted) setMounted(true);

  // ?cart=open abre el carrito al llegar: vuelta de Google al pagar y
  // "Volver" desde la página de pago de Stripe. El parámetro se quita de la
  // URL para que una recarga no lo vuelva a abrir.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('cart') !== 'open') return;
    url.searchParams.delete('cart');
    history.replaceState(history.state, '', url);
    useCartStore.getState().setOpen(true);
  }, []);

  useEffect(() => {
    const preload = () => void loadDrawer();
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(preload, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 2000);
    return () => clearTimeout(id);
  }, []);

  return mounted ? <CartDrawer /> : null;
}
