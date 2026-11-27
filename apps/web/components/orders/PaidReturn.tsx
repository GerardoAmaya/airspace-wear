'use client';

import type { OrderStatus } from '@airspace/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCartStore } from '@/components/cart/cart-store';

// Vuelta desde Stripe (?paid=1). Si el pedido ya está pagado, vacía el
// carrito local (solo entonces: si el pago no se completó, el carrito sigue
// ahí). Si todavía figura pendiente (el aviso de Stripe puede tardar unos
// segundos), vuelve a pedir los datos cada 3 s, hasta 10 veces.
const RETRY_MS = 3000;
const MAX_RETRIES = 10;

export function PaidReturn({ status }: { status: OrderStatus }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (status === 'paid') useCartStore.getState().clear();
  }, [status]);

  useEffect(() => {
    if (status !== 'pending' || attempt >= MAX_RETRIES) return;
    const timer = setTimeout(() => {
      setAttempt((current) => current + 1);
      router.refresh();
    }, RETRY_MS);
    return () => clearTimeout(timer);
  }, [status, attempt, router]);

  return null;
}
