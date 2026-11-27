'use server';

import { type CheckoutIssue, type Locale, localeSchema } from '@airspace/contracts';
import { createCheckout } from './api';

// Acción del botón "Pagar" del carrito: reenvía el carrito (solo producto,
// talla y cantidad) a la API con la sesión, y devuelve la URL de Stripe
// Checkout o un código de error que el carrito traduce.
export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: 'unauthorized' | 'payments_unavailable' | 'invalid_cart' | 'rate_limited' | 'unavailable'; lines?: { index: number; issue: CheckoutIssue }[] };

// Limpieza mínima de lo que llega del navegador; la API valida en serio.
function cleanItems(raw: unknown): { slug: string; size?: string; quantity: number }[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null;
  const items = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const { slug, size, quantity } = entry as Record<string, unknown>;
    if (typeof slug !== 'string' || typeof quantity !== 'number' || (size !== undefined && typeof size !== 'string')) return null;
    items.push({ slug, ...(size ? { size } : {}), quantity });
  }
  return items;
}

export async function startCheckout(locale: Locale, rawItems: unknown): Promise<CheckoutResult> {
  const parsedLocale = localeSchema.safeParse(locale);
  // Solo los tres campos que la API acepta; el resto (si lo hubiera) no viaja.
  const items = cleanItems(rawItems);
  if (!parsedLocale.success || !items) return { ok: false, error: 'invalid_cart' };
  const result = await createCheckout(parsedLocale.data, items);
  if (result.ok) {
    // Solo se redirige a Stripe (nunca a otra parte).
    const url = new URL(result.data.url);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('stripe.com')) return { ok: false, error: 'unavailable' };
    return { ok: true, url: url.toString() };
  }
  switch (result.error) {
    case 'unauthorized':
      return { ok: false, error: 'unauthorized' };
    case 'service_unavailable':
      return { ok: false, error: 'payments_unavailable' };
    case 'rate_limited':
      return { ok: false, error: 'rate_limited' };
    case 'invalid_request': {
      const lines = (result.issues ?? []).flatMap((issue) => {
        const match = /^items\.(\d+)/.exec(issue.path);
        return match ? [{ index: Number(match[1]), issue: issue.message as CheckoutIssue }] : [];
      });
      return { ok: false, error: 'invalid_cart', lines };
    }
    default:
      return { ok: false, error: 'unavailable' };
  }
}
