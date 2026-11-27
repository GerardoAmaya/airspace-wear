'use client';

import type { AvatarSlot, Category, Model3D, Price, ProductSize } from '@airspace/contracts';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createSpin, keySpin, turnOf, useSpinDrag } from '@/components/home/board/rig';
import ui from '@/components/home/board/ui.module.css';
import { type Clip, OUTFIT_LITE_URL, OUTFIT_URL } from '@/lib/avatar/avatar';
import { CATALOG_FIT, fitUrl, WEAR_SLOTS } from '@/lib/avatar/catalog-fit';
import { FITTING } from '@/lib/avatar/fitting';
import { DEFAULT_CLIP, HANGAR_CLIPS, HANGAR_FEATURES } from '@/lib/avatar/hangar-features';
import { DEFAULT_PAIR, resolveLook } from '@/lib/avatar/outfit';
import { accentProps } from '@/lib/accent';
import { useMotionStore } from '@/lib/motion/store';
import { useThemeStore } from '@/lib/theme';
import { useStageActivity } from '@/lib/three/director';
import type { AvatarStatus, OutfitStatus } from './AvatarScene';
import styles from './HangarStudio.module.css';
import type { WornGarment } from './AvatarCatalog';
import { HangarTabs } from './HangarTabs';
import { ColorPanel, WearPanel } from './OutfitPanel';
import { type HangarTab, useOutfitChoice, useOutfitStore } from './outfit-store';
import { shoeUrl } from './prefetch';
import { ShoePicker } from './ShoePicker';
import { type LookItem, WornLook } from './WornLook';
import { type AvatarView, ringTransform, type StagePose, VIEWS } from './rig';
import { createZoom, type StageZoom, isZoomed, resetZoom, setZoomView, useStageZoom, zoomStep } from './zoom';

// El canvas solo existe en el cliente y se descarga aparte.
const AvatarScene = dynamic(() => import('./AvatarScene'), { ssr: false });

export interface HangarProduct {
  slug: string;
  name: string;
  brand: string;
  // Sneaker o tacos (filtro de tipo en la pestaña "Zapatos").
  category: Category;
  colorway: string | null;
  price: Price;
  accent: { dark: string; light: string } | null;
  model: Model3D;
  sizes: ProductSize[];
}

// Prenda del catálogo ajustada al maniquí (pnpm avatar:fit).
export interface HangarGarment {
  slug: string;
  name: string;
  brand: string;
  slot: AvatarSlot;
  price: Price;
  poster: { dark: string; light: string } | null;
  sizes: ProductSize[];
}

// Pedido de prendas para la escena (la clave mantiene la referencia estable
// mientras no cambie lo puesto: el compilador de React lo memoriza).
const wornList = (key: string, lite: boolean): WornGarment[] =>
  key ? key.split(',').map((slug) => ({ slug, slot: CATALOG_FIT[slug].slot, url: fitUrl(slug, lite) ?? '' })) : [];

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

