import type { Locale } from '@airspace/contracts';
import { getTranslations } from 'next-intl/server';
import { getProducts } from '@/lib/api';
import { formatPrice } from '@/lib/price';
import type { CatalogEntry } from './api-engine';
import type { RecommendedProduct, StylistScript } from './engine';
import { type ScenarioCopy, STYLIST_SCENARIOS } from './script';

// Datos del estilista en el idioma pedido (solo servidor): el guion de las
// ideas sugeridas, con nombre, precio, etiquetas y póster reales de cada
// recomendación, y el catálogo con el que se arman las tarjetas que recomiende
// la IA (la API solo devuelve slugs). Lo usan la sección de la home y el panel
// flotante (app/api/stylist/context), así los dos responden igual.
export interface StylistData {
  script: StylistScript;
  chips: { id: string; label: string }[];
  catalog: Record<string, CatalogEntry>;
  modelCount: number;
}

export async function buildStylistData(locale: Locale): Promise<StylistData> {
  const t = await getTranslations({ locale, namespace: 'HomeStylist' });
  // La lista del catálogo (en caché) ya trae todo lo que muestra una tarjeta.
  const { items } = await getProducts({ locale });
  const catalog: Record<string, CatalogEntry> = Object.fromEntries(
    items.map((product) => [
      product.slug,
      { slug: product.slug, brand: product.brand.name, name: product.name, price: formatPrice(product.price, locale), tags: product.tags, poster: product.model?.poster ?? null },
    ]),
  );

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
      const product = catalog[pick.slug];
      // Si un producto desapareciera del catálogo, la respuesta nombra igual
      // el hueco sin romperse y la tarjeta se omite.
      answer = answer.replace(`{p${index + 1}}`, product ? `[${product.name}]` : '');
      if (!product) return;
      products.push({ ...product, match: pick.match, reason: copy.reasons[index] ?? '' });
    });
    return { id: scenario.id, chip: copy.chip, question: copy.question, answer, products };
  });

  return {
    script: {
      locale,
      scenarios: scenarios.map(({ id, question, answer, products }) => ({ id, question, answer, products })),
      freeReply: t.raw('freeReply') as string,
    },
    chips: scenarios.map(({ id, chip }) => ({ id, label: chip })),
    catalog,
    modelCount: items.length,
  };
}
