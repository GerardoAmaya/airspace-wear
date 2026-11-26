import type { Locale } from '@airspace/contracts';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HomeBalls } from '@/components/home/balls/HomeBalls';
import styles from '@/components/content/content.module.css';
import { localeAlternates } from '@/lib/seo';

export async function generateMetadata({ params }: PageProps<'/[locale]/balls'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: 'Pages' });
  return { title: t('ballsTitle'), description: t('ballsDescription'), alternates: localeAlternates(locale, '/balls') };
}

// Página propia con la misma sección de la home (enlazable y compartible).
export default async function BallsPage({ params }: PageProps<'/[locale]/balls'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return (
    <div className={styles.sectionPage}>
      <HomeBalls locale={locale as Locale} />
    </div>
  );
}
