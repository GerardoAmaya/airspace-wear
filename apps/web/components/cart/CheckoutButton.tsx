'use client';

import type { CheckoutIssue } from '@airspace/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { signInWithGoogle } from '@/components/account/account-actions';
import { useMotionStore } from '@/lib/motion/store';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { startCheckout } from '@/lib/orders/actions';
import { TestModeNotice } from './TestModeNotice';
import type { CartItem } from './cart-store';
import styles from './Cart.module.css';

export type LineIssues = Record<string, CheckoutIssue>;

type Status = 'idle' | 'busy' | 'signin' | 'redirecting';
type ErrorKey = 'payments_unavailable' | 'invalid_cart' | 'rate_limited' | 'unavailable' | 'signin_unavailable';

// "Pagar" del carrito (docs/plan-paso-5.md, fase 2). Sin sesión, lleva a
// Google y vuelve a esta página con el carrito abierto (?cart=open). Con
// sesión, el servidor de la web crea el pedido en la API y el navegador va a
// la página de pago de Stripe. El carrito no se vacía aquí: solo cuando el
// pedido vuelve confirmado como pagado.
export function CheckoutButton({ items, onIssues }: { items: CartItem[]; onIssues(issues: LineIssues): void }) {
  const t = useTranslations('Cart');
  const locale = useLocale();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<ErrorKey | null>(null);

  const pay = async () => {
    setStatus('busy');
    setError(null);
    onIssues({});
    const result = await startCheckout(
      locale as 'es' | 'en',
      items.map(({ slug, size, quantity }) => ({ slug, size, quantity })),
    ).catch(() => ({ ok: false as const, error: 'unavailable' as const }));
    if (result.ok) {
      setStatus('redirecting');
      window.location.assign(result.url);
      return;
    }
    if (result.error === 'unauthorized') {
      setStatus('signin');
      // Al volver de Google, el carrito se abre solo (LazyCartDrawer lee ?cart=open).
      const here = new URL(window.location.href);
      here.searchParams.set('cart', 'open');
      history.replaceState(history.state, '', here);
      if (await signInWithGoogle(locale)) return;
      setStatus('idle');
      setError('signin_unavailable');
      return;
    }
    if (result.error === 'invalid_cart' && 'lines' in result && result.lines) {
      const issues: LineIssues = {};
      for (const { index, issue } of result.lines) if (items[index]) issues[items[index].id] = issue;
      onIssues(issues);
    }
    setStatus('idle');
    setError(result.error);
  };

  const busy = status !== 'idle';
  const reduced = useMotionStore((state) => state.reducedMotion);
  const label = status === 'busy' ? t('paying') : status === 'signin' ? t('signingIn') : status === 'redirecting' ? t('redirecting') : t('pay');
  const offset = reduced ? 0 : 14;
  const transition = { duration: reduced ? DURATION.micro : DURATION.ui, ease: EASE.out.bezier };
  return (
    <div className={styles.checkout}>
      <TestModeNotice compact />
      {/* Motion: el texto del botón cambia con un cruce vertical y, mientras
          espera, tres puntos laten (solo opacidad y transform). */}
      <motion.button
        type="button"
        className={styles.pay}
        onClick={pay}
        disabled={busy}
        aria-busy={busy || undefined}
        whileTap={busy || reduced ? undefined : { scale: 0.97 }}
        transition={transition}
      >
        <span className={styles.payInner}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={label}
              className={styles.payLabel}
              initial={{ opacity: 0, y: offset }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -offset }}
              transition={transition}
            >
              {label}
            </motion.span>
          </AnimatePresence>
          {busy && !reduced && (
            <span className={styles.payDots} aria-hidden="true">
              {[0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  className={styles.payDot}
                  animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                  transition={{ duration: 0.9, ease: 'easeInOut', repeat: Infinity, delay: dot * 0.15 }}
                />
              ))}
            </span>
          )}
        </span>
      </motion.button>
      <p className={styles.checkoutError} role="alert">
        <AnimatePresence initial={false}>
          {error && (
            <motion.span
              key={error}
              className={styles.checkoutErrorText}
              initial={{ opacity: 0, y: reduced ? 0 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={transition}
            >
              {t(`checkoutError.${error}`)}
            </motion.span>
          )}
        </AnimatePresence>
      </p>
    </div>
  );
}
