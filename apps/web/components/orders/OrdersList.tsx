import type { Locale } from '@airspace/contracts';
import { getTranslations } from 'next-intl/server';
import { ViewTransition } from 'react';
import { Reveal } from '@/components/motion/Reveal';
import { Link } from '@/i18n/navigation';
import { GOOGLE_LOGIN_ENABLED } from '@/lib/auth/config';
import { fetchOrders } from '@/lib/orders/api';
import { formatPrice } from '@/lib/price';
import { LocalTime } from './LocalTime';
import { SignInGate } from './SignInGate';
import { StatusChip } from './StatusChip';
import styles from './orders.module.css';

// Lista de "Mis pedidos" (lee la sesión: va dentro de un Suspense). Las
// filas entran en cascada al aparecer (Reveal, GSAP, una vez) y el número de
// cada pedido se transforma en el titular de su página (<ViewTransition>).
// limit: solo los más recientes (por ejemplo, en la página de cuenta), con
// un enlace a la lista completa.
export async function OrdersList({ locale, limit }: { locale: Locale; limit?: number }) {
  const t = await getTranslations('Orders');
  const result = await fetchOrders();
  if (!result.ok) {
    if (result.error === 'unauthorized') return <SignInGate googleEnabled={GOOGLE_LOGIN_ENABLED} />;
    return (
      <p className={styles.message} role="alert">
        {t('loadError')}
      </p>
    );
  }
  const all = result.data.items;
  const items = limit ? all.slice(0, limit) : all;
  if (!items.length) {
    return (
      <section className={styles.emptyPanel} aria-labelledby="orders-empty">
        <h2 id="orders-empty" className={styles.sectionTitle}>
          {t('emptyTitle')}
        </h2>
        <p className={styles.gateText}>{t('empty')}</p>
        <Link href="/catalog" className={styles.primaryButton}>
          {t('browse')}
        </Link>
      </section>
    );
  }
  return (
    <section className={styles.listPanel} aria-labelledby="orders-list">
      <header className={styles.listHead}>
        <h2 id="orders-list" className={styles.sectionTitle}>
          {t('listTitle')}
        </h2>
        <span className={styles.hud}>{t('count', { count: all.length })}</span>
      </header>
      <Reveal as="ul" className={styles.list} stagger={0.05}>
        {items.map((order) => (
          <li key={order.id}>
            <Link href={`/orders/${order.id}`} className={styles.orderRow} aria-label={t('viewOrder', { number: order.number })}>
              <span className={styles.cell}>
                <span className={styles.hud}>{t('columns.number')}</span>
                <ViewTransition name={`order-number-${order.id}`} share="morph" default="none">
                  <span className={styles.orderNumber}>{order.number}</span>
                </ViewTransition>
              </span>
              <span className={styles.cell}>
                <span className={styles.hud}>{t('columns.date')}</span>
                <span className={styles.mono}>
                  <LocalTime iso={order.createdAt} format="date" />
                </span>
              </span>
              <span className={styles.cell}>
                <span className={styles.hud}>{t('columns.items')}</span>
                <span className={styles.mono}>{t('itemCount', { count: order.itemCount })}</span>
              </span>
              <span className={styles.cell}>
                <span className={styles.hud}>{t('columns.total')}</span>
                <span className={styles.mono}>{formatPrice(order.total, locale)}</span>
              </span>
              <span className={styles.cellStatus}>
                <StatusChip status={order.status} stage={order.trackingStage} />
                <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </span>
            </Link>
          </li>
        ))}
      </Reveal>
      {limit && all.length > items.length && (
        <Link href="/orders" className={styles.backLink}>
          {t('viewAll')}
        </Link>
      )}
    </section>
  );
}

export function OrdersListSkeleton() {
  return (
    <div className={styles.listPanel} aria-busy="true">
      {[0, 1, 2].map((row) => (
        <span key={row} className={styles.skeletonRow} />
      ))}
    </div>
  );
}
