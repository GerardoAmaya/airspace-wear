import type { Locale } from '@airspace/contracts';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ProductCard } from '@/components/catalog/ProductCard';
import { FeaturedHead } from '@/components/home/board/FeaturedHead';
import styles from '@/components/home/board/Featured.module.css';
import ui from '@/components/home/board/ui.module.css';
import { Reveal } from '@/components/motion/Reveal';
import { Link } from '@/i18n/navigation';
import { getProducts } from '@/lib/api';
import { HOME_ANCHORS } from '@/lib/home';
import { pickHomeApparel } from '@/lib/home-apparel';
import own from './Apparel.module.css';

// "Ropa" de la home (plan del paso 4, fase 2): las prendas de vitrina con la
// misma tarjeta y la misma rejilla que "Destacados", y un botón al catálogo
// filtrado por ropa. Sin prendas publicadas no se pinta nada, así producción
// sigue limpia hasta que llegue la ropa. Componente de servidor: solo el
// encabezado (decodificación del título) es de cliente.
export async function HomeApparel({ locale }: { locale: Locale }) {
  const [t, format, apparel] = await Promise.all([getTranslations('HomeApparel'), getFormatter(), getProducts({ locale, category: 'apparel' })]);
  // Selección fija del dueño, completada con el resto (lib/home-apparel.ts).
  const featured = pickHomeApparel(apparel.items);
  if (!featured.length) return null;

  const brands = [...new Map(apparel.items.map((item) => [item.brand.slug, item.brand.name])).values()];
  const count = featured.length;
  const copy = {
    store: t('store'),
    kicker: t('kicker'),
    title: t('title'),
    count: t('count', { padded: format.number(count, { minimumIntegerDigits: 2 }), count }),
    lead: t('lead'),
  };

  return (
    // tabIndex -1: destino de anclas (#ropa), igual que #catalogo.
    <section id={HOME_ANCHORS.apparel} className={styles.section} aria-labelledby="ropa-title" tabIndex={-1}>
      <div className={`${styles.inner} ${own.tight} ${ui.container}`}>
        <FeaturedHead brands={brands} copy={copy} titleId="ropa-title" />

        <Reveal as="ul" className={styles.grid} stagger={0.05}>
          {featured.map((product) => (
            <li key={product.slug}>
              <ProductCard product={product} headingLevel="h3" />
            </li>
          ))}
        </Reveal>

        <div className={styles.more}>
          <Link href={{ pathname: '/catalog', query: { category: 'apparel' } }} className={`${ui.btn} ${ui.btnPrimary} ${styles.cta}`}>
            {t('cta')}
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <p className={`${ui.hudLabel} ${styles.total}`}>{t('ctaCount', { count: apparel.items.length })}</p>
        </div>
      </div>
    </section>
  );
}
