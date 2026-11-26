import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/Reveal';
import styles from '@/components/content/content.module.css';
import { localeAlternates } from '@/lib/seo';
import { pageLocale } from '@/i18n/locale';

export async function generateMetadata({ params }: PageProps<'/[locale]/legal'>): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const t = await getTranslations({ locale: locale, namespace: 'Legal' });
  return { title: t('metaTitle'), description: t('metaDescription'), alternates: localeAlternates(locale, '/legal') };
}

const SECTIONS = ['affiliation', 'prices', 'models', 'ai', 'data'] as const;

// Aviso legal: no afiliación, precios ilustrativos, licencias, IA y datos.
export default async function LegalPage({ params }: PageProps<'/[locale]/legal'>) {
  const locale = pageLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations('Legal');
  return (
    <div className={styles.page}>
      <Reveal as="header" className={styles.intro} immediate>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.lead}>{t('lead')}</p>
      </Reveal>
      <div className={styles.prose}>
        {SECTIONS.map((section) => (
          <section key={section} aria-labelledby={`legal-${section}`}>
            <h2 id={`legal-${section}`}>{t(`${section}.title`)}</h2>
            <p>{t(`${section}.body`)}</p>
          </section>
        ))}
        <p>
          {t.rich('creditsLink', {
            link: (chunks) => <Link href="/credits">{chunks}</Link>,
          })}
        </p>
      </div>
    </div>
  );
}
