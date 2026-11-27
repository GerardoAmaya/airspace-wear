'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { signInWithGoogle } from '@/components/account/account-actions';
import styles from './orders.module.css';

// Sin sesión, los pedidos piden iniciar sesión con Google y vuelven a la
// misma página (lista o pedido) al terminar.
export function SignInGate({ googleEnabled }: { googleEnabled: boolean }) {
  const t = useTranslations('Orders');
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <section className={styles.gate} aria-labelledby="orders-signin">
      <h2 id="orders-signin" className={styles.gateTitle}>
        {t('signInTitle')}
      </h2>
      <p className={styles.gateText}>{googleEnabled ? t('signInLead') : t('signInUnavailable')}</p>
      {googleEnabled && (
        <button
          type="button"
          className={styles.primaryButton}
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={async () => {
            setBusy(true);
            setFailed(false);
            if (await signInWithGoogle(locale)) return;
            setBusy(false);
            setFailed(true);
          }}
        >
          {busy ? t('signingIn') : t('signInButton')}
        </button>
      )}
      <p className={styles.gateError} role="alert">
        {failed ? t('signInFailed') : null}
      </p>
    </section>
  );
}
