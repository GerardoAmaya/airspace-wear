import type { Metadata, Viewport } from 'next';
import { Hubot_Sans, Martian_Mono, Mona_Sans } from 'next/font/google';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { hasLocale, NextIntlClientProvider, useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CartLayer } from '@/components/cart/CartLayer';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { MotionRoot } from '@/components/motion/MotionRoot';
import { routing } from '@/i18n/routing';
import { localeAlternates, SITE_URL } from '@/lib/seo';
import '@/styles/tokens.css';
import '@/styles/base.css';

// Tipografías variables con eje de ancho (ver CLAUDE.md). Cada una publica
// su variable CSS, que tokens.css convierte en --font-display/body/mono.
const hubot = Hubot_Sans({ subsets: ['latin'], axes: ['wdth'], variable: '--font-hubot', display: 'swap' });
const mona = Mona_Sans({ subsets: ['latin'], axes: ['wdth'], variable: '--font-mona', display: 'swap' });
const martian = Martian_Mono({ subsets: ['latin'], axes: ['wdth'], variable: '--font-martian', display: 'swap' });

// Antes de pintar: tema (guardado, luego sistema), modo liviano en equipos
// modestos, restauración manual del scroll y la marca motion-ok (movimiento
// permitido) que usan las entradas. Igual que el prototipo.
// Recarga con una posición guardada (sin ancla): la clase restoring oculta
// el contenido (solo opacidad) hasta que MotionRoot vuelve a esa posición,
// así no se ve la parte de arriba un instante. Pase lo que pase, a los
// 1,5 s se quita sola: el contenido nunca depende de JS para verse.
const BOOT_SCRIPT = `(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem('airspace-theme'); } catch (error) {}
  var system = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  root.setAttribute('data-theme', saved === 'light' || saved === 'dark' ? saved : system);
  var nav = navigator, connection = nav.connection || {};
  if ((nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) || (nav.deviceMemory && nav.deviceMemory <= 4) || connection.saveData || /(^|-)2g|3g/.test(connection.effectiveType || '')) root.classList.add('lite');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) root.classList.add('motion-ok');
  try {
    var entry = performance.getEntriesByType('navigation')[0];
    var stored = Number(sessionStorage.getItem('airspace-scroll:' + location.pathname)) || 0;
    if (entry && entry.type === 'reload' && !location.hash && stored > 0) {
      root.classList.add('restoring');
      setTimeout(function () { root.classList.remove('restoring'); }, 1500);
    }
  } catch (error) {}
})();`;

// Entrar a /[locale] desde fuera solo ocurre al cambiar de idioma, y ambos
// idiomas ya se prerenderizan (generateStaticParams). Se excluye este
// segmento de la validación de navegación instantánea; las páginas de
// abajo se siguen validando.
export const instant = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  const code = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: code, namespace: 'Metadata' });
  return {
    metadataBase: SITE_URL,
    title: { default: t('title'), template: t('titleTemplate') },
    description: t('description'),
    // Las de la home; cada página declara las suyas.
    alternates: localeAlternates(code, ''),
    // Vista previa al compartir: la imagen sale de opengraph-image.tsx (la de
    // la home aquí y la de cada ficha en products/[slug]); X la hereda de
    // og:image. El título y la descripción los toma de cada página.
    openGraph: { type: 'website', siteName: t('title') },
    twitter: { card: 'summary_large_image' },
  };
}

export const viewport: Viewport = {
  // Valor inicial (fondo del tema oscuro, --color-background); lib/theme.ts
  // lo cambia en vivo con el tema.
  themeColor: '#0e0e10',
};

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    // data-theme lo fija el script antes de pintar; por eso el aviso de
    // hidratación se silencia solo en <html>.
    <html lang={locale} data-theme="dark" className={`${hubot.variable} ${mona.variable} ${martian.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <SkipLink />
          <MotionRoot>
            <SiteHeader />
            <main id="contenido">{children}</main>
            <SiteFooter />
          </MotionRoot>
          <Suspense>
            <CartLayer locale={locale} />
          </Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

function SkipLink() {
  const t = useTranslations('Layout');
  return (
    <a className="skip-link" href="#contenido">
      {t('skipToContent')}
    </a>
  );
}
