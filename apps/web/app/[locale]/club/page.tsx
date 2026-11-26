import type { Locale } from '@airspace/contracts';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HomeClub } from '@/components/home/stylist/HomeClub';
import styles from '@/components/content/content.module.css';
import { localeAlternates } from '@/lib/seo';

export async function generateMetadata({ params }: PageProps<'/[locale]/club'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: 'Pages' });
  return { title: t('clubTitle'), description: t('clubDescription'), alternates: localeAlternates(locale, '/club') };
}

// Página propia con la misma sección de la home (enlazable y compartible).
export default async function ClubPage({ params }: PageProps<'/[locale]/club'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return (
    <div className={styles.sectionPage}>
      <HomeClub locale={locale as Locale} />
    </div>
  );
}
