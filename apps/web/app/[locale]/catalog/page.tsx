import type { Locale, ProductCard as Product } from '@airspace/contracts';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cache, Suspense } from 'react';
import { FilterMenu, type FilterOption } from '@/components/catalog/FilterMenu';
import { FilterSheet, type SheetGroup } from '@/components/catalog/FilterSheet';
import { Pager } from '@/components/catalog/Pager';
import { PendingMark } from '@/components/catalog/PendingMark';
import { ResultsRegion } from '@/components/catalog/ResultsRegion';
import { ProductCard } from '@/components/catalog/ProductCard';
import { SearchBox } from '@/components/catalog/SearchBox';
import { SegmentedList } from '@/components/catalog/SegmentedList';
import toolbar from '@/components/catalog/CatalogToolbar.module.css';
import { Reveal } from '@/components/motion/Reveal';
import { pageLocale } from '@/i18n/locale';
import { Link, redirect } from '@/i18n/navigation';
import { getBrands, getCategories, getProducts } from '@/lib/api';
import { type CatalogSort, type CatalogState, catalogHref, facetProducts, isFiltered, parseCatalogState, SORTS, searchText, sortProducts } from '@/lib/catalog-query';
import { pageCount, pageItems, pageRange, parsePageParam } from '@/lib/pagination';
import { localeAlternates } from '@/lib/seo';
import styles from './catalog.module.css';

// La validación de navegación instantánea (solo en desarrollo) no puede
// simular esta página por un componente de cliente del layout que suspende
// en SSR. La página ya responde al instante con su esqueleto en Suspense,
// así que se excluye de esa validación.
export const instant = false;

type CatalogT = Awaited<ReturnType<typeof getTranslations<'Catalog'>>>;

// Nombres de la categoría y el tipo de prenda de un producto, en el idioma de
// la página (la búsqueda también los mira).
function catalogLabels(t: CatalogT, product: Product) {
  return { category: t(`category.${product.category}`), subcategory: product.subcategory ? t(`subcategory.${product.subcategory}`) : undefined };
}

// Llave del mensaje de cada orden.
const SORT_LABEL = { featured: 'featured', 'price-asc': 'priceAsc', 'price-desc': 'priceDesc', name: 'name' } as const satisfies Record<CatalogSort, string>;

// Desde la página 2 la canónica (y sus versiones por idioma) llevan ?page=N
// y el título dice la página. Las vistas filtradas siguen apuntando al
// catálogo completo, como antes de paginar. Una página fuera de rango
// redirige (proxy.ts y, si la API no le respondió, CatalogResults); aquí se
// usa ya la página corregida, con la misma lista en caché. Una búsqueda
// (?q=) no se indexa: hay infinitas y todas repiten productos del catálogo,
// pero sus enlaces se siguen.
export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/catalog'>): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const query = await searchParams;
  const state = parseCatalogState(query);
  const [t, products] = await Promise.all([getTranslations({ locale: locale, namespace: 'Catalog' }), getProducts({ locale })]);
  // La búsqueda y los filtros se aplican sobre la lista completa en caché.
  const results = facetProducts(products.items, state, (product) => searchText(product, catalogLabels(t, product))).results;
  const page = Math.min(parsePageParam(query.page) ?? 1, pageCount(results.length));
  const path = page > 1 && !isFiltered(state) ? `/catalog?page=${page}` : '/catalog';
  return {
    title: page > 1 ? t('metaTitlePaged', { page }) : t('metaTitle'),
    description: t('metaDescription'),
    alternates: localeAlternates(locale, path),
    ...(state.q && { robots: { index: false, follow: true } }),
  };
}

type SearchParams = PageProps<'/[locale]/catalog'>['searchParams'];

