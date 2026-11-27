import { isWearable } from '@airspace/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { type HangarGarment, HangarStudio, type HangarProduct } from '@/components/hangar/HangarStudio';
import { pageLocale } from '@/i18n/locale';
import { getProduct, getProducts } from '@/lib/api';
import { HANGAR_ENABLED } from '@/lib/avatar/avatar';
import { isHangarWearable } from '@/lib/avatar/catalog-fit';
import { localeAlternates } from '@/lib/seo';

// Hangar 360° (paso 3): el avatar de Mixamo con el par elegido, en 360°.
export async function generateMetadata({ params }: PageProps<'/[locale]/hangar'>): Promise<Metadata> {
  const locale = pageLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Hangar' });
  return { title: t('metaTitle'), description: t('metaDescription'), alternates: localeAlternates(locale, '/hangar') };
}

export default async function HangarPage({ params }: PageProps<'/[locale]/hangar'>) {
  // Sin avatar publicado (producción sin NEXT_PUBLIC_AVATAR_URL), no hay página.
  if (!HANGAR_ENABLED) notFound();
  const locale = pageLocale((await params).locale);
  setRequestLocale(locale);
  // Se calzan sneakers y tacos (nunca balones): todo el catálogo en orden de
  // vitrina, filtrado por categoría calzable y con modelo de un pie.
  const { items } = await getProducts({ locale });
  const withModel = items.filter((item) => isWearable(item.category) && item.model?.foot);
  // Ropa que se puede poner en el maniquí: con lugar en el avatar y ya
  // ajustada (pnpm avatar:fit) y en la lista del Hangar (hangar-features.ts).
  const wearable = items.filter((item) => item.avatarSlot && isHangarWearable(item.slug));
  // Las tallas vienen en el detalle (lecturas en la caché de Next).
  const [details, garmentDetails] = await Promise.all([
    Promise.all(withModel.map((item) => getProduct(item.slug, locale))),
    Promise.all(wearable.map((item) => getProduct(item.slug, locale))),
  ]);
  const products: HangarProduct[] = withModel.map((item, index) => ({
    slug: item.slug,
    name: item.name,
    brand: item.brand.name,
    category: item.category,
    colorway: item.colorway,
    price: item.price,
    accent: item.accent,
    model: item.model!,
    sizes: details[index]?.sizes ?? [],
  }));
  const garments: HangarGarment[] = wearable.map((item, index) => ({
    slug: item.slug,
    name: item.name,
    brand: item.brand.name,
    slot: item.avatarSlot!,
    price: item.price,
    poster: item.model?.poster ?? null,
    sizes: garmentDetails[index]?.sizes ?? [],
  }));
  return <HangarStudio products={products} garments={garments} />;
}
