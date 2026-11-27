'use client';

import type { Price, ProductSize } from '@airspace/contracts';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { MAX_QUANTITY, useCartStore } from '@/components/cart/cart-store';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/price';
import styles from './WornLook.module.css';

// Algo que lleva puesto el maniquí y se puede comprar: el par y cada prenda
// del catálogo.
export interface LookItem {
  slug: string;
  name: string;
  brand: string;
  price: Price;
  poster: { dark: string; light: string } | null;
  sizes: ProductSize[];
}

// Talla única (gorras, lentes): no se elige. Una sola talla de otro sistema
// se elige sola (igual que AddToCart).
const needsSize = (item: LookItem) => item.sizes.length > 1;
const autoSize = (item: LookItem) => (item.sizes.length === 1 && item.sizes[0].system !== 'ONE' ? item.sizes[0].label : null);
const isSoldOut = (item: LookItem) => item.sizes.length > 0 && item.sizes.every((size) => size.stock === 'out');

// Columna "Lleva puesto": el par primero y después cada prenda del catálogo,
// con talla, precio y enlace a su ficha; las piezas base del maniquí solo se
// nombran (no se venden). Al pie, el total del look y "Agregar look completo",
// que agrega todo lo vendible con su talla. Mientras falte una talla, el
// botón queda deshabilitado a la vista (aria-disabled, sigue enfocable): al
// pulsarlo, el foco va a la primera talla que falta.
export function WornLook({ items, basePieces }: { items: LookItem[]; basePieces: string[] }) {
  const t = useTranslations('Hangar.look');
  const product = useTranslations('Product');
  const locale = useLocale();
  const format = useFormatter();
  const add = useCartStore((state) => state.add);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'added' | 'max' | 'missing'>('idle');
  const selects = useRef(new Map<string, HTMLSelectElement>());
  const hintId = useId();

  const sellable = items.filter((item) => !isSoldOut(item));
  const sizeOf = (item: LookItem) => chosen[item.slug] ?? autoSize(item);
  const missing = sellable.filter((item) => needsSize(item) && !sizeOf(item));
  const total = sellable.reduce((sum, item) => sum + item.price.amountCents, 0);
  const currency = sellable[0]?.price.currency ?? items[0]?.price.currency ?? 'USD';

  const addLook = () => {
    if (missing.length) {
      setStatus('missing');
      selects.current.get(missing[0].slug)?.focus();
      return;
    }
    let complete = true;
    for (const item of sellable) complete = add({ slug: item.slug, size: sizeOf(item) ?? undefined }) && complete;
    setStatus(complete ? 'added' : 'max');
  };

  return (
    <div className={styles.look}>
      <ul className={styles.items}>
        {items.map((item) => {
          const soldOut = isSoldOut(item);
          return (
            <li key={item.slug} className={styles.item}>
              <span className={styles.thumb} aria-hidden="true">
                {item.poster && <ThemedPoster poster={item.poster} alt="" sizes="72px" className={styles.poster} />}
              </span>
              <div className={styles.info}>
                <h3 className={styles.name}>
                  <Link href={`/products/${item.slug}`} className={styles.link}>
                    {item.name}
                  </Link>
                </h3>
                <p className={styles.meta}>
                  {item.brand} · <span className={styles.price}>{formatPrice(item.price, locale)}</span>
                </p>
                {soldOut ? (
                  <p className={styles.fixed}>{t('soldOut')}</p>
                ) : needsSize(item) ? (
                  <select
                    ref={(node) => {
                      if (node) selects.current.set(item.slug, node);
                      else selects.current.delete(item.slug);
                    }}
                    className={styles.size}
                    aria-label={t('sizeLabel', { name: item.name })}
                    aria-invalid={status === 'missing' && !sizeOf(item) ? true : undefined}
                    value={chosen[item.slug] ?? ''}
                    onChange={(event) => {
                      setChosen((current) => ({ ...current, [item.slug]: event.target.value }));
                      setStatus('idle');
                    }}
                  >
                    <option value="" disabled>
                      {t('sizePlaceholder')}
                    </option>
                    {item.sizes.map((size) => (
                      <option key={size.label} value={size.label} disabled={size.stock === 'out'}>
                        {size.stock === 'out' ? `${size.label} · ${product('stock.out')}` : size.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className={styles.fixed}>{autoSize(item) ?? t('oneSize')}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {basePieces.length > 0 && (
        <p className={styles.base}>{t('base', { pieces: format.list(basePieces, { type: 'unit' }) })}</p>
      )}

      <div className={styles.footer}>
        <p className={styles.total}>
          <span className={styles.totalLabel}>{t('total')}</span>
          <span className={styles.totalValue}>{formatPrice({ amountCents: total, currency }, locale)}</span>
        </p>
        <button
          type="button"
          className={styles.add}
          aria-disabled={missing.length > 0 || sellable.length === 0 ? true : undefined}
          aria-describedby={hintId}
          onClick={sellable.length ? addLook : undefined}
        >
          {t('add')}
        </button>
        <p id={hintId} className={styles.hint} data-alert={status === 'missing' || undefined} role="status">
          {status === 'added'
            ? t('added')
            : status === 'max'
              ? product('maxInCart', { max: MAX_QUANTITY })
              : missing.length
                ? t('missing', { names: format.list(missing.map((item) => item.name), { type: 'conjunction' }) })
                : ''}
        </p>
      </div>
    </div>
  );
}
