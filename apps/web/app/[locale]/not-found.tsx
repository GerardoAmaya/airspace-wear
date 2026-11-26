import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import styles from '@/components/content/content.module.css';

// 404 dentro de un idioma (producto o página que no existe).
export default function NotFound() {
  const t = useTranslations('NotFound');
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.lead}>{t('lead')}</p>
        <p>
          <Link href="/catalog" className={styles.inlineLink}>
            {t('cta')}
          </Link>
        </p>
      </header>
    </div>
  );
}
