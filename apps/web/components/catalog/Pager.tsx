import { getFormatter, getTranslations } from 'next-intl/server';
import { pageWindow } from '@/lib/pagination';
import styles from './Pager.module.css';
import { PageLink } from './PageLink';

type CatalogHref = { pathname: '/catalog'; query: Record<string, string> };

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg className={styles.chevron} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path d={direction === 'left' ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6 4.5 9.5'} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Paginador del catálogo, bajo la rejilla: Anterior, números y Siguiente con
// enlaces reales (rel prev y next). La página actual no es enlace. En el
// teléfono los números dan paso a "Página 2 de 7".
export async function Pager({ page, total, href }: { page: number; total: number; href: (page: number) => CatalogHref }) {
  const [t, format] = await Promise.all([getTranslations('Catalog'), getFormatter()]);

  return (
    <nav className={styles.pager} aria-label={t('paginationLabel')}>
      {page > 1 ? (
        <PageLink href={href(page - 1)} rel="prev" eager className={styles.step}>
          <Chevron direction="left" />
          {t('previousPage')}
        </PageLink>
      ) : (
        <span className={styles.step} aria-disabled="true">
          <Chevron direction="left" />
          {t('previousPage')}
        </span>
      )}

      <ul className={styles.pages}>
        {pageWindow(page, total).map((item, index) =>
          item === 'gap' ? (
            <li key={`gap-${index}`} className={styles.gap} aria-hidden="true" />
          ) : (
            <li key={item}>
              {item === page ? (
                <span className={styles.page} aria-current="page" aria-label={t('pageLink', { page: item })}>
                  {format.number(item)}
                </span>
              ) : (
                <PageLink href={href(item)} className={styles.page} aria-label={t('pageLink', { page: item })}>
                  {format.number(item)}
                </PageLink>
              )}
            </li>
          ),
        )}
      </ul>

      <p className={styles.compact}>{t('pageOf', { page, total })}</p>

      {page < total ? (
        <PageLink href={href(page + 1)} rel="next" eager className={styles.step}>
          {t('nextPage')}
          <Chevron direction="right" />
        </PageLink>
      ) : (
        <span className={styles.step} aria-disabled="true">
          {t('nextPage')}
          <Chevron direction="right" />
        </span>
      )}
    </nav>
  );
}
