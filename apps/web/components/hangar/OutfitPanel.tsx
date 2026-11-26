'use client';

import { useTranslations } from 'next-intl';
import { type CSSProperties, useId, useState } from 'react';
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
import { useOutfitChoice, useOutfitStore } from './outfit-store';
import styles from './OutfitPanel.module.css';

// Panel "Vestuario" del Hangar 360°: camiseta con o sin mangas, short o
// pantalón, gorra y lentes, y una paleta fija por prenda. En pantallas
// anchas flota sobre el lado izquierdo de la plataforma; en las angostas va
// debajo de los chips y se pliega. Botones con aria-pressed, como los chips.
export function OutfitPanel() {
  const t = useTranslations('Hangar.outfit');
  const choice = useOutfitChoice();
  const theme = useThemeStore((state) => state.theme);
  const setShirt = useOutfitStore((state) => state.setShirt);
  const setBottoms = useOutfitStore((state) => state.setBottoms);
  const setCap = useOutfitStore((state) => state.setCap);
  const setGlasses = useOutfitStore((state) => state.setGlasses);
  const setSocks = useOutfitStore((state) => state.setSocks);
  const setStripes = useOutfitStore((state) => state.setStripes);
  const setColor = useOutfitStore((state) => state.setColor);
  const matchSneaker = useOutfitStore((state) => state.matchSneaker);
  const reset = useOutfitStore((state) => state.reset);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ColorSlot>('shirt');
  const bodyId = useId();
  const hintId = useId();

  const current: GarmentColor = choice.colors[target] ?? (target === 'shirt' ? themeShirt(theme) : DEFAULT_COLORS[target]);
  // Pulsado mientras la gorra y las franjas siguen el acento del par.
  const matched = MATCH_SLOTS.every((slot) => (choice.colors[slot] ?? DEFAULT_COLORS[slot as Exclude<ColorSlot, 'shirt'>]) === 'match');

  return (
    <section className={styles.panel} aria-label={t('title')} data-open={open || undefined}>
      <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <span>{t('title')}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true" className={styles.chevron}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <p className={styles.title} aria-hidden="true">
        {t('title')}
      </p>

      <div id={bodyId} className={styles.body}>
        <div className={styles.row}>
          <span className={styles.label} id={`${bodyId}-shirt`}>
            {t('shirt')}
          </span>
          <div className={styles.options} role="group" aria-labelledby={`${bodyId}-shirt`}>
            {SHIRT_STYLES.map((style) => (
              <button key={style} type="button" className={styles.option} aria-pressed={choice.shirt === style} onClick={() => setShirt(style)}>
                {t(`shirtStyles.${style}`)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.row}>
          <span className={styles.label} id={`${bodyId}-bottoms`}>
            {t('bottoms')}
          </span>
          <div className={styles.options} role="group" aria-labelledby={`${bodyId}-bottoms`}>
            {BOTTOMS.map((style) => (
              <button key={style} type="button" className={styles.option} aria-pressed={choice.bottoms === style} onClick={() => setBottoms(style)}>
                {t(`bottomsStyles.${style}`)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.row}>
          <span className={styles.label} id={`${bodyId}-extras`}>
            {t('accessories')}
          </span>
          <div className={styles.options} role="group" aria-labelledby={`${bodyId}-extras`}>
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

        <label className={styles.row}>
          <span className={styles.label}>{t('colorTarget')}</span>
          <select className={styles.select} value={target} onChange={(event) => setTarget(event.target.value as ColorSlot)}>
            {COLOR_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {t(`slots.${slot}`)}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.swatches} role="group" aria-label={t('palette', { garment: t(`slots.${target}`) })}>
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={styles.swatch}
              aria-pressed={current === swatch}
              aria-label={t(`swatches.${swatch}`)}
              title={t(`swatches.${swatch}`)}
              style={{ '--swatch': `var(${swatchToken(swatch)})` } as CSSProperties}
              onClick={() => setColor(target, swatch)}
            />
          ))}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.match}
            aria-pressed={matched}
            aria-describedby={hintId}
            title={t('matchHint')}
            onClick={matchSneaker}
          >
            <span className={styles.matchDot} aria-hidden="true" />
            {t('match')}
          </button>
          <button type="button" className={styles.reset} onClick={reset}>
            {t('reset')}
          </button>
        </div>
        <p id={hintId} className={styles.hint}>
          {t('matchHint')}
        </p>
      </div>
    </section>
  );
}
