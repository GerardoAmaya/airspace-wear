import { type Category, categorySchema, type Locale, slugSchema, type Subcategory, subcategorySchema } from '@airspace/contracts';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { ProductCard } from '@/components/catalog/ProductCard';
import { Reveal } from '@/components/motion/Reveal';
import { pageLocale } from '@/i18n/locale';
import { Link } from '@/i18n/navigation';
import { getBrands, getCategories, getProducts } from '@/lib/api';
import { localeAlternates } from '@/lib/seo';
import styles from './catalog.module.css';

// La validación de navegación instantánea (solo en desarrollo) no puede
// simular esta página por un componente de cliente del layout que suspende
// en SSR. La página ya responde al instante con su esqueleto en Suspense,
// así que se excluye de esa validación.
export const instant = false;

export async function generateMetadata({ params }: PageProps<'/[locale]/catalog'>): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const t = await getTranslations({ locale: locale, namespace: 'Catalog' });
  return { title: t('metaTitle'), description: t('metaDescription'), alternates: localeAlternates(locale, '/catalog') };
}

// Catálogo con filtros por categoría y marca, y por tipo de prenda dentro de
// la ropa (en la URL, así se pueden compartir y sobreviven a una recarga o al
// cambio de idioma).
export default async function CatalogPage({ params, searchParams }: PageProps<'/[locale]/catalog'>) {
  const locale = pageLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations('Catalog');
  return (
    <div className={styles.page}>
      <Reveal as="header" className={styles.intro} immediate>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.lead}>{t('lead')}</p>
      </Reveal>
      <Suspense fallback={<p className={`${styles.status} ${styles.pending}`}>{t('loading')}</p>}>
        <CatalogResults locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CatalogResults({ locale, searchParams }: { locale: Locale; searchParams: PageProps<'/[locale]/catalog'>['searchParams'] }) {
  const query = await searchParams;
  // Parámetros inválidos se ignoran (se muestra todo) en lugar de fallar.
  const category = categorySchema.safeParse(query.category).data;
  const brand = slugSchema.safeParse(query.brand).data;
  // El tipo de prenda solo aplica dentro de la ropa.
  const subcategory = category === 'apparel' ? subcategorySchema.safeParse(query.subcategory).data : undefined;

  const [t, products, brands, categories] = await Promise.all([
    getTranslations('Catalog'),
    getProducts({ locale, category, brand, subcategory }),
    getBrands(),
    getCategories(),
  ]);

  const href = (next: { category?: Category; brand?: string; subcategory?: Subcategory }) => ({
    pathname: '/catalog' as const,
    query: Object.fromEntries(Object.entries(next).filter(([, value]) => value)),
  });

  const subcategories = categories.items.find((item) => item.slug === 'apparel')?.subcategories.filter((item) => item.productCount > 0) ?? [];

  return (
    <>
      <nav className={styles.filters} aria-label={t('filtersLabel')}>
        <ul className={styles.chips} aria-label={t('categoryLabel')}>
          <li>
            <Link href={href({ brand })} className={styles.chip} aria-current={!category ? 'true' : undefined}>
              {t('allCategories')}
            </Link>
          </li>
          {/* Primero las categorías con productos; las vacías (ropa) al final. */}
          {[...categories.items].sort((a, b) => Number(b.productCount > 0) - Number(a.productCount > 0)).map((item) =>
            item.productCount > 0 ? (
              <li key={item.slug}>
                <Link href={href({ category: item.slug, brand })} className={styles.chip} aria-current={category === item.slug ? 'true' : undefined}>
                  {t(`category.${item.slug}`)}
                  <span className={styles.chipCount}>{item.productCount}</span>
                </Link>
              </li>
            ) : (
              <li key={item.slug}>
                <span className={styles.chip} aria-disabled="true">
                  {t(`category.${item.slug}`)}
                  <span className={styles.chipSoon}>{t('comingSoon')}</span>
                </span>
              </li>
            ),
          )}
        </ul>
        {/* Tipos de prenda: solo dentro de la ropa y solo los que tienen productos. */}
        {category === 'apparel' && subcategories.length > 1 && (
          <ul className={styles.chips} aria-label={t('subcategoryLabel')}>
            <li>
              <Link href={href({ category, brand })} className={styles.chip} aria-current={!subcategory ? 'true' : undefined}>
                {t('allSubcategories')}
              </Link>
            </li>
            {subcategories.map((item) => (
              <li key={item.slug}>
                <Link href={href({ category, brand, subcategory: item.slug })} className={styles.chip} aria-current={subcategory === item.slug ? 'true' : undefined}>
                  {t(`subcategory.${item.slug}`)}
                  <span className={styles.chipCount}>{item.productCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <ul className={styles.chips} aria-label={t('brandLabel')}>
          <li>
            <Link href={href({ category, subcategory })} className={styles.chip} aria-current={!brand ? 'true' : undefined}>
              {t('allBrands')}
            </Link>
          </li>
          {brands.items.map((item) => (
            <li key={item.slug}>
              <Link href={href({ category, brand: item.slug, subcategory })} className={styles.chip} aria-current={brand === item.slug ? 'true' : undefined}>
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className={styles.status} role="status">
        {t('resultCount', { count: products.items.length })}
      </p>

      {products.items.length > 0 ? (
        <Reveal as="ul" className={styles.grid} stagger={0.04} leadOnLoad>
          {products.items.map((product) => (
            <li key={product.slug}>
              <ProductCard product={product} />
            </li>
          ))}
        </Reveal>
      ) : (
        <div className={styles.empty}>
          <p>{t('empty')}</p>
          <Link href="/catalog" className={styles.reset}>
            {t('resetFilters')}
          </Link>
        </div>
      )}
    </>
  );
}
