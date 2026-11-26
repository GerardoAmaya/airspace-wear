import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HangarStudio, type HangarProduct } from '@/components/hangar/HangarStudio';
import { pageLocale } from '@/i18n/locale';
import { getProduct, getProducts } from '@/lib/api';
import { HANGAR_ENABLED } from '@/lib/avatar/avatar';
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
  const { items } = await getProducts({ locale, category: 'sneaker' });
  const withModel = items.filter((item) => item.model?.foot);
  // Las tallas vienen en el detalle (lecturas en la caché de Next).
  const details = await Promise.all(withModel.map((item) => getProduct(item.slug, locale)));
  const products: HangarProduct[] = withModel.map((item, index) => ({
    slug: item.slug,
    name: item.name,
    brand: item.brand.name,
    colorway: item.colorway,
    price: item.price,
    accent: item.accent,
    model: item.model!,
    sizes: details[index]?.sizes ?? [],
  }));
  return <HangarStudio products={products} />;
}
