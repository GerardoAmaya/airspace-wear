import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HomeBalls } from '@/components/home/balls/HomeBalls';
import styles from '@/components/content/content.module.css';
import { localeAlternates } from '@/lib/seo';
import { pageLocale } from '@/i18n/locale';

export async function generateMetadata({ params }: PageProps<'/[locale]/balls'>): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const t = await getTranslations({ locale: locale, namespace: 'Pages' });
  return { title: t('ballsTitle'), description: t('ballsDescription'), alternates: localeAlternates(locale, '/balls') };
}

// Página propia con la misma sección de la home (enlazable y compartible).
export default async function BallsPage({ params }: PageProps<'/[locale]/balls'>) {
  const locale = pageLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <div className={styles.sectionPage}>
      <HomeBalls locale={locale} />
    </div>
  );
}
