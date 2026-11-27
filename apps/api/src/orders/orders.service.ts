import { randomInt } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  ApiError,
  CheckoutIssue,
  CreateCheckoutRequest,
  CreateCheckoutResponse,
  Locale,
  OrderDetail,
  OrderList,
} from '@airspace/contracts';
import type { SessionUser } from '../auth/session-auth.guard.js';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type CheckoutSession, type CheckoutSessionParams, StripeGateway, type StripeEvent } from '../payments/stripe.gateway.js';
import { orderInclude, orderNumber, toDetail, toSummary } from './orders.mapper.js';

// La sesión de pago de Stripe vence a los 30 minutos (el mínimo que admite).
const CHECKOUT_TTL_S = 30 * 60;
// Idioma de la página de pago de Stripe (español latinoamericano).
const STRIPE_LOCALE: Record<Locale, CheckoutSessionParams['locale']> = { es: 'es-419', en: 'en' };

const serviceUnavailable = () => new HttpException({ code: 'service_unavailable' } satisfies ApiError, HttpStatus.SERVICE_UNAVAILABLE);

// Número de guía ficticio: ASW y 12 dígitos al azar.
function fakeTrackingNumber(): string {
  return `ASW${String(randomInt(0, 1_000_000)).padStart(6, '0')}${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
}

// Nombre para Stripe con la marca delante, sin repetirla si el nombre ya la trae.
const withBrand = (brand: string, name: string) => (name.toLowerCase().startsWith(brand.toLowerCase()) ? name : `${brand} ${name}`);

interface PricedLine {
  productId: number;
  slug: string;
  brand: string;
  nameEs: string;
  nameEn: string;
  detailEs: string | null;
  detailEn: string | null;
  size: string | null;
  // Etiqueta para Stripe, por ejemplo "EU 42" o "M".
  sizeCaption: string | null;
  unitPriceCents: number;
  currency: string;
  quantity: number;
  imageDarkUrl: string | null;
  imageLightUrl: string | null;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeGateway,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // POST /v1/checkout: valida el carrito contra el catálogo del servidor,
  // crea el pedido pendiente y su sesión de Stripe Checkout.
  async createCheckout(user: SessionUser, request: CreateCheckoutRequest): Promise<CreateCheckoutResponse> {
    if (!this.stripe.enabled) throw serviceUnavailable();
    const lines = await this.priceLines(request);
    const currency = lines[0]!.currency;
    const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);

    const order = await this.prisma.order.create({
      data: {
        userId: user.id,
        currency,
        subtotalCents,
        totalCents: subtotalCents,
        locale: request.locale,
        items: {
          create: lines.map((line, index) => ({
            productId: line.productId,
            slug: line.slug,
            brand: line.brand,
            nameEs: line.nameEs,
            nameEn: line.nameEn,
            detailEs: line.detailEs,
            detailEn: line.detailEn,
            size: line.size,
            unitPriceCents: line.unitPriceCents,
            quantity: line.quantity,
            imageDarkUrl: line.imageDarkUrl,
            imageLightUrl: line.imageLightUrl,
            sortOrder: index,
          })),
        },
      },
    });

    let session: CheckoutSession;
    try {
      session = await this.stripe.createCheckoutSession(this.sessionParams(order.id, orderNumber(order.seq, order.createdAt), user, request.locale, lines), order.id);
    } catch (error) {
      // Sin sesión de pago el pedido no sirve: se borra y se responde 503.
      this.logger.error(`Stripe no creó la sesión de pago: ${error instanceof Error ? error.message : String(error)}`);
      await this.prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
      throw serviceUnavailable();
    }
    if (!session.url) {
      await this.prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
      throw serviceUnavailable();
    }
    await this.prisma.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.id } });
    return { orderId: order.id, url: session.url };
  }

  // GET /v1/orders: pedidos del usuario, el más reciente primero.
  async list(userId: string): Promise<OrderList> {
    const rows = await this.prisma.order.findMany({ where: { userId }, include: orderInclude, orderBy: { createdAt: 'desc' }, take: 100 });
    const now = new Date();
    return { items: rows.map((row) => toSummary(row, now)) };
  }

  // GET /v1/orders/:id: solo si es del usuario (si no, 404, igual que si no
  // existiera). Un pedido todavía pendiente se verifica con Stripe, por si el
  // webhook no llegó (por ejemplo, en local sin stripe listen).
  async detail(userId: string, id: string, locale: Locale): Promise<OrderDetail> {
    let row = await this.prisma.order.findFirst({ where: { id, userId }, include: orderInclude });
    if (!row) throw new NotFoundException();
    let resumeUrl: string | null = null;
    if (row.status === 'pending' && row.stripeCheckoutSessionId && this.stripe.enabled) {
      try {
        const session = await this.stripe.retrieveCheckoutSession(row.stripeCheckoutSessionId);
        if (await this.applySession(session)) row = (await this.prisma.order.findFirst({ where: { id, userId }, include: orderInclude }))!;
        else if (session.status === 'open') resumeUrl = session.url;
      } catch (error) {
        // Si Stripe no responde, se muestra el pedido como está.
        this.logger.warn(`No se pudo verificar el pago con Stripe: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return toDetail(row, locale, new Date(), resumeUrl);
  }

  // Eventos del webhook (firma ya verificada). Los demás tipos se ignoran.
  async handleEvent(event: StripeEvent): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.expired':
        await this.applySession(event.data.object);
        return;
      default:
        return;
    }
  }

  // Aplica el estado de una sesión de Stripe a su pedido. Idempotente: solo
  // un pedido pendiente cambia, así un evento repetido (Stripe reintenta) o
  // la verificación al abrir el pedido no lo pagan dos veces ni cambian su
  // número de guía. Devuelve true si el pedido cambió.
  private async applySession(session: CheckoutSession): Promise<boolean> {
    const orderId = session.client_reference_id ?? session.metadata?.orderId;
    if (!orderId) return false;
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, totalCents: true, currency: true, stripeCheckoutSessionId: true } }).catch(() => null);
    // Una sesión que no es la del pedido (o un id que no es UUID) no toca nada.
    if (!order || order.stripeCheckoutSessionId !== session.id || order.status !== 'pending') return false;

    if (session.status === 'complete' && session.payment_status === 'paid') {
      // El importe cobrado tiene que ser el del pedido.
      if (session.amount_total !== order.totalCents || session.currency?.toUpperCase() !== order.currency) {
        this.logger.error(`El importe pagado no coincide con el pedido ${order.id}`);
        return false;
      }
      const { count } = await this.prisma.order.updateMany({
        where: { id: order.id, status: 'pending' },
        data: { status: 'paid', paidAt: new Date(), trackingNumber: fakeTrackingNumber() },
      });
      return count > 0;
    }
    if (session.status === 'expired') {
      const { count } = await this.prisma.order.updateMany({ where: { id: order.id, status: 'pending' }, data: { status: 'expired' } });
      return count > 0;
    }
    return false;
  }

  // Precios, nombres, tallas y existencias desde la base (nunca del
  // navegador). Si alguna línea no sirve, 400 con un issue por línea.
  private async priceLines(request: CreateCheckoutRequest): Promise<PricedLine[]> {
    const products = await this.prisma.product.findMany({
      where: { slug: { in: [...new Set(request.items.map((item) => item.slug))] } },
      include: {
        brand: { select: { name: true } },
        translations: true,
        sizes: { orderBy: { sortOrder: 'asc' } },
        model: { select: { posterDarkUrl: true, posterLightUrl: true } },
      },
    });
    const bySlug = new Map(products.map((product) => [product.slug, product]));
    const issues: { path: string; message: CheckoutIssue }[] = [];
    const seen = new Set<string>();
    const lines: PricedLine[] = [];

    request.items.forEach((item, index) => {
      const fail = (message: CheckoutIssue) => issues.push({ path: `items.${index}`, message });
      const product = bySlug.get(item.slug);
      if (!product || !product.published) return fail('unknown_product');
      if (product.availability === 'coming_soon') return fail('unavailable');

      // Sin talla solo si el producto tiene una sola (talla única o balón).
      const size = item.size === undefined ? (product.sizes.length === 1 ? product.sizes[0] : undefined) : product.sizes.find((candidate) => candidate.label === item.size);
      if (product.sizes.length > 0 && !size) return fail('invalid_size');
      if (product.sizes.length === 0 && item.size !== undefined) return fail('invalid_size');
      if (size && (size.stock <= 0 || item.quantity > size.stock)) return fail('out_of_stock');

      const key = `${product.id}|${size?.label ?? ''}`;
      if (seen.has(key)) return fail('duplicate_line');
      seen.add(key);

      const es = product.translations.find((row) => row.locale === 'es');
      const en = product.translations.find((row) => row.locale === 'en') ?? es;
      if (!es || !en) return fail('unavailable');
      const label = size && size.system !== 'ONE' ? size.label : null;
      lines.push({
        productId: product.id,
        slug: product.slug,
        brand: product.brand.name,
        nameEs: es.name,
        nameEn: en.name,
        detailEs: es.colorway ?? es.edition,
        detailEn: en.colorway ?? en.edition,
        size: label,
        sizeCaption: label ? (size?.system === 'EU' ? `EU ${label}` : label) : null,
        unitPriceCents: product.priceCents,
        currency: product.currency,
        quantity: item.quantity,
        imageDarkUrl: product.model?.posterDarkUrl ?? product.imageUrl,
        imageLightUrl: product.model?.posterLightUrl ?? product.imageUrl,
      });
    });

    // Un solo cobro admite una sola moneda (hoy todo el catálogo es USD).
    if (!issues.length && new Set(lines.map((line) => line.currency)).size > 1) issues.push({ path: 'items', message: 'unavailable' });
    if (issues.length) throw new HttpException({ code: 'invalid_request', issues } satisfies ApiError, HttpStatus.BAD_REQUEST);
    return lines;
  }

  private sessionParams(orderId: string, number: string, user: SessionUser, locale: Locale, lines: PricedLine[]): CheckoutSessionParams {
    const web = this.config.payments.webUrl;
    // Stripe muestra imágenes solo con URLs públicas (https); en local se omiten.
    const image = (url: string | null) => (url && web.startsWith('https://') ? [new URL(url, web).toString()] : undefined);
    return {
      mode: 'payment',
      // Solo tarjeta (y las billeteras que la usan, como Apple Pay): en una
      // demo de prueba los demás métodos (cripto, banco, Klarna) solo estorban.
      allowed_payment_method_types: ['card'],
      submit_type: 'pay',
      client_reference_id: orderId,
      customer_email: user.email,
      locale: STRIPE_LOCALE[locale],
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_S,
      metadata: { orderId, orderNumber: number },
      payment_intent_data: { metadata: { orderId, orderNumber: number } },
      line_items: lines.map((line) => {
        const description = [locale === 'en' ? line.detailEn : line.detailEs, line.sizeCaption].filter(Boolean).join(' · ');
        return {
          quantity: line.quantity,
          price_data: {
            currency: line.currency.toLowerCase(),
            unit_amount: line.unitPriceCents,
            product_data: {
              name: withBrand(line.brand, locale === 'en' ? line.nameEn : line.nameEs),
              ...(description ? { description } : {}),
              ...(image(line.imageDarkUrl) ? { images: image(line.imageDarkUrl) } : {}),
              metadata: { slug: line.slug },
            },
          },
        };
      }),
      // Vuelve a la página del pedido (que confirma el pago) o al carrito.
      success_url: `${web}/${locale}/orders/${orderId}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${web}/${locale}/catalog?cart=open`,
    };
  }
}