// Catálogo con búsqueda, filtros por categoría, marca y tipo de prenda (en la
// ropa) y orden, paginado de 12 en 12. Todo vive en la URL, así se puede
// compartir y sobrevive a una recarga o al cambio de idioma.
//
// El buscador va en el cascarón estático: su respaldo de Suspense es el mismo
// formulario vacío, que sin JS se ve y funciona (un GET con ?q=). Lo demás
// depende de la URL y llega en streaming, en límites separados que leen el
// mismo cálculo (loadCatalog).
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
      <nav className={toolbar.filters} aria-label={t('filtersLabel')}>
        <div className={toolbar.bar}>
          <Suspense fallback={<SearchBox state={{}} />}>
            <CatalogSearch searchParams={searchParams} />
          </Suspense>
          <Suspense fallback={null}>
            <CatalogControls locale={locale} searchParams={searchParams} />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <CatalogFilterRows locale={locale} searchParams={searchParams} />
        </Suspense>
      </nav>
      <Suspense fallback={<p className={`${styles.status} ${styles.pending}`}>{t('loading')}</p>}>
        <CatalogResults locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// Búsqueda, filtros, orden, página y opciones de la barra para esta URL. Con
// cache() los cuatro límites de la página hacen el cálculo una sola vez por
// petición (la lista viene de la caché de datos, una entrada por idioma: la
// misma de la home y el sitemap).
const loadCatalog = cache(async (locale: Locale, searchParams: SearchParams) => {
  const query = await searchParams;
  const state = parseCatalogState(query);
  const [t, products, brands, categories] = await Promise.all([getTranslations({ locale, namespace: 'Catalog' }), getProducts({ locale }), getBrands(), getCategories()]);

  const facets = facetProducts(products.items, state, (product) => searchText(product, catalogLabels(t, product)));
  const results = sortProducts(facets.results, state.sort, locale);
  const total = results.length;
  // Mismo estado con un cambio: cualquier filtro nuevo vuelve a la página 1.
  const withState = (patch: Partial<CatalogState>) => catalogHref({ ...state, ...patch });

  const totalPages = pageCount(total);
  const requested = parsePageParam(query.page);
  const page = Math.min(requested ?? 1, totalPages);

  // Categorías: primero las que tienen productos; las vacías (sin nada
  // publicado) al final con "Próximamente". El número cuenta con la búsqueda
  // y la marca puestas.
  const categoryItems = [...categories.items].sort((a, b) => Number(b.productCount > 0) - Number(a.productCount > 0));
  const optionLabel = (label: string, count: number) => t('optionCount', { label, count });

  const brandCount = Object.values(facets.brands).reduce((sum, count) => sum + count, 0);
  const brandOptions: FilterOption[] = [
    { key: 'all', label: t('allBrands'), count: brandCount, ariaLabel: optionLabel(t('allBrands'), brandCount), href: withState({ brand: undefined }), selected: !state.brand },
    ...brands.items.map((item) => {
      const count = facets.brands[item.slug] ?? 0;
      return { key: item.slug, label: item.name, count, ariaLabel: optionLabel(item.name, count), href: withState({ brand: item.slug }), selected: state.brand === item.slug, disabled: count === 0 };
    }),
  ];
  const sortOptions: FilterOption[] = SORTS.map((sort) => ({
    key: sort,
    label: t(`sortOption.${SORT_LABEL[sort]}`),
    href: withState({ sort: sort === 'featured' ? undefined : sort }),
    selected: (state.sort ?? 'featured') === sort,
  }));
  // Tipos de prenda: solo dentro de la ropa y solo los que tienen productos.
  const subcategories = categories.items.find((item) => item.slug === 'apparel')?.subcategories.filter((item) => item.productCount > 0) ?? [];
  const subcategoryOptions: FilterOption[] =
    state.category === 'apparel' && subcategories.length > 1
      ? [
          { key: 'all', label: t('allSubcategories'), href: withState({ subcategory: undefined }), selected: !state.subcategory },
          ...subcategories.map((item) => {
            const count = facets.subcategories[item.slug] ?? 0;
            const label = t(`subcategory.${item.slug}`);
            return { key: item.slug, label, count, ariaLabel: optionLabel(label, count), href: withState({ subcategory: item.slug }), selected: state.subcategory === item.slug, disabled: count === 0 };
          }),
        ]
      : [];
  const brandName = brands.items.find((item) => item.slug === state.brand)?.name ?? state.brand;

  return { t, query, state, facets, results, total, totalPages, requested, page, withState, categoryItems, brandOptions, sortOptions, subcategoryOptions, brandName };
});

type CatalogBoundaryProps = { locale: Locale; searchParams: SearchParams };