// Hangar 360°: tres columnas. A la izquierda, "Lleva puesto" (el par y las
// prendas del catálogo con talla, total del look y "Agregar look completo");
// al centro, solo el escenario (avatar en la plataforma, marco HUD, giro por
// arrastre o flechas) con los chips de animación y de encuadre debajo; a la
// derecha, pestañas "Zapatos" y "Ropa" ("Colores" y el vestuario base quedan
// ocultos tras sus banderas en lib/avatar/hangar-features.ts). En pantallas angostas:
// escenario, pestañas y "Lleva puesto". Nada se mueve con el scroll.
export function HangarStudio({ products, garments }: { products: HangarProduct[]; garments: HangarGarment[] }) {
  const t = useTranslations('Hangar');
  const lite = useMotionStore((state) => state.lite);
  const reducedMotion = useMotionStore((state) => state.reducedMotion);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const active = useStageActivity(stage);
  const [spin] = useState(() => ({ current: createSpin() }));
  useSpinDrag(stage, spin, reducedMotion);
  // Zoom del escenario (ref: lo leen los gestos y el bucle de cuadros).
  const zoom = useRef<StageZoom>(createZoom());
  useStageZoom(stage, zoom, spin);

  const [slug, setSlug] = useState(() => (products.find((item) => item.slug === DEFAULT_PAIR) ?? products[0])?.slug ?? '');
  const [clip, setClip] = useState<Clip>(DEFAULT_CLIP);
  const [view, setView] = useState<AvatarView>('full');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<AvatarStatus>('loading');
  const onReady = useCallback(() => setReady(true), []);

  // Cada encuadre o animación empieza sin zoom (y con su propio máximo).
  useEffect(() => {
    setZoomView(zoom.current, view);
  }, [view, clip, zoom]);
  const product = products.find((item) => item.slug === slug) ?? products[0];

  // Vestuario base: sin URL (producción antes de subirlo), si el GLB no carga
  // o con HANGAR_FEATURES.baseOutfit apagado, el maniquí no lleva capa base
  // (solo las prendas del catálogo) y su sección no se muestra.
  const outfitUrl = HANGAR_FEATURES.baseOutfit ? (lite ? OUTFIT_LITE_URL : OUTFIT_URL) : '';
  const [outfitStatus, setOutfitStatus] = useState<OutfitStatus>('loading');
  const choice = useOutfitChoice();
  const theme = useThemeStore((state) => state.theme);
  const look = resolveLook(choice, theme, product?.accent?.dark ?? null);

  // Prendas del catálogo pedidas (solo las ajustadas y presentes en la página).
  const setWear = useOutfitStore((state) => state.setWear);
  const setTab = useOutfitStore((state) => state.setTab);
  const wornGarments = WEAR_SLOTS.map((slot) => garments.find((item) => item.slug === choice.wear[slot])).filter(
    (item): item is HangarGarment => !!item,
  );
  const wearKey = wornGarments.map((item) => item.slug).join(',');
  const wear = wornList(wearKey, lite);
  // Prendas ya a la vista en el maniquí (para las pruebas y el estado de carga).
  const [shownWear, setShownWear] = useState('');
  const onWear = useCallback((slugs: string[]) => setShownWear(slugs.join(',')), []);

  // ?wear=<slug>: la ficha de una prenda abre el Hangar con ella puesta.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('wear');
    const item = slug ? garments.find((garment) => garment.slug === slug) : undefined;
    if (!item) return;
    setWear(item.slot, item.slug);
    setTab('wear');
  }, [garments, setWear, setTab]);

  const rings = useRef<HTMLDivElement>(null);
  const rot = useRef<HTMLSpanElement>(null);
  const baseK = useRef(1);
  const shownDegrees = useRef(-1);
  const shownZoom = useRef('');

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
      // Zoom a la vista (para las pruebas) y el botón de restablecer, solo con zoom.
      const zoomKey = `${zoom.current.shown.scale.toFixed(2)}:${isZoomed(zoom.current)}`;
      if (stage && zoomKey !== shownZoom.current) {
        shownZoom.current = zoomKey;
        stage.setAttribute('data-zoom', zoom.current.shown.scale.toFixed(2));
        stage.toggleAttribute('data-zoomed', isZoomed(zoom.current));
      }
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
    // + y - acercan y alejan; 0 vuelve a 1x.
    const zoomKey = ({ '+': 1, '=': 1, '-': -1 } as Record<string, 1 | -1>)[event.key];
    if (zoomKey || event.key === '0') {
      event.preventDefault();
      if (zoomKey) zoomStep(zoom.current, zoomKey);
      else resetZoom(zoom.current);
      return;
    }
    if (!keySpin(spin.current, event.key, reducedMotion)) return;
    event.preventDefault();
  };

  if (!product) return null;
  // El par en su variante hero (nítido de cerca); el -lite.glb en modo liviano.
  const shoe = { slug: product.slug, url: shoeUrl(product.model, lite), foot: product.model.foot ?? 'right' };
  const loading = !ready || status === 'loading';
  const baseOutfit = !!outfitUrl && outfitStatus !== 'error';

  // "Lleva puesto": el par y las prendas del catálogo (lo que se vende) y,
  // aparte, las piezas base a la vista (no se venden).
  const lookItems: LookItem[] = [
    { slug: product.slug, name: product.name, brand: product.brand, price: product.price, poster: product.model.poster, sizes: product.sizes },
    ...wornGarments.map((item) => ({ slug: item.slug, name: item.name, brand: item.brand, price: item.price, poster: item.poster, sizes: item.sizes })),
  ];
  const replaced = new Set(wornGarments.flatMap((item) => CATALOG_FIT[item.slug].hides));
  const basePieces = baseOutfit
    ? [
        look.garments.shirt && !replaced.has('shirt') && t('outfit.shirtStyles.sleeves'),
        look.garments.tank && !replaced.has('tank') && t('outfit.shirtStyles.tank'),
        look.garments.shorts && !replaced.has('shorts') && t('outfit.bottomsStyles.shorts'),
        look.garments.pants && !replaced.has('pants') && t('outfit.bottomsStyles.pants'),
        look.accessories.cap && !replaced.has('cap') && t('outfit.cap'),
        look.accessories.glasses && !replaced.has('glasses') && t('outfit.glasses'),
        look.garments.socks && t('outfit.socks'),
      ].filter((piece): piece is string => !!piece)
    : [];

  const panels: Array<{ tab: HangarTab; content: ReactNode }> = [
    { tab: 'shoes', content: <ShoePicker products={products} current={product.slug} onSelect={setSlug} /> },
  ];
  if (baseOutfit || garments.length) panels.push({ tab: 'wear', content: <WearPanel garments={garments} lite={lite} base={baseOutfit} /> });
  if (baseOutfit && HANGAR_FEATURES.colorsTab) panels.push({ tab: 'colors', content: <ColorPanel /> });

  return (
    <div className={styles.page} {...accentProps(product.accent)}>
      <div className={styles.layout}>
        <div className={styles.worn}>
          <header className={styles.intro}>
            <p className={styles.kicker}>{t('kicker')}</p>
            <h1 className={styles.title}>{t('title')}</h1>
            <p className={styles.lead}>{t('lead')}</p>
          </header>
          <section className={styles.wornBlock} aria-labelledby="hangar-worn">
            <h2 id="hangar-worn" className={styles.section}>
              {t('wearing')}
            </h2>
            <WornLook items={lookItems} basePieces={basePieces} />
          </section>
        </div>

        <div className={styles.center}>
          <div
            ref={setStage}
            className={`${styles.stage} ${ui.hudFrame}`}
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
            data-wear={shownWear || undefined}
            data-accent={product.accent ? '' : undefined}
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
                zoom={zoom}
                autoRotate={clip !== 'turn'}
                outfit={outfitUrl ? { url: outfitUrl, look } : null}
                onOutfitStatus={setOutfitStatus}
                wear={wear}
                onWear={onWear}
                onReady={onReady}
                onStatus={setStatus}
                onFrame={onFrame}
              />
            </div>
            <span className={ui.hudCorners} aria-hidden="true" />
            <span ref={rot} className={`${styles.hudLabel} ${styles.tl} ${styles.rot}`} aria-hidden="true">
              {t('rotation', { degrees: '000' })}
            </span>
            <span className={`${styles.hudLabel} ${styles.br} ${styles.hint}`} aria-hidden="true">
              <span className={styles.hintMouse}>{t('dragHint')}</span>
              <span className={styles.hintTouch}>{t('touchHint')}</span>
            </span>
            <span className={styles.wait} aria-hidden="true">
              {status === 'error' ? t('error') : t('loading')}
            </span>
          </div>
          {/* Fuera del control deslizante (sus hijos no llegan a los lectores de pantalla). */}
          <button
            type="button"
            className={`${styles.hudLabel} ${styles.zoomReset}`}
            aria-label={t('zoomReset')}
            onClick={() => {
              resetZoom(zoom.current);
              stage?.focus({ preventScroll: true });
            }}
          >
            {t('zoomResetShort')}
          </button>
          <div className={styles.controls}>
            <div className={styles.chips} role="group" aria-label={t('clipsLabel')}>
              {HANGAR_CLIPS.map((name) => (
                <button key={name} type="button" className={styles.chip} aria-pressed={clip === name} onClick={() => setClip(name)}>
                  {t(`clips.${name}`)}
                </button>
              ))}
            </div>
            <span className={styles.divider} aria-hidden="true" />
            <div className={styles.chips} role="group" aria-label={t('viewLabel')}>
              {(['full', 'feet'] as const).map((name) => (
                <button key={name} type="button" className={styles.chip} aria-pressed={view === name} onClick={() => setView(name)}>
                  {t(`views.${name}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className={styles.side} aria-label={t('panelLabel')}>
          <HangarTabs panels={panels} />
        </aside>
      </div>
    </div>
  );
}
