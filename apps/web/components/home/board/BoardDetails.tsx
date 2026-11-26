'use client';

import type { Locale } from '@airspace/contracts';
import { useTranslations } from 'next-intl';
import { type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useCartStore } from '@/components/cart/cart-store';
import { gsap, useGSAP } from '@/lib/motion/gsap';
import { DURATION, EASE } from '@/lib/motion/tokens';
import { formatPrice } from '@/lib/price';
import styles from './Board.module.css';
import { scramble } from './scramble';
import type { BoardProduct } from './types';
import ui from './ui.module.css';

const TONE = { new: 'primary', available: 'muted', low_stock: 'alert', coming_soon: 'muted' } as const;
const motionOk = () => document.documentElement.classList.contains('motion-ok');

// Ajusta el nombre a su ancho angostando la letra con el eje de ancho de Hubot
// Sans (hasta 75%). Si aun así no cabe, se parte en dos líneas (el CSS
// reserva dos). Mide una copia invisible; se llama al cambiar de producto o de
// tamaño, nunca por cuadro.
function fitName(element: HTMLElement, text: string) {
  element.style.fontStretch = '';
  const available = element.clientWidth;
  if (!available || !element.parentElement) return;
  const probe = element.cloneNode(false) as HTMLElement;
  probe.removeAttribute('id');
  probe.textContent = text;
  Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', width: 'auto', whiteSpace: 'nowrap', minHeight: '0' });
  element.parentElement.append(probe);
  const base = parseFloat(getComputedStyle(element).fontStretch) || 100;
  let stretch = base;
  while (probe.scrollWidth > available && stretch > 75) {
    stretch = Math.max(75, stretch - 5);
    probe.style.fontStretch = `${stretch}%`;
  }
  if (stretch !== base) element.style.fontStretch = `${stretch}%`;
  probe.remove();
}

