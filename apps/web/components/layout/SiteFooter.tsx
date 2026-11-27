import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { HANGAR_ENABLED } from '@/lib/avatar/avatar';
import { StylistLink } from '@/components/stylist-bot/StylistLink';
import { HOME_ANCHORS } from '@/lib/home';
import styles from './SiteFooter.module.css';

// Pie común. El aviso de no afiliación es obligatorio (CLAUDE.md).
export function SiteFooter() {
  const t = useTranslations('Footer');
  const brand = useTranslations('Brand');
  return (
    <footer className={styles.footer}>
      <div className={styles.top}>
        <Link href="/" className={styles.logo} aria-label={brand('homeLabel')}>
          {brand('name')}{' '}
          <span className={styles.logoWear}>{brand('suffix')}</span>
        </Link>
        <nav className={styles.nav} aria-label={t('navLabel')}>
          <Link href="/catalog">{t('catalog')}</Link>
          <Link href={HANGAR_ENABLED ? '/hangar' : { pathname: '/', hash: HOME_ANCHORS.hangar }}>{t('hangar')}</Link>
          <Link href={{ pathname: '/', hash: HOME_ANCHORS.balls }}>{t('balls')}</Link>
          {/* Abre el panel del estilista en la misma página. */}
          <StylistLink>{t('stylist')}</StylistLink>
          <Link href="/credits">{t('credits')}</Link>
          <Link href="/legal">{t('legal')}</Link>
        </nav>
      </div>
      <p className={styles.disclaimer}>{t('disclaimer')}</p>
    </footer>
  );
}
