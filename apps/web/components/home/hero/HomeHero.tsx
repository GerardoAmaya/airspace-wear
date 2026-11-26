import type { Locale } from '@airspace/contracts';
import { getTranslations } from 'next-intl/server';
import { getProduct } from '@/lib/api';
import { HOME_HERO } from '@/lib/home';
import { formatPrice } from '@/lib/price';
import { type HeroContent, HeroClient } from './HeroClient';

// Portada de la home (sección "flight" del prototipo): el zapato elegido en
// lib/home.ts con su nombre animado, la retícula, los datos y el recorrido
// "Pieza por pieza". El servidor pide el producto a la API (en caché) y arma
// los textos que dependen de él; la parte interactiva y el 3D van en el cliente.
export async function HomeHero({ locale }: { locale: Locale }) {
  const product = await getProduct(HOME_HERO.slug, locale);
  // Sin producto (slug inválido o fuera del catálogo) no hay portada.
  if (!product?.model) return null;
  const t = await getTranslations({ locale, namespace: 'HomeHero' });
  const availability = await getTranslations({ locale, namespace: 'Availability' });
  const number = (value: unknown) => (typeof value === 'number' ? value : null);

  const content: HeroContent = {
    slug: product.slug,
    name: product.name,
    brand: product.brand.name,
    reference: product.reference,
    headline: HOME_HERO.headline,
    accent: product.accent,
    model: product.model,
    hotspots: product.hotspots,
    price: formatPrice(product.price, locale),
    sizes: product.sizeRange ? t('readouts.sizesValue', { system: product.sizeRange.system, min: product.sizeRange.min, max: product.sizeRange.max }) : null,
    availability: availability(product.availability),
    availabilityTone: product.availability === 'low_stock' ? 'alert' : product.availability === 'new' ? 'primary' : 'muted',
    weightGrams: number(product.attributes.weightGrams),
    stackMm: number(product.attributes.stackMm),
    upper: product.materials.upper ?? null,
    sole: product.materials.sole ?? null,
  };

  return <HeroClient content={content} />;
}
