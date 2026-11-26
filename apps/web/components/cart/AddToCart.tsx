'use client';

import type { ProductSize } from '@airspace/contracts';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useCartStore } from './cart-store';
import styles from './AddToCart.module.css';

// Selector de talla y botón para agregar. Las tallas agotadas no se pueden
// elegir; las de pocas existencias lo avisan.
export function AddToCart({ slug, sizes }: { slug: string; sizes: ProductSize[] }) {
  const t = useTranslations('Product');
  const add = useCartStore((state) => state.add);
  // Nombre propio del grupo de tallas: dos selectores en la misma página no se mezclan.
  const group = useId();
  const needsSize = sizes.length > 1;
  const [size, setSize] = useState<string | null>(needsSize ? null : (sizes[0]?.label ?? null));
  const [added, setAdded] = useState(false);
  const soldOut = sizes.length > 0 && sizes.every((item) => item.stock === 'out');

  return (
    <div className={styles.block}>
      {needsSize && (
        <fieldset className={styles.sizes}>
          <legend className={styles.legend}>{t('chooseSize')}</legend>
          <div className={styles.grid}>
            {sizes.map((item) => (
              <label key={item.label} className={styles.size} data-stock={item.stock}>
                <input
                  type="radio"
                  name={group}
                  value={item.label}
                  disabled={item.stock === 'out'}
                  checked={size === item.label}
                  onChange={() => {
                    setSize(item.label);
                    setAdded(false);
                  }}
                />
                <span>{item.label}</span>
                {item.stock !== 'in_stock' && <span className="visually-hidden">{t(`stock.${item.stock}`)}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <button
        type="button"
        className={styles.add}
        disabled={soldOut || (needsSize && !size)}
        onClick={() => {
          add({ slug, size: size ?? undefined });
          setAdded(true);
        }}
      >
        {soldOut ? t('soldOut') : added ? t('added') : needsSize && !size ? t('pickSizeFirst') : t('addToCart')}
      </button>
      <p className="visually-hidden" role="status">
        {added ? t('addedAnnouncement') : ''}
      </p>
    </div>
  );
}
