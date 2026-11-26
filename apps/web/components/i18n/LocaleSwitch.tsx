'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import styles from './LocaleSwitch.module.css';

// ES / EN: lleva a la misma página (y los mismos filtros) en el otro idioma.
export function LocaleSwitch({ withQuery = true }: { withQuery?: boolean }) {
  const t = useTranslations('LocaleSwitch');
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <nav className={styles.switch} aria-label={t('label')}>
      {routing.locales.map((code) => (
        <LocaleLink key={code} code={code} pathname={pathname} active={code === locale} withQuery={withQuery} label={t('optionLabel', { language: t(code) })} />
      ))}
    </nav>
  );
}

function LocaleLink({ code, pathname, active, withQuery, label }: { code: (typeof routing.locales)[number]; pathname: string; active: boolean; withQuery: boolean; label: string }) {
  return withQuery ? <LinkWithQuery code={code} pathname={pathname} active={active} label={label} /> : <LocaleAnchor code={code} href={pathname} active={active} label={label} />;
}

function LinkWithQuery({ code, pathname, active, label }: { code: (typeof routing.locales)[number]; pathname: string; active: boolean; label: string }) {
  const search = useSearchParams().toString();
  return <LocaleAnchor code={code} href={search ? `${pathname}?${search}` : pathname} active={active} label={label} />;
}

function LocaleAnchor({ code, href, active, label }: { code: (typeof routing.locales)[number]; href: string; active: boolean; label: string }) {
  return (
    <Link href={href} locale={code} lang={code} aria-current={active ? 'true' : undefined} scroll={false}>
      {code.toUpperCase()}
      <span className="visually-hidden">{label}</span>
    </Link>
  );
}
