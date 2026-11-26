import type { Locale } from '@airspace/contracts';
import { getTranslations } from 'next-intl/server';
import { ProductCard } from '@/components/catalog/ProductCard';
import { Reveal } from '@/components/motion/Reveal';
import { Link } from '@/i18n/navigation';
import { getProducts } from '@/lib/api';
import { HOME_ANCHORS } from '@/lib/home';
import { FeaturedHead } from './FeaturedHead';
import styles from './Featured.module.css';
import { HangarMount } from './HangarMount';
import type { BoardProduct } from './types';
import ui from './ui.module.css';

// Cuántos destacados muestra la home. La API entrega los sneakers en el orden
// de vitrina del seed (FEATURED primero: Travis, Dunk Hawaii, Prophere,
// Gazelle, Uptempo y University Blue), así que basta con tomar los primeros.
const FEATURED_COUNT = 6;

// "Destacados" de la home: los sneakers de vitrina con la misma tarjeta del
// catálogo (y su transición al producto), un botón al catálogo completo y,
// debajo, el adelanto del Hangar 360°. Componente de servidor: los datos van
// en la caché de Next; solo el encabezado y el hangar son de cliente.
export async function HomeBoard({ locale }: { locale: Locale }) {
  const [t, sneakers, all] = await Promise.all([getTranslations('HomeBoard'), getProducts({ locale, category: 'sneaker' }), getProducts({ locale })]);
  const featured = sneakers.items.slice(0, FEATURED_COUNT);
  if (!featured.length) return null;

  const brands = [...new Map(sneakers.items.map((item) => [item.brand.slug, item.brand.name])).values()];
  const total = all.items.length;

  // El hangar gira el primer destacado (antes, el par elegido por defecto).
  const first = featured[0];
  const hangarProduct: BoardProduct = {
    slug: first.slug,
    reference: first.reference,
    name: first.name,
    brand: first.brand,
    colorway: first.colorway,
    tagline: first.tagline,
    tags: [],
    price: first.price,
    availability: first.availability,
    sizeRange: first.sizeRange,
    sizes: [],
    model: first.model,
    accent: first.accent,
  };

  return (
    <>
      {/* tabIndex -1: destino de anclas. scrollToElement lo agrega al saltar a
          #catalogo (a veces antes de hidratar); declararlo evita el desajuste. */}
      <section id={HOME_ANCHORS.board} className={styles.section} aria-labelledby="catalogo-title" tabIndex={-1}>
        <div className={`${styles.inner} ${ui.container}`}>
          <FeaturedHead brands={brands} count={featured.length} />

          <Reveal as="ul" className={styles.grid} stagger={0.05}>
            {featured.map((product) => (
              <li key={product.slug}>
                <ProductCard product={product} headingLevel="h3" />
              </li>
            ))}
          </Reveal>

          <div className={styles.more}>
            <Link href="/catalog" className={`${ui.btn} ${ui.btnPrimary} ${styles.cta}`}>
              {t('cta')}
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <p className={`${ui.hudLabel} ${styles.total}`}>{t('ctaCount', { count: total })}</p>
          </div>
        </div>
      </section>

      <HangarMount product={hangarProduct} />
    </>
  );
}
