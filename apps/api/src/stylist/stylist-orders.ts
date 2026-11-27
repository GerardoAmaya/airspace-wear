import { Injectable } from '@nestjs/common';
import { type Locale, type OrderDetail, STYLIST_LIMITS, type StylistOrder } from '@airspace/contracts';
import { bearerToken, type SessionUser } from '../auth/session-auth.guard.js';
import { orderInclude, orderNumber, toDetail } from '../orders/orders.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Pedidos para el estilista: siempre del usuario de la sesión (cada consulta
// filtra por userId) y con la misma forma pública que "Mis pedidos" (el
// mapeo y el seguimiento simulado son los de src/orders, sin copiarlos).

// Pedidos que lee la herramienta get_my_orders (los más recientes).
export const TOOL_ORDER_LIMIT = 5;

const NUMBER = /^AS-(\d{4})-(\d{6,})$/;

@Injectable()
export class StylistOrders {
  constructor(private readonly prisma: PrismaService) {}

  // Sesión opcional: el estilista responde igual sin ella. Un token ausente,
  // mal formado, desconocido o vencido equivale a "sin sesión" (nunca 401).
  async sessionUser(authorization: string | string[] | undefined): Promise<SessionUser | null> {
    const token = bearerToken(authorization);
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { token },
      select: { expiresAt: true, user: { select: { id: true, name: true, email: true, image: true } } },
    });
    return session && session.expiresAt.getTime() > Date.now() ? session.user : null;
  }

  async recent(userId: string, locale: Locale, limit: number, now = new Date()): Promise<OrderDetail[]> {
    const rows = await this.prisma.order.findMany({ where: { userId }, include: orderInclude, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map((row) => toDetail(row, locale, now));
  }

  // Pedido por su número visible (AS-2026-000123), solo si es del usuario.
  async byNumber(userId: string, number: string, locale: Locale, now = new Date()): Promise<OrderDetail | null> {
    const match = NUMBER.exec(number.trim().toUpperCase());
    if (!match) return null;
    const seq = Number(match[2]);
    if (!Number.isSafeInteger(seq) || seq > 2_147_483_647) return null;
    const row = await this.prisma.order.findFirst({ where: { seq, userId }, include: orderInclude });
    // El año también debe coincidir (AS-2025-000123 no es AS-2026-000123).
    return row && orderNumber(row.seq, row.createdAt) === number.trim().toUpperCase() ? toDetail(row, locale, now) : null;
  }
}

// Tarjeta del pedido para la web (evento "orders"): el resumen público más
// la hora del siguiente paso.
export function toStylistOrder(order: OrderDetail): StylistOrder {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    itemCount: order.itemCount,
    total: order.total,
    trackingStage: order.trackingStage,
    nextStepAt: order.tracking?.nextAt ?? null,
  };
}

// Nombre con la marca delante, sin repetirla si el nombre ya la nombra
// ("Air Jordan 1", no "Jordan Air Jordan 1").
const withBrand = (brand: string, name: string) => (name.toLowerCase().includes(brand.toLowerCase()) ? name : `${brand} ${name}`);

// Vista compacta para el modelo (resultado de las herramientas): solo lo que
// necesita para responder, sin ids internos, correo ni datos de pago.
export function toModelOrder(order: OrderDetail, now: Date) {
  const tracking = order.tracking;
  const next = tracking?.steps.find((step) => step.state === 'upcoming') ?? null;
  return {
    number: order.number,
    placed_at: order.createdAt,
    status: order.status,
    items: order.items.map((item) => ({ name: withBrand(item.brand, item.name), detail: item.detail, size: item.size, quantity: item.quantity })),
    total: { amount: order.total.amountCents / 100, currency: order.total.currency },
    tracking: tracking
      ? {
          current_step: tracking.current,
          next_step: next?.key ?? null,
          next_step_in_minutes: tracking.nextAt ? Math.max(0, Math.ceil((Date.parse(tracking.nextAt) - now.getTime()) / 60_000)) : null,
          delivered: tracking.current === 'delivered',
        }
      : null,
    tracking_number: order.trackingNumber,
  };
}

export const MAX_ORDER_CARDS = STYLIST_LIMITS.orders;
