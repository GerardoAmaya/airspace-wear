'use client';

import { type Locale, type OrderSummary, type Price, TRACKING_STEPS } from '@airspace/contracts';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type CSSProperties, type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LocalTime } from '@/components/orders/LocalTime';
import { StatusChip } from '@/components/orders/StatusChip';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { authClient } from '@/lib/auth/client';
import { useInView } from '@/lib/in-view';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { formatPrice } from '@/lib/price';
import { type Theme, useThemeStore } from '@/lib/theme';
import { signOut } from './account-actions';
import { useAccountEntrance } from './account-motion';
import { Avatar } from './Avatar';
import styles from './Dashboard.module.css';

export interface AccountUser {
  name: string;
  email: string;
  image: string | null;
  // ISO 8601: fecha de alta (Better Auth, user.createdAt).
  createdAt: string;
}

// Resumen de pedidos calculado en el servidor (AccountContent). null: la API
// de pedidos no respondió; el panel sigue y la sección muestra un aviso.
export interface AccountOrders {
  paidCount: number;
  spent: Price;
  lastPaidAt: string | null;
  recent: OrderSummary[];
}

const TRANSITION = { duration: DURATION.ui, ease: EASE.out.bezier };
const TAP = { scale: 0.97 };

// Panel de "Mi cuenta" con sesión (paso 5). Rejilla de dos columnas en
// escritorio (perfil y resumen arriba; pedidos recientes, preferencias y
// sesión abajo) y una sola en el teléfono. Movimiento:
// - GSAP: entradas de una sola vez por bloque al aparecer (account-motion.ts):
//   anillo HUD, nombre por letras, números que cuentan, barras de avance.
// - Motion: hover, tap, estados de los botones y los selectores.
// - CSS: el giro lento del anillo y el pulso de "Sesión activa", solo
//   mientras se ven y nunca con movimiento reducido.
export function AccountDashboard({ user, orders }: { user: AccountUser; orders: AccountOrders | null }) {
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const currency = orders?.spent.currency ?? 'USD';

  const formatValue = useCallback(
    (kind: string, value: number) => (kind === 'price' ? formatPrice({ amountCents: Math.round(value / 100) * 100, currency }, locale) : format.number(Math.round(value))),
    [currency, format, locale],
  );
  useAccountEntrance(root, formatValue);

  // Si la sesión se cierra en otra parte (el menú del encabezado), el panel
  // vuelve a pedirse al servidor y muestra la tarjeta para entrar.
  const { data, isPending } = authClient.useSession();
  const seen = useRef(false);
  useEffect(() => {
    if (data) seen.current = true;
    else if (!isPending && seen.current) router.refresh();
  }, [data, isPending, router]);

  return (
    <MotionConfig reducedMotion="user">
      <div ref={root} className={styles.dashboard}>
        <Profile user={user} />
        <Stats orders={orders} formatValue={formatValue} />
        <RecentOrders orders={orders} locale={locale} />
        <div className={styles.side}>
          <Preferences />
          <SessionCard />
        </div>
      </div>
    </MotionConfig>
  );
}

const noTimeZone = () => () => {};

