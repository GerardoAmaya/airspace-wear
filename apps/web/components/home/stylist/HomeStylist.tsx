import type { Locale } from '@airspace/contracts';
import { getTranslations } from 'next-intl/server';
import { getProduct, getProducts } from '@/lib/api';
import { formatPrice } from '@/lib/price';
import type { CatalogEntry } from './api-engine';
import type { RecommendedProduct, StylistScript } from './engine';
import { type ScenarioCopy, STYLIST_SCENARIOS } from './script';
import { StylistSection } from './StylistSection';

// Sección "Estilista IA" (#estilista). El servidor arma el guion en el idioma
// de la ruta con datos reales de la API (nombre, precio, etiquetas y póster
// de cada recomendación) y la consola del cliente lo reproduce.
export async function HomeStylist({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'HomeStylist' });
  const slugs = [...new Set(STYLIST_SCENARIOS.flatMap((scenario) => scenario.picks.map((pick) => pick.slug)))];
  const [list, details] = await Promise.all([getProducts({ locale }), Promise.all(slugs.map((slug) => getProduct(slug, locale)))]);
  const bySlug = new Map(details.filter((product) => product !== null).map((product) => [product.slug, product]));

  const scenarios = STYLIST_SCENARIOS.map((scenario) => {
    const key = `scenarios.${scenario.id}` as const;
    const copy: ScenarioCopy = {
      chip: t.raw(`${key}.chip`) as string,
      question: t.raw(`${key}.question`) as string,
      answer: t.raw(`${key}.answer`) as string,
      reasons: [t.raw(`${key}.reason1`) as string, t.raw(`${key}.reason2`) as string],
    };
    const products: RecommendedProduct[] = [];
    let answer = copy.answer;
    scenario.picks.forEach((pick, index) => {
      const product = bySlug.get(pick.slug);
      // Si un producto desapareciera del catálogo, la respuesta nombra igual
      // el hueco sin romperse y la tarjeta se omite.
      answer = answer.replace(`{p${index + 1}}`, product ? `[${product.name}]` : '');
      if (!product) return;
      products.push({
        slug: product.slug,
        brand: product.brand.name,
        name: product.name,
        price: formatPrice(product.price, locale),
        tags: product.tags,
        poster: product.model?.poster ?? null,
        match: pick.match,
        reason: copy.reasons[index] ?? '',
      });
    });
    return { id: scenario.id, chip: copy.chip, question: copy.question, answer, products };
  });

  const script: StylistScript = {
    locale,
    scenarios: scenarios.map(({ id, question, answer, products }) => ({ id, question, answer, products })),
    freeReply: t.raw('freeReply') as string,
  };

  // Datos de cada producto para las tarjetas que recomiende la IA real (la
  // API solo devuelve slugs; nombre, precio y póster salen de aquí).
  const allDetails = await Promise.all(list.items.map((item) => getProduct(item.slug, locale)));
  const catalog: Record<string, CatalogEntry> = Object.fromEntries(
    allDetails
      .filter((product) => product !== null)
      .map((product) => [
        product.slug,
        { slug: product.slug, brand: product.brand.name, name: product.name, price: formatPrice(product.price, locale), tags: product.tags, poster: product.model?.poster ?? null },
      ]),
  );

  return <StylistSection script={script} chips={scenarios.map(({ id, chip }) => ({ id, label: chip }))} modelCount={list.items.length} catalog={catalog} />;
}
