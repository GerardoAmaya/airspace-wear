import type { Credit } from '@airspace/contracts';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCredits } from '@/lib/api';
import { Reveal } from '@/components/motion/Reveal';
import { PagedRows } from '@/components/content/PagedRows';
import styles from '@/components/content/content.module.css';
import { localeAlternates } from '@/lib/seo';
import { pageLocale } from '@/i18n/locale';

export async function generateMetadata({ params }: PageProps<'/[locale]/credits'>): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const t = await getTranslations({ locale: locale, namespace: 'Credits' });
  return { title: t('metaTitle'), description: t('metaDescription'), alternates: localeAlternates(locale, '/credits') };
}

// Créditos de terceros (modelos 3D, fuentes y librerías), leídos de la API,
// que a su vez los toma del manifest de modelos. Ver CREDITS.md.
export default async function CreditsPage({ params }: PageProps<'/[locale]/credits'>) {
  const locale = pageLocale((await params).locale);
  setRequestLocale(locale);
  const [t, credits] = await Promise.all([getTranslations('Credits'), getCredits()]);
  const groups = (['model', 'font', 'library'] as const).map((kind) => ({ kind, items: credits.items.filter((item) => item.kind === kind) }));
  const restricted = credits.items.filter((item) => item.kind === 'model' && (!item.license.commercialUse || item.license.shareAlike));

  return (
    <div className={styles.page}>
      <Reveal as="header" className={styles.intro} immediate>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.lead}>{t('lead')}</p>
      </Reveal>

      {groups.map(({ kind, items }) => (
        <section key={kind} className={styles.panel} aria-labelledby={`credits-${kind}`}>
          <div className={styles.panelHead}>
            <h2 id={`credits-${kind}`} className={styles.panelTitle}>
              {t(`group.${kind}`)}
            </h2>
            <span className={styles.panelCount}>{t('count', { count: items.length })}</span>
          </div>
          {kind === 'model' ? (
            // Los modelos son muchos (más de 80): se paginan de 12 en 12.
            <PagedRows
              pageSize={12}
              labels={{ nav: t('pager.nav'), previous: t('pager.previous'), next: t('pager.next'), pageLink: t.raw('pager.pageLink') as string, pageOf: t.raw('pager.pageOf') as string }}
            >
              {items.map((item) => (
                <CreditRow key={item.key} credit={item} t={t} />
              ))}
            </PagedRows>
          ) : (
            <ul className={styles.rows}>
              {items.map((item) => (
                <CreditRow key={item.key} credit={item} t={t} />
              ))}
            </ul>
          )}
          {kind === 'model' && (
            <>
              <p className={styles.note}>{t('modelsNote')}</p>
              {items.some((item) => item.key.startsWith('avatar:')) && <p className={styles.note}>{t('avatarNote')}</p>}
              {restricted.map((item) => (
                <p key={item.key} className={styles.note}>
                  {t('licenseNote', {
                    name: item.name,
                    terms: [!item.license.commercialUse && t('nonCommercial'), item.license.shareAlike && t('shareAlike', { license: item.license.name })]
                      .filter(Boolean)
                      .join(t('termsSeparator')),
                  })}
                </p>
              ))}
            </>
          )}
        </section>
      ))}
    </div>
  );
}

function CreditRow({ credit, t }: { credit: Credit; t: Awaited<ReturnType<typeof getTranslations<'Credits'>>> }) {
  const external = (href: string | null, text: string) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {text}
        <span className="visually-hidden">{t('opensNewTab')}</span>
      </a>
    ) : (
      text
    );
  return (
    <li className={styles.row}>
      <div className={styles.cell}>
        <span className={styles.label}>{t('column.name')}</span>
        <strong className={styles.name}>{credit.name}</strong>
      </div>
      {credit.sourceTitle && (
        <div className={styles.cell}>
          <span className={styles.label}>{t('column.source')}</span>
          {external(credit.sourceUrl, credit.sourceTitle)}
        </div>
      )}
      <div className={styles.cell}>
        <span className={styles.label}>{t('column.author')}</span>
        {external(credit.authorUrl, credit.author)}
      </div>
      <div className={styles.cell}>
        <span className={styles.label}>{t('column.license')}</span>
        {external(credit.license.url, credit.license.name)}
      </div>
      {credit.changes.length > 0 && (
        <div className={`${styles.cell} ${styles.wide}`}>
          <span className={styles.label}>{t('column.changes')}</span>
          <span className={styles.changes}>{credit.changes.map((change) => t(`change.${change}`)).join(t('changesSeparator'))}</span>
        </div>
      )}
    </li>
  );
}
