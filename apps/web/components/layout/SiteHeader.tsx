import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { CartButton } from '@/components/cart/CartButton';
import { LocaleSwitch } from '@/components/i18n/LocaleSwitch';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Link } from '@/i18n/navigation';
import { HOME_ANCHORS } from '@/lib/home';
import { HeaderShell } from './HeaderShell';
import styles from './SiteHeader.module.css';

// Encabezado fijo con la navegación principal.
export function SiteHeader() {
  const t = useTranslations('Header');
  const brand = useTranslations('Brand');

  // Hangar 360°, Balones y Estilista IA son secciones de la home (anclas en
  // español, ver lib/home.ts); Catálogo es su propia página.
  const nav = (
    <>
      <Link href="/catalog">{t('catalog')}</Link>
      <Link href={{ pathname: '/', hash: HOME_ANCHORS.hangar }}>{t('hangar')}</Link>
      <Link href={{ pathname: '/', hash: HOME_ANCHORS.balls }}>{t('balls')}</Link>
      <Link href={{ pathname: '/', hash: HOME_ANCHORS.stylist }}>{t('stylist')}</Link>
    </>
  );

  return (
    <HeaderShell
      labels={{ open: t('menuOpen'), close: t('menuClose'), nav: t('navLabel') }}
      logo={
        <Link href="/" className={styles.logo} aria-label={brand('homeLabel')}>
          {brand('name')}{' '}
          <span className={styles.logoWear}>{brand('suffix')}</span>
        </Link>
      }
      nav={nav}
      tools={
        <>
          <ThemeToggle />
          <div className={styles.localeBar}>
            <Suspense fallback={<LocaleSwitch withQuery={false} />}>
              <LocaleSwitch />
            </Suspense>
          </div>
          <CartButton />
        </>
      }
      menuExtras={
        <Suspense fallback={<LocaleSwitch withQuery={false} />}>
          <LocaleSwitch />
        </Suspense>
      }
    />
  );
}
