import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HomeClub } from '@/components/home/stylist/HomeClub';
import styles from '@/components/content/content.module.css';
import { localeAlternates } from '@/lib/seo';
import { pageLocale } from '@/i18n/locale';

export async function generateMetadata({ params }: PageProps<'/[locale]/club'>): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const t = await getTranslations({ locale: locale, namespace: 'Pages' });
  return { title: t('clubTitle'), description: t('clubDescription'), alternates: localeAlternates(locale, '/club') };
}

// Página propia con la misma sección de la home (enlazable y compartible).
export default async function ClubPage({ params }: PageProps<'/[locale]/club'>) {
  const locale = pageLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <div className={styles.sectionPage}>
      <HomeClub locale={locale} />
    </div>
  );
}
