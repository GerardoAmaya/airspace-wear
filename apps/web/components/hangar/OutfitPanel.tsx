'use client';

import type { AvatarSlot } from '@airspace/contracts';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useId, useState } from 'react';
import { ThemedPoster } from '@/components/catalog/ThemedPoster';
import { fitUrl, WEAR_SLOTS } from '@/lib/avatar/catalog-fit';
import {
  BOTTOMS,
  COLOR_SLOTS,
  type ColorSlot,
  DEFAULT_COLORS,
  type GarmentColor,
  MATCH_SLOTS,
  SHIRT_STYLES,
  SWATCHES,
  swatchToken,
  themeShirt,
} from '@/lib/avatar/outfit';
import { useThemeStore } from '@/lib/theme';
import type { HangarGarment } from './HangarStudio';
import { useOutfitChoice, useOutfitStore } from './outfit-store';
import styles from './OutfitPanel.module.css';
import { prefetch } from './prefetch';

// Contenido de las pestañas "Ropa" y "Colores" del Hangar 360°. Botones con
// aria-pressed, como los chips de animación.

// Colores que dejan de aplicarse cuando una prenda del catálogo ocupa su
// lugar (las del catálogo conservan sus colores).
const REPLACED_COLORS: Record<AvatarSlot, ColorSlot> = { top: 'shirt', bottom: 'bottoms', head: 'cap', eyes: 'glasses' };

