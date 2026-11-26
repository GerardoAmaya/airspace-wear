import type { Locale } from '@airspace/contracts';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getProduct } from '@/lib/api';
import { loadPoster } from '@/lib/og/assets';
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard, titleSizeFor } from '@/lib/og/card';
import { formatPrice } from '@/lib/price';
import { SITE_URL } from '@/lib/seo';

// Imagen para compartir de una ficha: póster del producto (tema oscuro),
// nombre en el estilo de títulos, marca, precio con el mismo formato que la
// ficha (lib/price.ts, Intl por idioma) y el logo. Sin póster (por ejemplo,
// un producto sin modelo 3D) sale la versión con el logo en su lugar.
// La URL queda en /<idioma>/products/<slug>/opengraph-image/card.
type Params = { locale: string; slug: string };

async function productFor(params: Params) {
  if (!hasLocale(routing.locales, params.locale)) return null;
  const locale: Locale = params.locale;
  const product = await getProduct(params.slug, locale);
  return product ? { locale, product } : null;
}

export async function generateImageMetadata({ params }: { params: Params }) {
  const found = await productFor(params);
  if (!found) return [];
  const { locale, product } = found;
  const t = await getTranslations({ locale, namespace: 'Product' });
  const alt = t('ogAlt', { name: product.name, price: formatPrice(product.price, locale) });
  return [{ id: 'card', alt, size: OG_SIZE, contentType: OG_CONTENT_TYPE }];
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const found = await productFor(await params);
  if (!found) return new Response(null, { status: 404 });
  const { locale, product } = found;
  const [brand, poster] = await Promise.all([getTranslations({ locale, namespace: 'Brand' }), loadPoster(product.model?.poster?.dark)]);
  return renderOgCard({
    kicker: product.brand.name,
    title: product.name,
    titleSize: titleSizeFor(product.name),
    subtitle: product.colorway ?? undefined,
    highlight: formatPrice(product.price, locale),
    poster,
    host: SITE_URL.host,
    brand: { name: brand('name'), suffix: brand('suffix') },
  });
}