// El buscador con el estado de la URL (su texto y los demás filtros como
// campos ocultos). No espera a la lista: solo lee la URL.
async function CatalogSearch({ searchParams }: { searchParams: SearchParams }) {
  return <SearchBox state={parseCatalogState(await searchParams)} />;
}

// Categorías (control segmentado), menús Marca y Ordenar y, en anchos
// menores, el botón de la hoja "Filtros".
async function CatalogControls({ locale, searchParams }: CatalogBoundaryProps) {
  const { t, state, facets, total, withState, categoryItems, brandOptions, sortOptions, subcategoryOptions, brandName } = await loadCatalog(locale, searchParams);

  const sheetGroups: SheetGroup[] = [
    ...(subcategoryOptions.length ? [{ key: 'subcategory', label: t('subcategoryLabel'), options: subcategoryOptions }] : []),
    { key: 'brand', label: t('brandLabel'), options: brandOptions },
    { key: 'sort', label: t('sortLabel'), options: sortOptions },
  ];
  const sheetActive = [state.brand, state.subcategory, state.sort].filter(Boolean).length;

  return (
    <div className={toolbar.controls}>
      <SegmentedList className={toolbar.segmented} label={t('categoryLabel')} active={state.category}>
        <li>
          <Link href={withState({ category: undefined })} scroll={false} className={toolbar.segment} aria-current={!state.category ? 'true' : undefined}>
            {t('allCategories')}
            <span className={toolbar.segmentCount}>{facets.all}</span>
          <PendingMark />
        </Link>
        </li>
        {categoryItems.map((item) => {
          const count = facets.categories[item.slug] ?? 0;
          const label = t(`category.${item.slug}`);
          if (item.productCount === 0) {
            return (
              <li key={item.slug}>
                <span className={toolbar.segment} aria-disabled="true">
                  {label}
                  <span className={toolbar.segmentSoon}>{t('comingSoon')}</span>
                </span>
              </li>
            );
          }
          // Sin resultados con la búsqueda o la marca: se ve, pero no es enlace.
          if (count === 0 && state.category !== item.slug) {
            return (
              <li key={item.slug}>
                <span className={toolbar.segment} aria-disabled="true">
                  {label}
                  <span className={toolbar.segmentCount}>{count}</span>
                </span>
              </li>
            );
          }
          return (
            <li key={item.slug}>
              <Link href={withState({ category: item.slug })} scroll={false} className={toolbar.segment} aria-current={state.category === item.slug ? 'true' : undefined}>
                {label}
                <span className={toolbar.segmentCount}>{count}</span>
              <PendingMark />
            </Link>
            </li>
          );
        })}
      </SegmentedList>
      <div className={toolbar.menus}>
        <FilterMenu label={t('brandLabel')} value={brandName && state.brand ? brandName : t('anyBrand')} options={brandOptions} align="end" />
        <FilterMenu label={t('sortLabel')} value={t(`sortOption.${SORT_LABEL[state.sort ?? 'featured']}`)} options={sortOptions} align="end" />
      </div>
      <FilterSheet groups={sheetGroups} total={total} active={sheetActive} clearHref={catalogHref({ q: state.q, category: state.category })} />
    </div>
  );
}

