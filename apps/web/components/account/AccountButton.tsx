'use client';

import { AnimatePresence, motion, type Variants } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth/client';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { HEADER_LINKS } from '@/lib/nav';
import { signInWithGoogle, signOut } from './account-actions';
import { Avatar } from './Avatar';
import styles from './Account.module.css';

const ITEM = '[role="menuitem"]';
const MotionLink = motion.create(Link);

// Cuenta en el encabezado. Sin sesión: "Iniciar sesión" (Google), solo si el
// login está configurado. Con sesión: el avatar abre un menú con Mis pedidos,
// Mi cuenta y Cerrar sesión. La sesión se pide en el navegador
// (/api/auth/get-session), así las páginas siguen siendo estáticas.
export function AccountButton({ authEnabled, googleEnabled }: { authEnabled: boolean; googleEnabled: boolean }) {
  // Sin BETTER_AUTH_SECRET no hay sesiones: ni se pregunta.
  if (!authEnabled) return null;
  return <AccountSession googleEnabled={googleEnabled} />;
}

function AccountSession({ googleEnabled }: { googleEnabled: boolean }) {
  const { data, isPending } = authClient.useSession();
  if (data) return <UserMenu user={data.user} />;
  if (!googleEnabled) return null;
  // Mientras llega la sesión se reserva el lugar (sin saltos al aparecer).
  if (isPending) return <span className={styles.placeholder} aria-hidden="true" />;
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

interface MenuUser {
  name: string;
  email: string;
  image?: string | null;
}

// Menú del usuario: botón con aria-expanded y un menú (role="menu") que se
// abre encima del contenido. Teclado: flechas, Inicio y Fin, Escape (vuelve
// al botón) y Tab (cierra). Motion anima la entrada y la salida (solo
// opacidad con movimiento reducido).
function UserMenu({ user }: { user: MenuUser }) {
  const t = useTranslations('Account');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const reduced = useMotionStore((state) => state.reducedMotion);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const list = Array.from(menu.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    (focusLast.current ? list.at(-1) : list[0])?.focus();
    focusLast.current = false;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    focusLast.current = event.key === 'ArrowUp';
    setOpen(true);
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = Array.from(menu.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') close(false);
  };

  // Entrada: el menú baja y crece desde la esquina del botón y sus
  // opciones aparecen en cascada; la salida es más corta. Con movimiento
  // reducido, solo opacidad.
  const menuMotion: Variants = reduced
    ? { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: DURATION.micro } }, gone: { opacity: 0, transition: { duration: DURATION.micro } } }
    : {
        hidden: { opacity: 0, y: -8, scale: 0.96 },
        shown: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.ui, ease: EASE.out.bezier, staggerChildren: 0.04, delayChildren: 0.05 } },
        gone: { opacity: 0, y: -6, scale: 0.98, transition: { duration: DURATION.micro, ease: EASE.out.bezier } },
      };
  const itemMotion: Variants = reduced ? {} : { hidden: { opacity: 0, x: 6 }, shown: { opacity: 1, x: 0, transition: { duration: DURATION.ui, ease: EASE.out.bezier } } };

  return (
    <div ref={root} className={styles.menuRoot}>
      <button
        ref={button}
        type="button"
        className={styles.userButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={t('menuLabel', { name: user.name || user.email })}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onButtonKey}
      >
        <Avatar name={user.name} email={user.email} image={user.image} />
        <svg className={styles.chevron} viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menu}
            id={id}
            role="menu"
            aria-label={t('menuLabel', { name: user.name || user.email })}
            className={styles.menu}
            onKeyDown={onMenuKey}
            style={{ transformOrigin: 'top right' }}
            variants={menuMotion}
            initial="hidden"
            animate="shown"
            exit="gone"
          >
            <motion.div className={styles.menuHead} variants={itemMotion}>
              <span className={styles.menuKicker}>{t('signedInAs')}</span>
              <span className={styles.menuName}>{user.name}</span>
              <span className={styles.menuEmail}>{user.email}</span>
            </motion.div>
            <MotionLink href="/orders" role="menuitem" tabIndex={-1} className={styles.menuItem} variants={itemMotion} onClick={() => setOpen(false)}>
              {t('orders')}
            </MotionLink>
            <MotionLink href="/account" role="menuitem" tabIndex={-1} className={styles.menuItem} variants={itemMotion} onClick={() => setOpen(false)}>
              {t('account')}
            </MotionLink>
            <motion.button
              variants={itemMotion}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={styles.menuItem}
              data-tone="exit"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await signOut();
                setBusy(false);
                close(true);
              }}
            >
              {busy ? t('signingOut') : t('signOut')}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
  const { data } = authClient.useSession();
  const [busy, setBusy] = useState(false);
  if (!data) {
    if (!googleEnabled) return null;
    return (
      <div className={styles.entries}>
        <button
          type="button"
          className={styles.entryButton}
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
  const { user } = data;
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
