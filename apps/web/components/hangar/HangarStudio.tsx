'use client';

import type { Model3D, Price, ProductSize } from '@airspace/contracts';
import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { type KeyboardEvent, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AddToCart } from '@/components/cart/AddToCart';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { createSpin, keySpin, turnOf, useSpinDrag } from '@/components/home/board/rig';
import { Link } from '@/i18n/navigation';
import { type Clip, CLIPS, OUTFIT_LITE_URL, OUTFIT_URL } from '@/lib/avatar/avatar';
import { FITTING } from '@/lib/avatar/fitting';
import { resolveLook } from '@/lib/avatar/outfit';
import { accentProps } from '@/lib/accent';
import { useMotionStore } from '@/lib/motion/store';
import { formatPrice } from '@/lib/price';
import { useThemeStore } from '@/lib/theme';
import { useStageActivity } from '@/lib/three/director';
import type { AvatarStatus, OutfitStatus } from './AvatarScene';
import styles from './HangarStudio.module.css';
import { OutfitPanel } from './OutfitPanel';
import { useOutfitChoice } from './outfit-store';
import { type AvatarView, ringTransform, type StagePose, VIEWS } from './rig';

// El canvas solo existe en el cliente y se descarga aparte.
const AvatarScene = dynamic(() => import('./AvatarScene'), { ssr: false });

export interface HangarProduct {
  slug: string;
  name: string;
  brand: string;
  colorway: string | null;
  price: Price;
  accent: { dark: string; light: string } | null;
  model: Model3D;
  sizes: ProductSize[];
}

// Diámetro de la plataforma (m): el SVG de anillos mide 600 unidades.
const PLATFORM = 1.2;

// Anillos de la plataforma: marcas cada 10° y números cada 30°.
const TICKS = Array.from({ length: 36 }, (_, index) => {
  const degree = index * 10;
  const major = degree % 30 === 0;
  const angle = ((degree + 90) * Math.PI) / 180;
  const inner = major ? 248 : 256;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    degree,
    major,
    // Redondeo: servidor y navegador deben escribir el mismo atributo.
    line: { x1: (inner * cos).toFixed(1), y1: (inner * sin).toFixed(1), x2: (270 * cos).toFixed(1), y2: (270 * sin).toFixed(1) },
  };
});

const requested = new Set<string>();
// Prefetch del GLB al pasar el cursor o enfocar una tarjeta (prioridad baja).
const prefetch = (url: string) => {
  if (requested.has(url)) return;
  requested.add(url);
  void fetch(url, { priority: 'low' } as RequestInit).catch(() => requested.delete(url));
};

