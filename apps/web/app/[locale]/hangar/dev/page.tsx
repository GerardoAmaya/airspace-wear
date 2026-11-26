import { isWearable } from '@airspace/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { AvatarDevTool, type DevSneaker } from '@/components/hangar/dev/AvatarDevTool';
import { pageLocale } from '@/i18n/locale';
import { getProducts } from '@/lib/api';

// Herramienta de calibración del avatar (solo desarrollo, nunca enlazada).
// En producción responde 404. Sus rótulos son fijos en inglés: es una
// herramienta interna que no llega al sitio (docs/avatar-fitting.md, sección 6).
export const metadata: Metadata = { title: 'Avatar fitting (dev)', robots: { index: false, follow: false } };

export default async function HangarDevPage({ params }: PageProps<'/[locale]/hangar/dev'>) {
  if (process.env.NODE_ENV === 'production') notFound();
  const locale = pageLocale((await params).locale);
  setRequestLocale(locale);
  // Sneakers y tacos: lo mismo que se puede calzar en el Hangar.
  const { items } = await getProducts({ locale });
  const sneakers: DevSneaker[] = items.flatMap((item) =>
    isWearable(item.category) && item.model?.foot ? [{ slug: item.slug, name: item.name, url: item.model.liteUrl, foot: item.model.foot }] : [],
  );
  return <AvatarDevTool sneakers={sneakers} />;
}
