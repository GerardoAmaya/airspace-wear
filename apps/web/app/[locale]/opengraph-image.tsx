import type { Locale } from '@airspace/contracts';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { getProduct } from '@/lib/api';
import { HOME_HERO } from '@/lib/home';
import { loadPoster } from '@/lib/og/assets';
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from '@/lib/og/card';
import { SITE_URL } from '@/lib/seo';

// Imagen para compartir de la home (og:image y, por herencia, twitter:image).
// También la usan las páginas sin imagen propia (catálogo, balones, club...).
// generateImageMetadata da el texto alternativo en el idioma de la ruta (la
// exportación fija `alt` no puede traducirse); la URL queda en
// /<idioma>/opengraph-image/card.
type Params = { locale: string };

export async function generateImageMetadata({ params }: { params: Params }) {
  if (!hasLocale(routing.locales, params.locale)) return [];
  const t = await getTranslations({ locale: params.locale, namespace: 'Metadata' });
  return [{ id: 'card', alt: t('ogAlt'), size: OG_SIZE, contentType: OG_CONTENT_TYPE }];
}

// El zapato de la portada (el mismo que el hero). Si la API no responde, la
// tarjeta sale sin zapato en vez de fallar.
async function heroPoster(locale: Locale): Promise<string | null> {
  try {
    const product = await getProduct(HOME_HERO.slug, locale);
    return await loadPoster(product?.model?.poster?.dark);
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const [t, brand, poster] = await Promise.all([getTranslations({ locale, namespace: 'Metadata' }), getTranslations({ locale, namespace: 'Brand' }), heroPoster(locale)]);
  return renderOgCard({
    kicker: t('ogKicker'),
    title: null,
    titleSize: 54,
    subtitle: t('description'),
    poster,
    host: SITE_URL.host,
    brand: { name: brand('name'), suffix: brand('suffix') },
    showLogo: false,
  });
}
