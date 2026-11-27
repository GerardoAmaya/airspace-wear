import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { TestModeNotice } from '@/components/cart/TestModeNotice';
import { OrderViewSkeleton } from '@/components/orders/OrderSkeleton';
import { OrderView } from '@/components/orders/OrderView';
import styles from '@/components/orders/orders.module.css';
import { pageLocale } from '@/i18n/locale';

export async function generateMetadata({ params }: PageProps<'/[locale]/orders/[id]'>): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Orders' });
  // Página personal: fuera de los buscadores y sin canónica ni alternativas.
  return { title: t('metaTitleDetail'), description: t('metaDescription'), robots: { index: false, follow: false } };
}

// Página de un pedido: confirmación al volver de Stripe (?paid=1), productos,
// totales y seguimiento. El id no se conoce al compilar y todo lo del pedido
// lee la sesión: la página entera llega en streaming detrás del Suspense.
export default function OrderPage({ params, searchParams }: PageProps<'/[locale]/orders/[id]'>) {
  return (
    <div className={styles.page}>
      <Suspense fallback={<OrderViewSkeleton />}>
        <OrderContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OrderContent({ params, searchParams }: Pick<PageProps<'/[locale]/orders/[id]'>, 'params' | 'searchParams'>) {
  const { locale: raw, id } = await params;
  const locale = pageLocale(raw);
  setRequestLocale(locale);
  const { paid } = await searchParams;
  return (
    <>
      <OrderView id={id} locale={locale} returned={paid === '1'} />
      <TestModeNotice />
    </>
  );
}
