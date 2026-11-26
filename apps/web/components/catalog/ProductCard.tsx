import type { ProductCard as ProductCardData } from '@airspace/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { ViewTransition } from 'react';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/price';
import styles from './ProductCard.module.css';
import { PrefetchModel } from './PrefetchModel';
import { ThemedPoster } from './ThemedPoster';

// Tarjeta del catálogo: póster (o marco vacío mientras no haya), referencia,
// nombre, detalle, precio, disponibilidad y tallas. Todo el bloque es el enlace.
export function ProductCard({ product }: { product: ProductCardData }) {
  const t = useTranslations('Catalog');
  const availability = useTranslations('Availability');
  const locale = useLocale();
  const poster = product.model?.poster ?? null;
  const detail = product.colorway ?? product.edition;

  return (
    <article className={styles.card}>
      <Link href={`/products/${product.slug}`} className={styles.link}>
        <div className={styles.media}>
          <div className={styles.halo} aria-hidden="true" />
          {/* El póster se transforma en el visor de la ficha (misma name). */}
          <ViewTransition name={`product-media-${product.slug}`} share="morph" default="none">
            <div className={styles.posterWrap}>
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt={t('posterAlt', { name: product.name })} className={styles.poster} loading="lazy" decoding="async" />
          ) : poster ? (
            <ThemedPoster poster={poster} alt={t('posterAlt', { name: product.name })} className={styles.poster} sizes="(max-width: 600px) 50vw, 300px" />
          ) : (
            <span className={styles.placeholder} aria-hidden="true">
              {product.brand.name}
            </span>
          )}
            </div>
          </ViewTransition>
          <span className={styles.reference}>{t('reference', { reference: product.reference })}</span>
          {product.model && <span className={styles.badge}>{t('has3d')}</span>}
          {product.model && <PrefetchModel url={product.model.heroUrl} />}
        </div>
        <div className={styles.body}>
          <p className={styles.brand}>{product.brand.name}</p>
          <h2 className={styles.name}>{product.name}</h2>
          {detail && <p className={styles.detail}>{detail}</p>}
          <div className={styles.meta}>
            <span className={styles.price}>{formatPrice(product.price, locale)}</span>
            <span className={styles.availability} data-tone={product.availability}>
              {availability(product.availability)}
            </span>
          </div>
          {product.sizeRange && product.sizeRange.system === 'EU' && (
            <p className={styles.sizes}>{t('sizeRange', { min: product.sizeRange.min, max: product.sizeRange.max })}</p>
          )}
        </div>
      </Link>
    </article>
  );
}
