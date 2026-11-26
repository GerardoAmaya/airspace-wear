import type { Locale } from '@airspace/contracts';
import { setRequestLocale } from 'next-intl/server';
import { HomeBalls } from '@/components/home/balls/HomeBalls';
import { HomeBoard } from '@/components/home/board/HomeBoard';
import { HomeHero } from '@/components/home/hero/HomeHero';
import { HomeClub } from '@/components/home/stylist/HomeClub';
import { HomeStylist } from '@/components/home/stylist/HomeStylist';

// La validación de navegación instantánea (solo en desarrollo) no logra
// simular esta página completa y lo informa sin errores reales. Ambos idiomas
// se prerenderizan y los datos van en caché, así que se excluye de la
// validación en lugar de reestructurar la home.
export const instant = false;

// Home: las secciones del prototipo (design/prototype) en el sitio real. Cada
// sección es un componente de servidor que pide sus datos a la API (en caché)
// y monta sus partes interactivas en el cliente.
export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  return (
    <>
      <HomeHero locale={locale} />
      <HomeBoard locale={locale} />
      <HomeBalls locale={locale} />
      <HomeStylist locale={locale} />
      <HomeClub locale={locale} />
    </>
  );
}
