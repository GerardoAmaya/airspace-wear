import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode, Suspense } from 'react';
import { AccountButton, AccountMenuEntries } from '@/components/account/AccountButton';
import { CartButton } from '@/components/cart/CartButton';
import { LocaleSwitch } from '@/components/i18n/LocaleSwitch';
import { StylistLink } from '@/components/stylist-bot/StylistLink';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Link } from '@/i18n/navigation';
import { AUTH_ENABLED, GOOGLE_LOGIN_ENABLED } from '@/lib/auth/config';
import { HANGAR_ENABLED } from '@/lib/avatar/avatar';
import { HOME_ANCHORS } from '@/lib/home';
import { HEADER_LINKS, type HeaderLink } from '@/lib/nav';
import { HeaderShell } from './HeaderShell';
import { NavLink } from './NavLink';
import styles from './SiteHeader.module.css';

// Encabezado fijo con la navegación principal.
export function SiteHeader() {
  const t = useTranslations('Header');
  const brand = useTranslations('Brand');

  // Balones es una sección de la home (ancla en español, ver lib/home.ts);
  // Catálogo, Hangar 360° y Mis pedidos son páginas propias (el Hangar
  // vuelve a su sección de la home si el avatar no está configurado). Mis
  // pedidos sin sesión muestra el aviso para entrar. Estilista IA abre el
  // panel del robot en la misma página (sin JS, ver StylistLink). Qué enlaces
  // se muestran y en qué orden lo decide HEADER_LINKS (lib/nav.ts).
  const links: Record<HeaderLink, ReactNode> = {
    catalog: <NavLink href="/catalog">{t('catalog')}</NavLink>,
    hangar: HANGAR_ENABLED ? <NavLink href="/hangar">{t('hangar')}</NavLink> : <Link href={{ pathname: '/', hash: HOME_ANCHORS.hangar }}>{t('hangar')}</Link>,
    balls: <Link href={{ pathname: '/', hash: HOME_ANCHORS.balls }}>{t('balls')}</Link>,
    orders: <NavLink href="/orders">{t('orders')}</NavLink>,
    stylist: <StylistLink>{t('stylist')}</StylistLink>,
  };
  const nav = HEADER_LINKS.map((id) => <Fragment key={id}>{links[id]}</Fragment>);

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
          {/* Cuenta (Google). Sin las claves de Google no hay botón de entrar. */}
          <AccountButton authEnabled={AUTH_ENABLED} googleEnabled={GOOGLE_LOGIN_ENABLED} />
        </>
      }
      menuExtras={
        <>
          <AccountMenuEntries authEnabled={AUTH_ENABLED} googleEnabled={GOOGLE_LOGIN_ENABLED} />
          <Suspense fallback={<LocaleSwitch withQuery={false} />}>
            <LocaleSwitch />
          </Suspense>
        </>
      }
    />
  );
}