// "Ropa": prendas reales del catálogo ajustadas al maniquí (chips con póster
// por lugar; "Base" vuelve a la pieza generada) y, debajo, el vestuario base
// (camiseta con o sin mangas, short o pantalón y extras). Sin vestuario base
// (base = false) solo se ofrece el catálogo.
export function WearPanel({ garments, lite, base }: { garments: HangarGarment[]; lite: boolean; base: boolean }) {
  const t = useTranslations('Hangar.outfit');
  const choice = useOutfitChoice();
  const setShirt = useOutfitStore((state) => state.setShirt);
  const setBottoms = useOutfitStore((state) => state.setBottoms);
  const setCap = useOutfitStore((state) => state.setCap);
  const setGlasses = useOutfitStore((state) => state.setGlasses);
  const setSocks = useOutfitStore((state) => state.setSocks);
  const setStripes = useOutfitStore((state) => state.setStripes);
  const setWear = useOutfitStore((state) => state.setWear);
  const reset = useOutfitStore((state) => state.reset);
  const id = useId();
  const slots = WEAR_SLOTS.filter((slot) => garments.some((item) => item.slot === slot));

  return (
    <div className={styles.stack}>
      {slots.length > 0 && (
        <section className={styles.group} aria-labelledby={`${id}-catalog`}>
          <h3 className={styles.groupTitle} id={`${id}-catalog`}>
            {t('catalog.title')}
          </h3>
          {slots.map((slot) => (
            <div key={slot} className={styles.row}>
              <span className={styles.label} id={`${id}-wear-${slot}`}>
                {t(`catalog.slots.${slot}`)}
              </span>
              <div className={styles.options} role="group" aria-labelledby={`${id}-wear-${slot}`}>
                <button type="button" className={styles.option} aria-pressed={!choice.wear[slot]} onClick={() => setWear(slot, null)}>
                  {t('catalog.base')}
                </button>
                {garments
                  .filter((item) => item.slot === slot)
                  .map((item) => {
                    const url = fitUrl(item.slug, lite);
                    return (
                      <button
                        key={item.slug}
                        type="button"
                        className={styles.garment}
                        aria-pressed={choice.wear[slot] === item.slug}
                        aria-label={t('catalog.wearItem', { name: item.name })}
                        title={item.name}
                        onClick={() => setWear(slot, item.slug)}
                        onPointerEnter={() => url && prefetch(url)}
                        onFocus={() => url && prefetch(url)}
                      >
                        {item.poster && <ThemedPoster poster={item.poster} alt="" sizes="64px" className={styles.garmentPoster} />}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </section>
      )}

      {base && (
        <section className={styles.group} aria-labelledby={`${id}-base`}>
          <h3 className={styles.groupTitle} id={`${id}-base`}>
            {t('baseTitle')}
          </h3>
          <div className={styles.row}>
            <span className={styles.label} id={`${id}-shirt`}>
              {t('shirt')}
            </span>
            <div className={styles.options} role="group" aria-labelledby={`${id}-shirt`}>
              {SHIRT_STYLES.map((style) => (
                <button key={style} type="button" className={styles.option} aria-pressed={choice.shirt === style} onClick={() => setShirt(style)}>
                  {t(`shirtStyles.${style}`)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.row}>
            <span className={styles.label} id={`${id}-bottoms`}>
              {t('bottoms')}
            </span>
            <div className={styles.options} role="group" aria-labelledby={`${id}-bottoms`}>
              {BOTTOMS.map((style) => (
                <button key={style} type="button" className={styles.option} aria-pressed={choice.bottoms === style} onClick={() => setBottoms(style)}>
                  {t(`bottomsStyles.${style}`)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.row}>
            <span className={styles.label} id={`${id}-extras`}>
              {t('accessories')}
            </span>
            <div className={styles.options} role="group" aria-labelledby={`${id}-extras`}>
              <button type="button" className={styles.option} aria-pressed={choice.cap} onClick={() => setCap(!choice.cap)}>
                {t('cap')}
              </button>
              <button type="button" className={styles.option} aria-pressed={choice.glasses} onClick={() => setGlasses(!choice.glasses)}>
                {t('glasses')}
              </button>
              <button type="button" className={styles.option} aria-pressed={choice.socks} onClick={() => setSocks(!choice.socks)}>
                {t('socks')}
              </button>
              <button
                type="button"
                className={styles.option}
                aria-pressed={choice.socks && choice.stripes}
                disabled={!choice.socks}
                onClick={() => setStripes(!choice.stripes)}
              >
                {t('stripes')}
              </button>
            </div>
          </div>
        </section>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.reset} onClick={reset}>
          {t('reset')}
        </button>
      </div>
    </div>
  );
}

// "Colores": la paleta fija de las piezas base a la vista y "Combinar con el
// zapato". Las prendas del catálogo conservan sus colores.
export function ColorPanel() {
  const t = useTranslations('Hangar.outfit');
  const choice = useOutfitChoice();
  const theme = useThemeStore((state) => state.theme);
  const setColor = useOutfitStore((state) => state.setColor);
  const matchSneaker = useOutfitStore((state) => state.matchSneaker);
  const [target, setTarget] = useState<ColorSlot>('shirt');
  const hintId = useId();

  const replaced = new Set(WEAR_SLOTS.filter((slot) => choice.wear[slot]).map((slot) => REPLACED_COLORS[slot]));
  const colorSlots = COLOR_SLOTS.filter((slot) => !replaced.has(slot));
  const shownTarget = colorSlots.includes(target) ? target : (colorSlots[0] ?? target);
  const current: GarmentColor =
    choice.colors[shownTarget] ?? (shownTarget === 'shirt' ? themeShirt(theme) : DEFAULT_COLORS[shownTarget]);
  // Pulsado mientras la gorra y las franjas siguen el acento del par.
  const matched = MATCH_SLOTS.every((slot) => (choice.colors[slot] ?? DEFAULT_COLORS[slot as Exclude<ColorSlot, 'shirt'>]) === 'match');

  return (
    <div className={styles.stack}>
      <label className={styles.row}>
        <span className={styles.label}>{t('colorTarget')}</span>
        <select className={styles.select} value={shownTarget} onChange={(event) => setTarget(event.target.value as ColorSlot)}>
          {colorSlots.map((slot) => (
            <option key={slot} value={slot}>
              {t(`slots.${slot}`)}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.swatches} role="group" aria-label={t('palette', { garment: t(`slots.${shownTarget}`) })}>
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={styles.swatch}
            aria-pressed={current === swatch}
            aria-label={t(`swatches.${swatch}`)}
            title={t(`swatches.${swatch}`)}
            style={{ '--swatch': `var(${swatchToken(swatch)})` } as CSSProperties}
            onClick={() => setColor(shownTarget, swatch)}
          />
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.match} aria-pressed={matched} aria-describedby={hintId} onClick={matchSneaker}>
          <span className={styles.matchDot} aria-hidden="true" />
          {t('match')}
        </button>
      </div>
      <p id={hintId} className={styles.hint}>
        {t('matchHint')}
      </p>
      <p className={styles.note}>{t('catalogColors')}</p>
    </div>
  );
}