// Bajo la barra: los tipos de prenda (en la ropa) y las píldoras de los
// filtros puestos, cada una con su ×. El orden no es un filtro: se ve en su
// botón y "Limpiar todo" lo conserva.
async function CatalogFilterRows({ locale, searchParams }: CatalogBoundaryProps) {
  const { t, state, withState, subcategoryOptions, brandName } = await loadCatalog(locale, searchParams);

  const pills = [
    state.q && { key: 'q', label: t('queryPill', { q: state.q }), href: withState({ q: undefined }) },
    state.category && { key: 'category', label: t(`category.${state.category}`), href: withState({ category: undefined }) },
    state.subcategory && { key: 'subcategory', label: t(`subcategory.${state.subcategory}`), href: withState({ subcategory: undefined }) },
    state.brand && { key: 'brand', label: brandName ?? '', href: withState({ brand: undefined }) },
  ].filter((pill) => Boolean(pill)) as { key: string; label: string; href: ReturnType<typeof catalogHref> }[];

  const xIcon = (
    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
      <path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="m3 3 6 6M9 3 3 9" />
    </svg>
  );

  return (
    <>
      {subcategoryOptions.length > 0 && (
        <ul className={toolbar.subRow} aria-label={t('subcategoryLabel')}>
          {subcategoryOptions.map((option) => (
            <li key={option.key}>
              {option.disabled && !option.selected ? (
                <span className={toolbar.chip} aria-disabled="true" aria-label={option.ariaLabel}>
                  {option.label}
                  {option.count !== undefined && <span className={toolbar.chipCount}>{option.count}</span>}
                </span>
              ) : (
                <Link href={option.href} scroll={false} className={toolbar.chip} aria-current={option.selected ? 'true' : undefined} aria-label={option.ariaLabel}>
                  {option.label}
                  {option.count !== undefined && <span className={toolbar.chipCount}>{option.count}</span>}
                <PendingMark />
              </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {pills.length > 0 && (
        <ul className={toolbar.pills} aria-label={t('activeFiltersLabel')}>
          {pills.map((pill) => (
            <li key={pill.key}>
              <Link href={pill.href} scroll={false} className={toolbar.pill} aria-label={t('removeFilter', { label: pill.label })}>
                {pill.label}
                {xIcon}
              <PendingMark />
            </Link>
            </li>
          ))}
          <li>
            <Link href={catalogHref({ sort: state.sort })} scroll={false} className={toolbar.clearAll}>
              {t('clearAll')}
            <PendingMark />
          </Link>
          </li>
        </ul>
      )}
    </>
  );
}

// Conteo, rejilla (o estado vacío) y paginador.
async function CatalogResults({ locale, searchParams }: CatalogBoundaryProps) {
  const { t, state, results, total, totalPages, requested, page, categoryItems } = await loadCatalog(locale, searchParams);

  // Página pedida: si no es un entero válido (o es la 1 escrita a mano) se
  // redirige a la URL sin página; si se pasa del final, a la última. Normalmente
  // ya lo hizo proxy.ts con una redirección HTTP de verdad; esto queda para
  // cuando el proxy no pudo leer la lista (aquí sale como redirección en el
  // cliente, porque la página ya empezó a enviarse).
  if (requested === null || requested === 1 || (requested !== undefined && requested > totalPages)) {
    redirect({ href: catalogHref(state, page), locale });
  }
  const visible = pageItems(results, page);
  const { start, end } = pageRange(page, total);

  return (
    // Destino del salto al cambiar de página (PageLink); se atenúa mientras
    // llega la página o el filtro nuevo.
    <ResultsRegion className={styles.results}>
      {/* Sin resultados, el título grande del estado vacío ya lo dice: el
          conteo queda solo como aviso para lectores de pantalla. */}
      <p className={visible.length > 0 ? styles.status : 'visually-hidden'} role="status">
        {totalPages > 1 ? t('resultRange', { start, end, total }) : t('resultCount', { count: total })}
      </p>

      {visible.length > 0 ? (
        // key: cada página (y cada filtro) monta su rejilla, así las
        // tarjetas nuevas hacen su entrada en vez de aparecer de golpe.
        <Reveal key={`${state.q}-${state.category}-${state.subcategory}-${state.brand}-${state.sort}-${page}`} as="ul" className={styles.grid} stagger={0.04} leadOnLoad>
          {visible.map((product, index) => (
            <li key={product.slug}>
              <ProductCard product={product} eager={index < 4} />
            </li>
          ))}
        </Reveal>
      ) : (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{state.q ? t('emptyQuery', { q: state.q }) : t('empty')}</p>
          <Link href="/catalog" className={styles.reset}>
            {t('clearFilters')}
          </Link>
          <p>{t('suggestions')}</p>
          <ul className={styles.suggestions}>
            {categoryItems
              .filter((item) => item.productCount > 0)
              .map((item) => (
                <li key={item.slug}>
                  <Link href={catalogHref({ category: item.slug })} className={toolbar.chip}>
                    {t(`category.${item.slug}`)}
                    <span className={toolbar.chipCount}>{item.productCount}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      )}

      {totalPages > 1 && <Pager page={page} total={totalPages} href={(target) => catalogHref(state, target)} />}
    </ResultsRegion>
  );
}
