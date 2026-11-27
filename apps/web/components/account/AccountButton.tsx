'use client';

import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { scheduleSession, useSessionStore } from '@/lib/auth/session-store';
import { WARM_ON_INTENT } from '@/lib/auth/warm';
import { HEADER_LINKS } from '@/lib/nav';
import { signInWithGoogle, signOut } from './account-actions';
import { Avatar } from './Avatar';
import styles from './Account.module.css';

// El menú del usuario (con Motion) se descarga solo si hay sesión: la
// mayoría de las visitas no la tiene y Motion no entra en el JS inicial.
// Mientras llega, el lugar queda reservado (sin saltos).
const UserMenu = dynamic(() => import('./UserMenu').then((module) => module.UserMenu), {
  ssr: false,
  loading: () => <span className={styles.placeholder} aria-hidden="true" />,
});

// Cuenta en el encabezado. Sin sesión: "Iniciar sesión" (Google), solo si el
// login está configurado. Con sesión: el avatar abre un menú con Mis pedidos,
// Mi cuenta y Cerrar sesión. La sesión se pide en el navegador
// (/api/auth/get-session, ver lib/auth/session-store.ts) cuando está libre,
// así las páginas siguen siendo estáticas y el primer pintado no espera.
export function AccountButton({ authEnabled, googleEnabled }: { authEnabled: boolean; googleEnabled: boolean }) {
  // Sin BETTER_AUTH_SECRET no hay sesiones: ni se pregunta.
  if (!authEnabled) return null;
  return <AccountSession googleEnabled={googleEnabled} />;
}

function AccountSession({ googleEnabled }: { googleEnabled: boolean }) {
  const status = useSessionStore((state) => state.status);
  const user = useSessionStore((state) => state.user);
  useEffect(() => scheduleSession(), []);
  if (user) return <UserMenu user={user} />;
  if (!googleEnabled) return null;
  // Mientras llega la sesión se reserva el lugar (sin saltos al aparecer).
  if (status !== 'ready') return <span className={styles.placeholder} aria-hidden="true" />;
  return <SignInButton />;
}

function SignInButton() {
  const t = useTranslations('Account');
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={styles.signIn}
      // Despierta la base mientras la persona se decide (lib/auth/warm.ts).
      {...WARM_ON_INTENT}
      aria-label={busy ? t('signingIn') : t('signInLabel')}
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // Si se pudo empezar, el navegador ya va camino a Google.
        if (!(await signInWithGoogle(locale))) {
          setBusy(false);
          router.push({ pathname: '/account', query: { error: 'unavailable' } });
        }
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="5.4" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="M2.8 14a5.2 5.2 0 0 1 10.4 0" />
      </svg>
      <span className={styles.signInText} aria-hidden="true">
        {t('signIn')}
      </span>
    </button>
  );
}

// Entradas de cuenta en el menú del teléfono (por debajo de 520 px el botón
// del encabezado se oculta y la cuenta pasa al panel de navegación).
export function AccountMenuEntries({ authEnabled, googleEnabled }: { authEnabled: boolean; googleEnabled: boolean }) {
  if (!authEnabled) return null;
  return <AccountEntries googleEnabled={googleEnabled} />;
}

function AccountEntries({ googleEnabled }: { googleEnabled: boolean }) {
  const t = useTranslations('Account');
  const locale = useLocale();
  const router = useRouter();
  const user = useSessionStore((state) => state.user);
  useEffect(() => scheduleSession(), []);
  const [busy, setBusy] = useState(false);
  if (!user) {
    if (!googleEnabled) return null;
    return (
      <div className={styles.entries}>
        <button
          type="button"
          className={styles.entryButton}
          {...WARM_ON_INTENT}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (!(await signInWithGoogle(locale))) {
              setBusy(false);
              router.push({ pathname: '/account', query: { error: 'unavailable' } });
            }
          }}
        >
          {busy ? t('signingIn') : t('signInLabel')}
        </button>
      </div>
    );
  }
  return (
    <div className={styles.entries}>
      <div className={styles.entryUser}>
        <Avatar name={user.name} email={user.email} image={user.image} />
        <span className={styles.entryText}>
          <span className={styles.menuName}>{user.name}</span>
          <span className={styles.menuEmail}>{user.email}</span>
        </span>
      </div>
      {/* Si el encabezado ya trae "Mis pedidos" (lib/nav.ts), no se repite. */}
      {!HEADER_LINKS.includes('orders') && (
        <Link href="/orders" className={styles.entryLink}>
          {t('orders')}
        </Link>
      )}
      <Link href="/account" className={styles.entryLink}>
        {t('account')}
      </Link>
      <button
        type="button"
        className={styles.entryButton}
        data-tone="exit"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signOut();
          setBusy(false);
        }}
      >
        {busy ? t('signingOut') : t('signOut')}
      </button>
    </div>
  );
}
