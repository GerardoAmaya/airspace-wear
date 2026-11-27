import type { Locale, OrderDetail, OrderSummary } from '@airspace/contracts';
import type { Prisma } from '../generated/prisma/client.js';
import { computeTracking } from './tracking.js';

// Conversión de pedidos de la base a la forma pública de los contratos.

export const orderInclude = { items: { orderBy: { sortOrder: 'asc' } } } satisfies Prisma.OrderInclude;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

// Número visible: AS-<año de creación (UTC)>-<correlativo de 6 dígitos o más>.
export function orderNumber(seq: number, createdAt: Date): string {
  return `AS-${createdAt.getUTCFullYear()}-${String(seq).padStart(6, '0')}`;
}

export function toSummary(row: OrderRow, now: Date): OrderSummary {
  const tracking = row.status === 'paid' && row.paidAt ? computeTracking(row.paidAt, now) : null;
  return {
    id: row.id,
    number: orderNumber(row.seq, row.createdAt),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
    total: { amountCents: row.totalCents, currency: row.currency },
    trackingStage: tracking?.current ?? null,
  };
}

export function toDetail(row: OrderRow, locale: Locale, now: Date, resumeUrl: string | null = null): OrderDetail {
  const summary = toSummary(row, now);
  return {
    ...summary,
    locale,
    subtotal: { amountCents: row.subtotalCents, currency: row.currency },
    items: row.items.map((item) => ({
      slug: item.slug,
      brand: item.brand,
      name: locale === 'en' ? item.nameEn : item.nameEs,
      detail: (locale === 'en' ? item.detailEn : item.detailEs) ?? null,
      size: item.size,
      quantity: item.quantity,
      unitPrice: { amountCents: item.unitPriceCents, currency: row.currency },
      lineTotal: { amountCents: item.unitPriceCents * item.quantity, currency: row.currency },
      image: item.imageDarkUrl && item.imageLightUrl ? { dark: item.imageDarkUrl, light: item.imageLightUrl } : null,
    })),
    trackingNumber: row.status === 'paid' ? row.trackingNumber : null,
    tracking: row.status === 'paid' && row.paidAt ? computeTracking(row.paidAt, now) : null,
    resumeUrl: row.status === 'pending' ? resumeUrl : null,
  };
}
