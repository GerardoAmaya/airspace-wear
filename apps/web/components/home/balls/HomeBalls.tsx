import type { Locale } from '@airspace/contracts';
import { getProduct, getProducts } from '@/lib/api';
import { BallShowcase } from './BallShowcase';
import { type Ball, toBall } from './ball-data';

// Sección "Balones" de la home (en el prototipo, sections/baggage): la
// colección mundialista con un foco 3D, el selector y la banda transportadora.
// Este componente de servidor solo junta los datos (en caché, ya traducidos);
// todo lo interactivo vive en BallShowcase (cliente).
export async function HomeBalls({ locale }: { locale: Locale }) {
  const list = await getProducts({ locale, category: 'ball' });
  const details = await Promise.all(list.items.map((card) => getProduct(card.slug, locale)));
  // Orden de la API: del más nuevo al más antiguo.
  const balls = list.items.map((card, index) => toBall(card, details[index], locale)).filter((ball): ball is Ball => ball !== null);
  if (!balls.length) return null;
  return <BallShowcase balls={balls} locale={locale} />;
}
