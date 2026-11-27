import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { AccountContent } from '@/components/account/AccountContent';
import dashboard from '@/components/account/Dashboard.module.css';
import { Reveal } from '@/components/motion/Reveal';
import styles from '@/components/content/content.module.css';
import { pageLocale } from '@/i18n/locale';
import { localeAlternates } from '@/lib/seo';

export async function generateMetadata({ params }: PageProps<'/[locale]/account'>): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Account' });
  // Página personal: fuera de los buscadores.
  return { title: t('metaTitle'), description: t('metaDescription'), alternates: localeAlternates(locale, '/account'), robots: { index: false, follow: false } };
}

// Mi cuenta. La cabecera es estática; el panel lee la sesión (y los
// pedidos) en el servidor y llega en streaming detrás del Suspense. Sin
// sesión muestra la tarjeta para entrar con Google, y el aviso de error
// cuando Google no completa el inicio de sesión (Better Auth vuelve aquí con
// ?error=<código>).
export default async function AccountPage({ params }: PageProps<'/[locale]/account'>) {
  const locale = pageLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations('Account');
  return (
    <div className={styles.page}>
      <Reveal as="header" className={styles.intro} immediate>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1 className={styles.title}>{t('title')}</h1>
      </Reveal>
      <Suspense fallback={<AccountSkeleton label={t('loading')} />}>
        <AccountContent />
      </Suspense>
    </div>
  );
}

function AccountSkeleton({ label }: { label: string }) {
  return (
    <div className={dashboard.skeleton} aria-busy="true">
      <p className="visually-hidden">{label}</p>
      <span />
      <span />
    </div>
  );
}
