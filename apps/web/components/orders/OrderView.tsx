import type { Locale } from '@airspace/contracts';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { GOOGLE_LOGIN_ENABLED } from '@/lib/auth/config';
import { fetchOrder } from '@/lib/orders/api';
import { Reveal } from '@/components/motion/Reveal';
import { formatPrice } from '@/lib/price';
import { LocalTime } from './LocalTime';
import { OrderItems } from './OrderItems';
import { OrderTitle } from './OrderTitle';
import { PaidBanner } from './PaidBanner';
import { PaidReturn } from './PaidReturn';
import { SignInGate } from './SignInGate';
import { StatusChip } from './StatusChip';
import { TrackingTimeline } from './TrackingTimeline';
import styles from './orders.module.css';

// UUID del pedido (lo demás ni se pregunta a la API).
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Página de un pedido: confirmación al volver de Stripe, productos, totales
// y seguimiento. Lee la sesión: va dentro de un Suspense.
export async function OrderView({ id, locale, returned }: { id: string; locale: Locale; returned: boolean }) {
  const t = await getTranslations('Orders');
  if (!ORDER_ID.test(id)) notFound();
  const result = await fetchOrder(id, locale);
  if (!result.ok) {
    if (result.error === 'unauthorized') return <SignInGate googleEnabled={GOOGLE_LOGIN_ENABLED} />;
    if (result.error === 'not_found' || result.error === 'invalid_request') notFound();
    return (
      <p className={styles.message} role="alert">
        {t('loadError')}
      </p>
    );
  }
  const order = result.data;

  return (
    <div className={styles.detail}>
      {returned && <PaidReturn status={order.status} />}
      {returned && order.status === 'paid' && <PaidBanner />}
      {returned && order.status === 'pending' && (
        <section className={styles.banner} role="status">
          <p>{t('confirming')}</p>
        </section>
      )}

      <header className={styles.detailHead}>
        <div className={styles.detailTitleGroup}>
          <p className={styles.kicker}>{t('orderKicker')}</p>
          <OrderTitle id={order.id} number={order.number} />
          <p className={styles.meta}>
            {t.rich('placedOn', { date: () => <LocalTime iso={order.createdAt} format="dateTime" /> })}
          </p>
        </div>
        <StatusChip status={order.status} stage={order.trackingStage} />
      </header>

      {order.status === 'pending' && !returned && (
        <section className={styles.banner} role="note">
          <p>{t('pendingNote')}</p>
          {order.resumeUrl && (
            <a href={order.resumeUrl} className={styles.primaryButton}>
              {t('resume')}
            </a>
          )}
        </section>
      )}
      {order.status === 'expired' && (
        <section className={styles.banner} role="note">
          <p>{t('expiredNote')}</p>
        </section>
      )}

      <Reveal className={styles.detailBody}>
      {order.tracking && <TrackingTimeline tracking={order.tracking} trackingNumber={order.trackingNumber} />}

      <section className={styles.itemsPanel} aria-labelledby="order-items">
        <h2 id="order-items" className={styles.sectionTitle}>
          {t('itemsTitle')}
        </h2>
        <OrderItems items={order.items} />
        <dl className={styles.totals}>
          <div>
            <dt>{t('subtotal')}</dt>
            <dd>{formatPrice(order.subtotal, locale)}</dd>
          </div>
          <div>
            <dt>{t('shipping')}</dt>
            <dd>{t('shippingFree')}</dd>
          </div>
          <div data-total>
            <dt>{t('total')}</dt>
            <dd>{formatPrice(order.total, locale)}</dd>
          </div>
        </dl>
      </section>

      <p>
        <Link href="/orders" className={styles.backLink}>
          {t('back')}
        </Link>
      </p>
      </Reveal>
    </div>
  );
}