// Hangar 360°: avatar en la plataforma con el par elegido, chips de
// animación y de encuadre, giro por arrastre o flechas, y el carrito del par.
// Nada se mueve con el scroll.
export function HangarStudio({ products }: { products: HangarProduct[] }) {
  const t = useTranslations('Hangar');
  const locale = useLocale();
  const lite = useMotionStore((state) => state.lite);
  const reducedMotion = useMotionStore((state) => state.reducedMotion);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const active = useStageActivity(stage);
  const [spin] = useState(() => ({ current: createSpin() }));
  useSpinDrag(stage, spin, reducedMotion);

  const [slug, setSlug] = useState(products[0]?.slug ?? '');
  const [clip, setClip] = useState<Clip>('idle');
  const [view, setView] = useState<AvatarView>('full');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<AvatarStatus>('loading');
  const onReady = useCallback(() => setReady(true), []);
  const product = products.find((item) => item.slug === slug) ?? products[0];

  // Vestuario: sin URL (producción antes de subirlo) o si el GLB no carga, el
  // maniquí va sin ropa y el panel no se muestra.
  const outfitUrl = lite ? OUTFIT_LITE_URL : OUTFIT_URL;
  const [outfitStatus, setOutfitStatus] = useState<OutfitStatus>('loading');
  const choice = useOutfitChoice();
  const theme = useThemeStore((state) => state.theme);
  const look = resolveLook(choice, theme, product?.accent?.dark ?? null);

  const rings = useRef<HTMLDivElement>(null);
  const rot = useRef<HTMLSpanElement>(null);
  const baseK = useRef(1);
  const shownDegrees = useRef(-1);

  // Tamaño base de los anillos (vista de cuerpo entero); se rehace con el tamaño.
  useLayoutEffect(() => {
    if (!stage) return;
    const layout = () => {
      const size = { width: stage.clientWidth, height: stage.clientHeight };
      if (!size.width || !size.height || !rings.current) return;
      const pose = VIEWS.full(size.width, size.height);
      baseK.current = pose.k;
      const ring = PLATFORM * pose.k;
      Object.assign(rings.current.style, { width: `${ring}px`, height: `${ring}px`, left: `${-ring / 2}px`, top: `${-ring / 2}px` });
      rings.current.style.transform = ringTransform(pose, size, pose.k);
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);

  // Cada cuadro: anillos con la cámara y lectura de giro (escritura directa al DOM).
  const onFrame = useCallback(
    (pose: StagePose, size: { width: number; height: number }, angle: number) => {
      if (rings.current) rings.current.style.transform = `${ringTransform(pose, size, baseK.current)} rotate(${((-angle * 180) / Math.PI).toFixed(2)}deg)`;
      const { degrees } = turnOf(angle);
      if (degrees === shownDegrees.current) return;
      shownDegrees.current = degrees;
      if (rot.current) rot.current.textContent = t('rotation', { degrees: String(degrees).padStart(3, '0') });
      stage?.setAttribute('aria-valuenow', String(degrees));
      stage?.setAttribute('aria-valuetext', t('stageValue', { degrees }));
    },
    [stage, t],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!keySpin(spin.current, event.key, reducedMotion)) return;
    event.preventDefault();
  };

  if (!product) return null;
  const shoe = { slug: product.slug, url: product.model.liteUrl, foot: product.model.foot ?? 'right' };
  const loading = !ready || status === 'loading';

  return (
    <div className={styles.page} {...accentProps(product.accent)}>
      <div className={styles.layout}>
        <div className={styles.copy}>
          <p className={styles.kicker}>{t('kicker')}</p>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.lead}>{t('lead')}</p>

          <div className={styles.product}>
            <p className={styles.label}>{t('wearing')}</p>
            <h2 className={styles.name}>{product.name}</h2>
            <p className={styles.meta}>
              {product.brand}
              {product.colorway ? ` · ${product.colorway}` : ''}
            </p>
            <p className={styles.price}>{formatPrice(product.price, locale)}</p>
            <AddToCart key={product.slug} slug={product.slug} sizes={product.sizes} />
            <Link href={`/products/${product.slug}`} className={styles.more}>
              {t('viewProduct')}
            </Link>
          </div>
        </div>

        <div className={styles.slot}>
          <div
            ref={setStage}
            className={styles.stage}
            tabIndex={0}
            role="slider"
            aria-label={t('stageLabel', { name: product.name })}
            aria-valuemin={0}
            aria-valuemax={359}
            aria-valuenow={0}
            aria-valuetext={t('stageValue', { degrees: 0 })}
            data-ready={ready || undefined}
            data-loading={loading || undefined}
            data-view={view}
            data-outfit={outfitUrl ? outfitStatus : undefined}
            onKeyDown={onKeyDown}
          >
            <span className={styles.halo} aria-hidden="true" />
            <div ref={rings} className={styles.rings} aria-hidden="true">
              <svg viewBox="-300 -300 600 600" focusable="false">
                <circle className={styles.disc} r="240" />
                <circle className={styles.ring} r="288" />
                <circle className={`${styles.ring} ${styles.ringAccent}`} r="240" />
                <circle className={styles.ring} r="150" />
                {TICKS.map((tick) => (
                  <line key={tick.degree} className={tick.major ? `${styles.tick} ${styles.tickMajor}` : styles.tick} {...tick.line} />
                ))}
                <path className={styles.index} d="M0 274 L-8 290 L8 290 Z" />
              </svg>
            </div>
            <div className={styles.canvas}>
              <AvatarScene
                active={active}
                lite={lite}
                reducedMotion={reducedMotion}
                shoe={shoe}
                clip={clip}
                fitting={FITTING}
                view={view}
                spin={spin}
                autoRotate
                outfit={outfitUrl ? { url: outfitUrl, look } : null}
                onOutfitStatus={setOutfitStatus}
                onReady={onReady}
                onStatus={setStatus}
                onFrame={onFrame}
              />
            </div>
            <span className={styles.wait} aria-hidden="true">
              {status === 'error' ? t('error') : t('loading')}
            </span>
          </div>
          <div className={styles.hud} aria-hidden="true">
            <span ref={rot} className={styles.rot}>
              {t('rotation', { degrees: '000' })}
            </span>
            <span className={styles.hint}>
              <span className={styles.hintMouse}>{t('dragHint')}</span>
              <span className={styles.hintTouch}>{t('touchHint')}</span>
            </span>
          </div>
          <div className={styles.controls}>
            <div className={styles.chips} role="group" aria-label={t('clipsLabel')}>
              {CLIPS.map((name) => (
                <button key={name} type="button" className={styles.chip} aria-pressed={clip === name} onClick={() => setClip(name)}>
                  {t(`clips.${name}`)}
                </button>
              ))}
            </div>
            <div className={styles.chips} role="group" aria-label={t('viewLabel')}>
              {(['full', 'feet'] as const).map((name) => (
                <button key={name} type="button" className={styles.chip} aria-pressed={view === name} onClick={() => setView(name)}>
                  {t(`views.${name}`)}
                </button>
              ))}
            </div>
          </div>
          {outfitUrl && outfitStatus !== 'error' && <OutfitPanel />}
        </div>

        <section className={styles.picker} aria-label={t('pickerLabel')}>
          <ul className={styles.cards}>
            {products.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  className={styles.card}
                  aria-pressed={item.slug === product.slug}
                  aria-label={t('pickerItem', { name: item.name })}
                  onClick={() => setSlug(item.slug)}
                  onPointerEnter={() => prefetch(item.model.liteUrl)}
                  onFocus={() => prefetch(item.model.liteUrl)}
                >
                  {item.model.poster && <ThemedPoster poster={item.model.poster} alt="" sizes="180px" className={styles.cardPoster} />}
                  <span className={styles.cardName}>{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
