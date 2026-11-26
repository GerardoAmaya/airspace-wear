import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AddToCart } from '@/components/cart/AddToCart';
import { ArButton } from '@/components/product/ArButton';
import { MediaSkeleton } from '@/components/product/MediaSkeleton';
import { ProductTour } from '@/components/product/ProductTour';
import { ProductViewer } from '@/components/product/ProductViewer';
import { pageLocale } from '@/i18n/locale';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { getProduct, getProducts } from '@/lib/api';
import { formatPrice } from '@/lib/price';
import { localeAlternates } from '@/lib/seo';
import styles from './product.module.css';

// Ficha de producto, versión base (fase 2): datos, tallas y carrito. Las
// secciones 3D con hotspots, el giro y AR llegan en la fase 3.
// La validación de navegación instantánea (solo en desarrollo) no puede
// simular esta página por un componente de cliente del layout que suspende
// en SSR. La página ya responde al instante con su esqueleto en Suspense,
// así que se excluye de esa validación.
export const instant = false;

export async function generateStaticParams() {
  const lists = await Promise.all(routing.locales.map((locale) => getProducts({ locale })));
  return routing.locales.flatMap((locale, index) => lists[index]!.items.map((item) => ({ locale, slug: item.slug })));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/products/[slug]'>): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = pageLocale(raw);
  const product = await getProduct(slug, locale);
  if (!product) return {};
  return { title: product.name, description: product.tagline, alternates: localeAlternates(locale, `/products/${slug}`) };
}

// La ficha se sirve con un esqueleto instantáneo y los datos llegan en
// streaming: así la navegación desde el catálogo no espera a la API.
//
// Antes del esqueleto se comprueba el slug contra la lista del catálogo (la
// misma lectura en caché de generateStaticParams). Así un slug que no existe
// responde 404 de verdad: si notFound() llegara dentro del Suspense, el
// esqueleto ya habría salido con estado 200 (un "soft 404"). Para los slugs
// prerenderizados la comprobación se resuelve en el build y la navegación
// sigue siendo instantánea.
export default async function ProductPage({ params }: PageProps<'/[locale]/products/[slug]'>) {
  const { locale: raw, slug } = await params;
  const locale = pageLocale(raw);
  const { items } = await getProducts({ locale: locale });
  if (!items.some((item) => item.slug === slug)) notFound();
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

function ProductSkeleton() {
  return (
    <div className={styles.page} aria-busy="true">
      <div className={styles.layout}>
        <div className={styles.media}>
          <MediaSkeleton className={styles.mediaFrame} haloClassName={styles.halo} />
        </div>

        <div className={styles.info}>
          <span className={styles.skeletonLine} />
          <span className={styles.skeletonTitle} />
          <span className={styles.skeletonLine} />
        </div>
      </div>
    </div>
  );
}

async function ProductContent({ params }: { params: PageProps<'/[locale]/products/[slug]'>['params'] }) {
  const { locale: rawLocale, slug } = await params;
  const locale = pageLocale(rawLocale);
  setRequestLocale(locale);
  const product = await getProduct(slug, locale);
  if (!product) notFound();
  const [t, availability] = await Promise.all([getTranslations('Product'), getTranslations('Availability')]);
  const poster = product.model?.poster ?? null;

  const specs: Array<[string, string]> = [];
  const { attributes } = product;
  if (typeof attributes.weightGrams === 'number') specs.push([t('spec.weight'), t('spec.grams', { value: attributes.weightGrams })]);
  if (typeof attributes.stackMm === 'number') specs.push([t('spec.stack'), t('spec.millimeters', { value: attributes.stackMm })]);
  if (typeof attributes.panels === 'number') specs.push([t('spec.panels'), String(attributes.panels)]);
  if (typeof attributes.year === 'number') specs.push([t('spec.year'), String(attributes.year)]);
  for (const [part, value] of Object.entries(product.materials)) {
    if (part === 'upper' || part === 'sole' || part === 'finish') specs.push([t(`spec.${part}`), value]);
  }

  return (
    <article className={styles.page}>
      <nav className={styles.crumbs} aria-label={t('breadcrumbLabel')}>
        <Link href="/catalog">{t('backToCatalog')}</Link>
      </nav>

      <div className={styles.layout}>
        <div className={styles.media}>
          {product.model ? (
            <ProductViewer model={product.model} hotspots={product.hotspots} name={product.name} slug={product.slug} accent={product.accent} />
          ) : (
            <div className={styles.mediaFrame}>
              <div className={styles.halo} aria-hidden="true" />
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.imageUrl} alt={t('posterAlt', { name: product.name })} className={styles.poster} />
              ) : poster ? (
                <ThemedPoster poster={poster} alt={t('posterAlt', { name: product.name })} className={styles.poster} eager />
              ) : (
                <span className={styles.placeholder} aria-hidden="true">
                  {product.brand.name}
                </span>
              )}
            </div>
          )}
        </div>

        <div className={styles.info}>
          <p className={styles.reference}>
            {t('reference', { reference: product.reference })} · {product.brand.name}
          </p>
          <h1 className={styles.name}>{product.name}</h1>
          {(product.colorway ?? product.edition) && <p className={styles.detail}>{product.colorway ?? product.edition}</p>}
          <div className={styles.priceRow}>
            <span className={styles.price}>{formatPrice(product.price, locale)}</span>
            <span className={styles.availability} data-tone={product.availability}>
              {availability(product.availability)}
            </span>
          </div>
          <p className={styles.tagline}>{product.tagline}</p>
          <AddToCart slug={product.slug} sizes={product.sizes} />
          {product.model && <ArButton model={product.model} name={product.name} />}
          <ProductTour hotspots={product.hotspots} />
          <p className={styles.description}>{product.description}</p>
          {specs.length > 0 && (
            <dl className={styles.specs}>
              {specs.map(([label, value]) => (
                <div key={label} className={styles.spec}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {product.tags.length > 0 && (
            <ul className={styles.tags} aria-label={t('tagsLabel')}>
              {product.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