// Panel de detalles del par elegido: nombre, color, frase, etiquetas, precio,
// talla y "Agregar al carrito". Al cambiar de par, el nombre se decodifica, el
// precio cuenta hasta el nuevo valor y el resto aparece con un fundido corto.
export function BoardDetails({ product, locale, animate, announcement }: { product: BoardProduct; locale: Locale; animate: RefObject<boolean>; announcement: string }) {
  const t = useTranslations('HomeBoard');
  const tAvailability = useTranslations('Availability');
  const root = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const previousPrice = useRef(product.price.amountCents);
  const sizes = product.sizeRange ? `${product.sizeRange.system} ${product.sizeRange.min}-${product.sizeRange.max}` : '';

  // El nombre cabe en su columna (al cambiar de par y de tamaño).
  useLayoutEffect(() => {
    const element = nameRef.current;
    if (!element) return;
    fitName(element, product.name);
    const observer = new ResizeObserver(() => fitName(element, product.name));
    observer.observe(element.parentElement ?? element);
    return () => observer.disconnect();
  }, [product.name]);

  useGSAP(
    () => {
      const element = root.current;
      const from = previousPrice.current;
      if (!element || !animate.current || !motionOk()) return;
      const name = element.querySelector<HTMLElement>('[data-name-text]');
      const price = element.querySelector<HTMLElement>('[data-price-text]');
      if (name) scramble(name, product.name, { duration: 0.7 });
      gsap.fromTo(
        element.querySelectorAll('[data-detail-fade]'),
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: DURATION.reveal, ease: EASE.out.gsap, stagger: 0.04, overwrite: true, clearProps: 'opacity,transform' },
      );
      if (price && from !== product.price.amountCents) {
        const state = { value: from };
        gsap.to(state, {
          value: product.price.amountCents,
          duration: 0.9,
          ease: 'power3.out',
          onUpdate: () => {
            price.textContent = formatPrice({ ...product.price, amountCents: Math.round(state.value / 100) * 100 }, locale);
          },
          onComplete: () => {
            price.textContent = formatPrice(product.price, locale);
          },
        });
      }
    },
    { scope: root, dependencies: [product.slug], revertOnUpdate: true },
  );
  // Precio anterior para la cuenta (después de la animación, que lo lee).
  useEffect(() => {
    previousPrice.current = product.price.amountCents;
  }, [product.price.amountCents]);

  return (
    <div ref={root} className={styles.details}>
      <div className={styles.detailsTop}>
        <p className={ui.hudLabel}>{t('details.route', { reference: product.reference, sizes })}</p>
        <span className={styles.status} data-tone={TONE[product.availability]}>
          <span className={styles.statusDot} aria-hidden="true" />
          {tAvailability(product.availability)}
        </span>
      </div>
      <h3 ref={nameRef} className={styles.name}>
        <span className="visually-hidden">{product.name}</span>
        <span key={product.slug} aria-hidden="true" data-name-text="">
          {product.name}
        </span>
      </h3>
      <p className={styles.meta} data-detail-fade="">
        {[product.brand.name, product.colorway].filter(Boolean).join(' · ')}
      </p>
      <p className={styles.tagline} data-detail-fade="">
        {product.tagline}
      </p>
      <ul className={styles.tags} aria-label={t('details.tagsLabel')}>
        {product.tags.map((tag) => (
          <li key={tag} className={styles.tag} data-detail-fade="">
            {tag}
          </li>
        ))}
      </ul>
      <BuyBox key={product.slug} product={product} locale={locale} />
      {/* Región viva: un mensaje por selección, con el texto final. */}
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

// Precio, talla y botón. Se monta de nuevo con cada par (key), así la talla
// elegida y el aviso de "agregado" nunca pasan de un par a otro.
function BuyBox({ product, locale }: { product: BoardProduct; locale: Locale }) {
  const t = useTranslations('HomeBoard.details');
  const add = useCartStore((state) => state.add);
  const id = useId();
  const available = product.sizes.filter((size) => size.stock !== 'out');
  const soldOut = product.sizes.length > 0 && available.length === 0;
  const [size, setSize] = useState(available.length === 1 && product.sizes.length === 1 ? available[0].label : '');
  const [invalid, setInvalid] = useState(false);
  const [added, setAdded] = useState(false);
  const [status, setStatus] = useState('');
  const select = useRef<HTMLSelectElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const firstRender = useRef(true);

  // "Agregado al carrito" se decodifica y vuelve al texto normal a los 2,6 s.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (label.current && motionOk()) scramble(label.current, added ? t('added') : t('addToCart'), { duration: added ? 0.6 : 0.5 });
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 2600);
    return () => clearTimeout(timer);
  }, [added, t]);

  const onAdd = () => {
    if (added || soldOut) return;
    if (product.sizes.length && !size) {
      setInvalid(true);
      setStatus(t('pickSize'));
      select.current?.focus();
      return;
    }
    add({ slug: product.slug, size: size || undefined });
    const count = useCartStore.getState().items.length;
    setAdded(true);
    setStatus(t('addedStatus', { name: product.name, size, count }));
  };

  const ctaText = soldOut ? t('soldOut') : added ? t('added') : t('addToCart');

  return (
    <div className={styles.buy}>
      <div className={styles.fare}>
        <span className={`${ui.hudLabel} ${styles.fareLabel}`}>{t('price')}</span>
        <span className={styles.price}>
          <span className="visually-hidden">{formatPrice(product.price, locale)}</span>
          <span aria-hidden="true" data-price-text="">
            {formatPrice(product.price, locale)}
          </span>
        </span>
      </div>
      {product.sizes.length > 0 && (
        <div className={styles.sizeField} data-invalid={invalid || undefined}>
          <label htmlFor={id} className={`${ui.hudLabel} ${styles.sizeLabel}`}>
            {invalid ? t('pickSize') : t('sizeLabel')}
          </label>
          <select
            ref={select}
            id={id}
            className={styles.sizeSelect}
            value={size}
            disabled={soldOut}
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              setSize(event.target.value);
              setInvalid(false);
            }}
          >
            <option value="" disabled>
              {t('sizePlaceholder')}
            </option>
            {product.sizes.map((item) => (
              <option key={item.label} value={item.label} disabled={item.stock === 'out'}>
                {item.stock === 'out' ? t('sizeOut', { size: item.label }) : item.stock === 'low' ? t('sizeLow', { size: item.label }) : item.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <button type="button" className={`${ui.btn} ${ui.btnPrimary} ${styles.cta}`} data-done={added || undefined} disabled={soldOut} onClick={onAdd}>
        <span className="visually-hidden">{ctaText}</span>
        {/* Con key: cada texto es un nodo nuevo que el efecto puede decodificar. */}
        <span key={ctaText} ref={label} aria-hidden="true">
          {ctaText}
        </span>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <p className="visually-hidden" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
