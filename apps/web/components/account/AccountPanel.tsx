'use client';

import { motion, MotionConfig } from 'motion/react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { signInWithGoogle } from './account-actions';
import { useAccountEntrance } from './account-motion';
import styles from './Dashboard.module.css';

// Piezas de /[locale]/account sin sesión: el aviso de error de Google, la
// tarjeta para entrar y el aviso de "sin cuentas en este sitio".

// Con ?error=<código> (vuelta de Google con error) muestra el aviso.
// access_denied: el visitante canceló en Google; cualquier otro código, un
// aviso general.
export function AccountError() {
  const t = useTranslations('Account');
  const error = useSearchParams().get('error');
  if (!error) return null;
  return (
    <section className={styles.alert} role="alert" aria-labelledby="account-error" data-account-error={error}>
      <h2 id="account-error" className={styles.alertTitle}>
        {t('errorTitle')}
      </h2>
      <p>{error === 'access_denied' ? t('errorCancelled') : t('errorGeneric')}</p>
    </section>
  );
}

const noFormat = () => '';

// Tarjeta para entrar con Google: marco HUD, lo que trae la cuenta y el
// botón (relleno lima). Al volver con error, el botón dice "Intentar otra vez".
export function SignInCard() {
  const t = useTranslations('Account');
  const format = useFormatter();
  const locale = useLocale();
  const retry = Boolean(useSearchParams().get('error'));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useAccountEntrance(root, noFormat);
  const benefits = [t('benefitOrders'), t('benefitTracking'), t('benefitCart')];
  return (
    <MotionConfig reducedMotion="user">
      <div ref={root} className={styles.signedOut}>
        <section className={styles.signInCard} data-enter aria-labelledby="account-signin">
          <span className={styles.rule} data-rule aria-hidden="true" />
          <h2 id="account-signin" className={styles.signInTitle} data-name>
            {t('signInTitle')}
          </h2>
          <p className={styles.lead} data-item>
            {t('signedOutLead')}
          </p>
          <div className={styles.benefits} data-item>
            <p className={styles.hud}>{t('benefitsLabel')}</p>
            <ol className={styles.benefitList}>
              {benefits.map((benefit, index) => (
                <li key={benefit}>
                  <span className={styles.index} aria-hidden="true">
                    {format.number(index + 1, { minimumIntegerDigits: 2 })}
                  </span>
                  {benefit}
                </li>
              ))}
            </ol>
          </div>
          <div className={styles.signInActions} data-item>
            <motion.button
              type="button"
              className={styles.primaryButton}
              disabled={busy}
              aria-busy={busy || undefined}
              whileHover={busy ? undefined : { y: -2 }}
              whileTap={busy ? undefined : { scale: 0.97 }}
              transition={{ duration: DURATION.micro, ease: EASE.out.bezier }}
              onClick={async () => {
                setBusy(true);
                setFailed(false);
                // Si se pudo empezar, el navegador ya va camino a Google.
                if (await signInWithGoogle(locale)) return;
                setBusy(false);
                setFailed(true);
              }}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="5.4" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="M2.8 14a5.2 5.2 0 0 1 10.4 0" />
              </svg>
              {busy ? t('signingIn') : retry ? t('retry') : t('signInLabel')}
            </motion.button>
            <p className={styles.note}>{t('privacyNote')}</p>
          </div>
          <p className={styles.error} role="alert">
            {failed ? t('signInFailed') : null}
          </p>
        </section>
      </div>
    </MotionConfig>
  );
}

export function Unavailable() {
  const t = useTranslations('Account');
  return (
    <section className={styles.panel}>
      <p>{t('unavailable')}</p>
      <p>
        <Link href="/catalog" className={styles.textLink}>
          {t('browse')}
        </Link>
      </p>
    </section>
  );
}