function Profile({ user }: { user: AccountUser }) {
  const t = useTranslations('Account');
  const format = useFormatter();
  const [element, setElement] = useState<HTMLElement | null>(null);
  const live = useInView(element);
  // Mes y año de alta en la zona del visitante (en el HTML, UTC; al hidratar
  // React vuelve a pintar con la del navegador, como LocalTime).
  const timeZone = useSyncExternalStore(
    noTimeZone,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => 'UTC',
  );
  return (
    <section ref={setElement} className={styles.profile} data-enter data-live={live || undefined} aria-labelledby="account-user">
      <span className={styles.grid} aria-hidden="true" />
      <div className={styles.avatarWrap}>
        <HudRing />
        <Avatar name={user.name} email={user.email} image={user.image} size="xl" />
      </div>
      <div className={styles.identity}>
        <p className={styles.status} data-item>
          <span className={styles.liveDot} aria-hidden="true" />
          {t('sessionActive')}
        </p>
        <h2 id="account-user" className={styles.name} data-name>
          {user.name || user.email}
        </h2>
        <span className={styles.rule} data-rule aria-hidden="true" />
        <p className={styles.email} data-item>
          {user.email}
        </p>
        <dl className={styles.meta} data-item>
          <div>
            <dt className={styles.hud}>{t('memberSince')}</dt>
            <dd className={styles.mono}>
              <time dateTime={user.createdAt}>{format.dateTime(new Date(user.createdAt), { month: 'long', year: 'numeric', timeZone })}</time>
            </dd>
          </div>
          <div>
            <dt className={styles.hud}>{t('providerLabel')}</dt>
            <dd className={styles.mono}>{t('provider')}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

// Anillo HUD del avatar: marcas de grado (giran lento mientras se ve), un
// arco lima y cuatro miras. Solo adorno.
function HudRing() {
  return (
    <svg className={styles.ring} viewBox="0 0 160 160" data-ring aria-hidden="true">
      <g className={styles.ticks}>
        <circle cx="80" cy="80" r="76" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="1 6.95" />
      </g>
      <g className={styles.arc}>
        <circle cx="80" cy="80" r="69" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="70 363.5" />
        <circle cx="80" cy="80" r="69" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="18 415.5" strokeDashoffset="-200" />
      </g>
      <g className={styles.cross} stroke="currentColor" strokeWidth="1.5">
        <path d="M80 0v8M80 152v8M0 80h8M152 80h8" />
      </g>
    </svg>
  );
}

function Stats({ orders, formatValue }: { orders: AccountOrders | null; formatValue: (kind: string, value: number) => string }) {
  const t = useTranslations('Account');
  const format = useFormatter();
  const count = orders?.paidCount ?? 0;
  const spent = orders?.spent.amountCents ?? 0;
  const rows = [
    { key: 'orders', label: t('statOrders'), value: <Counter kind="number" value={count} formatValue={formatValue} /> },
    { key: 'spent', label: t('statSpent'), value: <Counter kind="price" value={spent} formatValue={formatValue} /> },
    {
      key: 'last',
      label: t('statLast'),
      value: orders?.lastPaidAt ? <LocalTime iso={orders.lastPaidAt} format="date" /> : <span className={styles.faint}>{t('statNone')}</span>,
    },
  ];
  return (
    <section className={styles.stats} data-enter aria-labelledby="account-stats">
      <header className={styles.panelHead} data-item>
        <h2 id="account-stats" className={styles.hudTitle}>
          {t('statsTitle')}
        </h2>
        <span className={styles.hud} aria-hidden="true">
          {format.number(rows.length, { minimumIntegerDigits: 2 })}
        </span>
      </header>
      <dl className={styles.statList}>
        {rows.map((row, index) => (
          <div key={row.key} className={styles.statRow} data-item data-stat={row.key}>
            <dt className={styles.statLabel}>
              <span className={styles.index} aria-hidden="true">
                {format.number(index + 1, { minimumIntegerDigits: 2 })}
              </span>
              {row.label}
            </dt>
            <dd className={styles.statValue}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Número que cuenta desde 0 al entrar (lo anima account-motion.ts). El valor
// final va en el HTML y en el texto oculto para lectores de pantalla.
function Counter({ kind, value, formatValue }: { kind: 'number' | 'price'; value: number; formatValue: (kind: string, value: number) => string }) {
  const text = formatValue(kind, value);
  return (
    <>
      <span data-count={value} data-kind={kind} aria-hidden="true">
        {text}
      </span>
      <span className="visually-hidden">{text}</span>
    </>
  );
}

function RecentOrders({ orders, locale }: { orders: AccountOrders | null; locale: Locale }) {
  const t = useTranslations('Account');
  const recent = orders?.recent ?? [];
  return (
    <section className={styles.recent} data-enter aria-labelledby="account-recent">
      <header className={styles.panelHead} data-item>
        <h2 id="account-recent" className={styles.sectionTitle}>
          {t('recentTitle')}
        </h2>
        {recent.length > 0 && (
          <Link href="/orders" className={styles.textLink}>
            {t('viewAll')}
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </Link>
        )}
      </header>
      {!orders ? (
        <p className={styles.error} role="alert" data-item>
          {t('ordersError')}
        </p>
      ) : recent.length ? (
        <ul className={styles.orderList}>
          {recent.map((order) => (
            <li key={order.id} data-item>
              <OrderCard order={order} locale={locale} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty} data-item>
          <span className={styles.emptyMark} aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <path d="M10 16h28l-2 24H12Z M18 16v-3a6 6 0 0 1 12 0v3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </span>
          <h3 className={styles.emptyTitle}>{t('emptyTitle')}</h3>
          <p className={styles.note}>{t('emptyText')}</p>
          <MotionLink href="/catalog" className={styles.primaryButton}>
            {t('browse')}
          </MotionLink>
        </div>
      )}
    </section>
  );
}

// Tarjeta de un pedido reciente: número, fecha, total, estado y una barra
// con el avance del envío (una marca por paso, encendida si ya pasó).
function OrderCard({ order, locale }: { order: OrderSummary; locale: Locale }) {
  const t = useTranslations('Orders');
  const ta = useTranslations('Account');
  const stage = order.status === 'paid' && order.trackingStage ? TRACKING_STEPS.indexOf(order.trackingStage) + 1 : 0;
  // La barra llega hasta la marca del paso actual (Pagado: solo la primera).
  const progress = stage > 0 ? (stage - 1) / (TRACKING_STEPS.length - 1) : 0;
  return (
    <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.99 }} transition={TRANSITION}>
      <Link href={`/orders/${order.id}`} className={styles.orderCard} aria-label={t('viewOrder', { number: order.number })}>
        <span className={styles.orderTop}>
          <span className={styles.orderNumber}>{order.number}</span>
          <StatusChip status={order.status} stage={order.trackingStage} />
        </span>
        <span className={styles.orderMeta}>
          <span className={styles.cell}>
            <span className={styles.hud}>{t('columns.date')}</span>
            <span className={styles.mono}>
              <LocalTime iso={order.createdAt} format="date" />
            </span>
          </span>
          <span className={styles.cell}>
            <span className={styles.hud}>{t('columns.items')}</span>
            <span className={styles.mono}>{t('itemCount', { count: order.itemCount })}</span>
          </span>
          <span className={styles.cell}>
            <span className={styles.hud}>{t('columns.total')}</span>
            <span className={styles.mono}>{formatPrice(order.total, locale)}</span>
          </span>
        </span>
        <span className={styles.progress}>
          <span className={styles.hud}>{ta('orderProgress')}</span>
          <span className={styles.track} data-tone={order.status} aria-hidden="true">
            <span className={styles.fill} data-bar={progress} style={{ '--progress': progress } as CSSProperties} />
            {TRACKING_STEPS.map((step, index) => (
              <span key={step} className={styles.tick} data-done={index < stage || undefined} style={{ '--at': index / (TRACKING_STEPS.length - 1) } as CSSProperties} />
            ))}
          </span>
        </span>
        <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true">
          <path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </Link>
    </motion.div>
  );
}

const MotionAnchor = motion.create(Link);

function MotionLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return (
    <MotionAnchor href={href} className={className} whileHover={{ y: -2 }} whileTap={TAP} transition={{ duration: DURATION.micro, ease: EASE.out.bezier }}>
      {children}
    </MotionAnchor>
  );
}

// Preferencias: idioma (la misma página en el otro idioma, como el selector
// del encabezado) y tema (el mismo store del interruptor, con su círculo de
// View Transitions que crece desde el botón).
function Preferences() {
  const t = useTranslations('Account');
  const tl = useTranslations('LocaleSwitch');
  const tt = useTranslations('Theme');
  const locale = useLocale();
  const pathname = usePathname();
  const theme = useThemeStore((state) => state.theme);
  const sync = useThemeStore((state) => state.sync);
  const setTheme = useThemeStore((state) => state.setTheme);
  useEffect(() => sync(), [sync]);

  const pickTheme = (next: Theme) => (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTheme(next, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };

  return (
    <section className={styles.prefs} data-enter aria-labelledby="account-prefs">
      <header className={styles.panelHead} data-item>
        <h2 id="account-prefs" className={styles.hudTitle}>
          {t('preferencesTitle')}
        </h2>
      </header>
      <div className={styles.prefRow} data-item>
        <span className={styles.prefLabel} id="account-language">
          {t('languageLabel')}
        </span>
        <nav className={styles.segmented} aria-labelledby="account-language">
          {routing.locales.map((code) => {
            const active = code === locale;
            return (
              <Link key={code} href={pathname} locale={code} lang={code} scroll={false} className={styles.segment} aria-current={active ? 'true' : undefined} data-active={active || undefined}>
                {active && <motion.span layoutId="account-locale-pill" className={styles.pill} transition={TRANSITION} />}
                <span className={styles.segmentText}>{tl(code)}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className={styles.prefRow} data-item>
        <span className={styles.prefLabel} id="account-theme">
          {t('themeLabel')}
        </span>
        <div className={styles.segmented} role="group" aria-labelledby="account-theme">
          {(['dark', 'light'] as const).map((option) => {
            const active = theme === option;
            return (
              <motion.button key={option} type="button" className={styles.segment} aria-pressed={active} data-active={active || undefined} onClick={pickTheme(option)} whileTap={TAP}>
                {active && <motion.span layoutId="account-theme-pill" className={styles.pill} transition={TRANSITION} />}
                <span className={styles.segmentText}>{option === 'dark' ? tt('night') : tt('day')}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

type Busy = 'one' | 'all' | null;

// Sesión: cerrar aquí o en todos los dispositivos (Better Auth revoca las
// demás sesiones y luego cierra esta). Al terminar, vuelve a la home.
function SessionCard() {
  const t = useTranslations('Account');
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [failed, setFailed] = useState(false);

  const run = async (kind: Exclude<Busy, null>) => {
    setBusy(kind);
    setFailed(false);
    try {
      if (kind === 'all') {
        const { error } = await authClient.revokeOtherSessions();
        if (error) throw new Error(error.message);
      }
      await signOut();
      router.replace('/');
    } catch {
      setBusy(null);
      setFailed(true);
    }
  };

  return (
    <section className={styles.session} data-enter aria-labelledby="account-session">
      <header className={styles.panelHead} data-item>
        <h2 id="account-session" className={styles.hudTitle}>
          {t('sessionTitle')}
        </h2>
        <span className={styles.status}>
          <span className={styles.liveDot} aria-hidden="true" />
          {t('sessionActive')}
        </span>
      </header>
      <p className={styles.note} data-item>
        {t('sessionLead')}
      </p>
      <div className={styles.sessionActions} data-item>
        <PendingButton tone="exit" busy={busy === 'one'} disabled={busy !== null} label={t('signOut')} pendingLabel={t('signingOut')} onClick={() => run('one')} />
        <PendingButton tone="quiet" busy={busy === 'all'} disabled={busy !== null} label={t('signOutAll')} pendingLabel={t('signingOut')} onClick={() => run('all')} />
        <p className={styles.hint}>{t('signOutAllHint')}</p>
      </div>
      <p className={styles.error} role="alert">
        {failed ? t('signOutError') : null}
      </p>
    </section>
  );
}

function PendingButton({ tone, busy, disabled, label, pendingLabel, onClick }: { tone: 'exit' | 'quiet'; busy: boolean; disabled: boolean; label: string; pendingLabel: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      className={styles.actionButton}
      data-tone={tone}
      disabled={disabled}
      aria-busy={busy || undefined}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : TAP}
      transition={{ duration: DURATION.micro, ease: EASE.out.bezier }}
      onClick={onClick}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {busy && (
          <motion.span key="spinner" className={styles.spinner} aria-hidden="true" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={TRANSITION} />
        )}
        <motion.span key={busy ? 'pending' : 'idle'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={TRANSITION}>
          {busy ? pendingLabel : label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
