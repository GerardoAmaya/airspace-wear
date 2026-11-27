import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { CartButton } from '@/components/cart/CartButton';
import { LocaleSwitch } from '@/components/i18n/LocaleSwitch';
import { StylistLink } from '@/components/stylist-bot/StylistLink';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Link } from '@/i18n/navigation';
import { HANGAR_ENABLED } from '@/lib/avatar/avatar';
import { HOME_ANCHORS } from '@/lib/home';
import { HeaderShell } from './HeaderShell';
import styles from './SiteHeader.module.css';

// Encabezado fijo con la navegación principal.
export function SiteHeader() {
  const t = useTranslations('Header');
  const brand = useTranslations('Brand');

  // Balones es una sección de la home (ancla en español, ver lib/home.ts);
  // Catálogo y Hangar 360° son páginas propias (el Hangar vuelve a su
  // sección de la home si el avatar no está configurado). Estilista IA abre
  // el panel del robot en la misma página (sin JS, lleva a #estilista).
  const nav = (
    <>
      <Link href="/catalog">{t('catalog')}</Link>
      <Link href={HANGAR_ENABLED ? '/hangar' : { pathname: '/', hash: HOME_ANCHORS.hangar }}>{t('hangar')}</Link>
      <Link href={{ pathname: '/', hash: HOME_ANCHORS.balls }}>{t('balls')}</Link>
      <StylistLink>{t('stylist')}</StylistLink>
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
