import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { TestModeNotice } from '@/components/cart/TestModeNotice';
import { Reveal } from '@/components/motion/Reveal';
import { OrdersList, OrdersListSkeleton } from '@/components/orders/OrdersList';
import styles from '@/components/orders/orders.module.css';
import { pageLocale } from '@/i18n/locale';
import { localeAlternates } from '@/lib/seo';

export async function generateMetadata({ params }: PageProps<'/[locale]/orders'>): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Orders' });
  // Página personal: fuera de los buscadores.
  return { title: t('metaTitle'), description: t('metaDescription'), alternates: localeAlternates(locale, '/orders'), robots: { index: false, follow: false } };
}

// Mis pedidos (docs/plan-paso-5.md, fase 3). La cabecera es estática; la
// lista lee la sesión y llega en streaming detrás del Suspense. Sin sesión,
// pide iniciar sesión y vuelve aquí.
export default async function OrdersPage({ params }: PageProps<'/[locale]/orders'>) {
  const locale = pageLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations('Orders');
  return (
    <div className={styles.page}>
      <Reveal as="header" className={styles.intro} immediate>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.lead}>{t('lead')}</p>
      </Reveal>
      <TestModeNotice />
      <Suspense fallback={<OrdersListSkeleton />}>
        <OrdersList locale={locale} />
      </Suspense>
    </div>
  );
}
