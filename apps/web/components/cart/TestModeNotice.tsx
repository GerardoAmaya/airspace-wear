import { useTranslations } from 'next-intl';
import styles from './TestModeNotice.module.css';

// Aviso del modo de prueba (sin cobros reales) con la tarjeta de prueba de
// Stripe a la vista. Va en el carrito y en las páginas de pedidos.
export function TestModeNotice({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('Checkout');
  return (
    <aside className={styles.notice} data-compact={compact || undefined} aria-label={t('testModeLabel')}>
      <span className={styles.badge}>{t('testModeBadge')}</span>
      <p className={styles.text}>
        {t.rich('testMode', {
          card: (chunks) => <span className={styles.card}>{chunks}</span>,
        })}
      </p>
    </aside>
  );
}
