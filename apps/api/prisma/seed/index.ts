// Seed del catálogo: carga marcas, créditos, modelos 3D, productos con sus
// textos en es y en, tallas y hotspots. Es repetible: actualiza por slug y
// reemplaza tallas y hotspots de cada producto.
//
// Uso: pnpm --filter @airspace/api db:seed
// Base destino: DATABASE_URL (o la local de docker-compose).

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { LOCAL_DATABASE_URL } from '../../src/config/env.js';
import { loadWorkspaceEnv } from '../../src/config/load-env.js';
import { ALPHA_SIZES, hotspotViewSchema, LOCALES, ONE_SIZE_LABEL, SIZE_SYSTEMS_BY_CATEGORY } from '@airspace/contracts';
import { BRANDS, FEATURED, isPublished, PRODUCTS, type SeedProduct } from './catalog.js';
import { AVATAR_CREDITS, describeChanges, type ManifestModel, MIXAMO, STATIC_CREDITS } from './credits.js';
import { HOTSPOTS } from './hotspots.js';

const LATERAL_SIDE = { '+z': 'plus_z', '-z': 'minus_z' } as const;

// Contraste WCAG de un color contra los fondos de cada tema: el acento se usa
// en texto ("En foco"), así que debe pasar 4.5:1 en su tema.
const THEME_BACKGROUNDS = { dark: ['#0e0e10', '#1c1c21'], light: ['#f4f1ea', '#fbf9f4'] } as const;
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}
function assertAccent(slug: string, accent: { dark: string; light: string }): void {
  for (const theme of ['dark', 'light'] as const) {
    for (const background of THEME_BACKGROUNDS[theme]) {
      const ratio = contrast(accent[theme], background);
      if (ratio < 4.5) throw new Error(`${slug}: el acento ${theme} ${accent[theme]} solo da ${ratio.toFixed(2)}:1 sobre ${background}`);
    }
  }
}
const MANIFEST_PATH = path.resolve(import.meta.dirname, '../../../../assets/models/manifest.json');
const POSTERS_DIR = path.resolve(import.meta.dirname, '../../../web/public/posters');

// URL pública de un póster, solo si el archivo existe (pnpm models:posters).
const posterUrl = (slug: string, theme: 'dark' | 'light') =>
  existsSync(path.join(POSTERS_DIR, `${slug}-${theme}.webp`)) ? `/posters/${slug}-${theme}.webp` : null;

// Existencias ilustrativas y estables entre corridas: se derivan del slug y
// la talla. Los productos con "últimos pares" quedan con 0 a 2 por talla.
function stockFor(product: SeedProduct, label: string): number {
  let hash = 0;
  for (const char of `${product.slug}:${label}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  if (product.availability === 'low_stock') return hash % 3;
  if (product.availability === 'coming_soon') return 0;
  return hash % 7 === 0 ? 0 : 3 + (hash % 10);
}

function sizeLabels(product: SeedProduct): string[] {
  const { sizes } = product;
  if (sizes.system === 'BALL' || sizes.system === 'ALPHA') return sizes.labels;
  if (sizes.system === 'ONE') return [ONE_SIZE_LABEL];
  return Array.from({ length: sizes.to - sizes.from + 1 }, (_, index) => String(sizes.from + index));
}

// Reglas de la ropa y de las tallas que el tipo no alcanza a expresar: el
// sistema de tallas corresponde a la categoría, las letras van en orden y
// sin repetir, y subcategoría y lugar en el avatar son solo de la ropa (la
// base lo refuerza con CHECK).
export function assertProductRules(product: SeedProduct): void {
  const { slug, category, sizes } = product;
  const systems: readonly string[] = SIZE_SYSTEMS_BY_CATEGORY[category];
  if (!systems.includes(sizes.system)) throw new Error(`${slug}: la categoría ${category} no usa tallas ${sizes.system}`);
  if (sizes.system === 'ALPHA') {
    const ranks = sizes.labels.map((label) => ALPHA_SIZES.indexOf(label));
    if (!ranks.length || ranks.some((rank, index) => rank < 0 || (index > 0 && rank <= ranks[index - 1]!))) {
      throw new Error(`${slug}: tallas de letra fuera de orden o repetidas (${sizes.labels.join(', ')})`);
    }
  }
  if (category === 'apparel' && !product.subcategory) throw new Error(`${slug}: la ropa necesita subcategory`);
  if (category !== 'apparel' && (product.subcategory || product.avatarSlot)) throw new Error(`${slug}: subcategory y avatarSlot son solo de la ropa`);
}

export async function seed(prisma: PrismaClient, log: (line: string) => void = console.log): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { models: Record<string, ManifestModel> };

  // Marcas
  const brandIds = new Map<string, number>();
  for (const brand of BRANDS) {
    const row = await prisma.brand.upsert({ where: { slug: brand.slug }, update: { name: brand.name }, create: brand });
    brandIds.set(brand.slug, row.id);
  }

  // Créditos fijos (fuentes y librerías)
  let order = 0;
  for (const credit of STATIC_CREDITS) {
    const data = { ...credit, sourceTitle: null, commercialUse: true, shareAlike: false, changes: [], sortOrder: 100 + order++ };
    await prisma.assetCredit.upsert({ where: { key: credit.key }, update: data, create: data });
  }

  // Avatar del Hangar 360° (Mixamo): después de los modelos, antes de las fuentes.
  order = 0;
  for (const credit of AVATAR_CREDITS) {
    const data = { ...MIXAMO, ...credit, sortOrder: 50 + order++ };
    await prisma.assetCredit.upsert({ where: { key: credit.key }, update: data, create: data });
  }

  // Modelos 3D y sus créditos, desde el manifest
  const modelIds = new Map<string, number>();
  // Un modelo a medio procesar (en el manifest pero sin variantes hero y
  // lite, porque pnpm models sigue corriendo) se trata como pendiente.
  const isReady = (model: ManifestModel) => {
    const variants = model.variants as Partial<ManifestModel['variants']> | undefined;
    return Boolean(variants?.hero && variants.lite);
  };
  const ready = Object.values(manifest.models).filter(isReady);
  order = 0;
  for (const model of ready) {
    const { source } = model;
    const creditData = {
      key: `model:${model.slug}`,
      kind: 'model' as const,
      name: model.displayName,
      sourceTitle: source.title,
      sourceUrl: source.url,
      author: source.author,
      authorUrl: source.authorUrl ?? null,
      licenseName: source.license.name,
      licenseUrl: source.license.url ?? null,
      commercialUse: source.license.commercialUse,
      shareAlike: source.license.shareAlike,
      changes: describeChanges(model),
      sortOrder: order++,
    };
    const credit = await prisma.assetCredit.upsert({ where: { key: creditData.key }, update: creditData, create: creditData });
    const modelData = {
      slug: model.slug,
      heroUrl: model.variants.hero.file,
      liteUrl: model.variants.lite.file,
      heroBytes: model.variants.hero.bytes,
      liteBytes: model.variants.lite.bytes,
      heroTriangles: model.variants.hero.triangles,
      liteTriangles: model.variants.lite.triangles,
      foot: model.pose?.foot ?? null,
      lateralSideFacing: model.pose?.lateralSideFacing ? LATERAL_SIDE[model.pose.lateralSideFacing as keyof typeof LATERAL_SIDE] ?? null : null,
      posterDarkUrl: posterUrl(model.slug, 'dark'),
      posterLightUrl: posterUrl(model.slug, 'light'),
      creditId: credit.id,
    };
    const row = await prisma.model3D.upsert({ where: { slug: model.slug }, update: modelData, create: modelData });
    modelIds.set(model.slug, row.id);
  }

  // Modelos que salieron del manifest: se borran con su crédito (ningún
  // producto publicado puede apuntarles; los retirados sueltan su modelo abajo).
  const staleModels = await prisma.model3D.findMany({ where: { slug: { notIn: [...modelIds.keys()] } }, select: { id: true, creditId: true } });

  // Productos que ya no están en el seed: se despublican (no se borran) y
  // sueltan su referencia y su modelo, para que un producto nuevo o renombrado
  // pueda usarlos sin chocar con las claves únicas.
  const retired = await prisma.product.findMany({ where: { slug: { notIn: PRODUCTS.map((product) => product.slug) } }, select: { id: true } });
  for (const { id } of retired) {
    await prisma.product.update({ where: { id }, data: { published: false, modelId: null, reference: `RETIRED-${id}` } });
  }

  for (const stale of staleModels) {
    await prisma.product.updateMany({ where: { modelId: stale.id }, data: { modelId: null, published: false } });
    await prisma.model3D.delete({ where: { id: stale.id } });
    await prisma.assetCredit.delete({ where: { id: stale.creditId } });
  }

  // Productos, en orden de vitrina (FEATURED primero, luego el resto).
  const featuredRank = (slug: string) => (FEATURED.includes(slug) ? FEATURED.indexOf(slug) : FEATURED.length);
  const ordered = [...PRODUCTS].sort((a, b) => featuredRank(a.slug) - featuredRank(b.slug));
  // Un modelo que todavía no está en el manifest (recién agregado a
  // scripts/models/config.mjs, sin pnpm models) no frena el seed: el producto
  // queda sin publicar hasta tener su 3D (no se muestran tarjetas vacías) y
  // se avisa. Al correr el seed de nuevo con el manifest al día, el producto
  // toma su modelo y se publica.
  const pendingModels: string[] = [];
  for (const [index, product] of ordered.entries()) {
    const brandId = brandIds.get(product.brand);
    if (!brandId) throw new Error(`Marca desconocida en ${product.slug}: ${product.brand}`);
    const modelId = product.model ? modelIds.get(product.model) : undefined;
    if (product.model && !modelId) pendingModels.push(product.model);
    for (const locale of LOCALES) {
      if (!product.text[locale]) throw new Error(`${product.slug} no tiene textos en ${locale}`);
    }
    assertProductRules(product);
    if (product.accent) assertAccent(product.slug, product.accent);
    for (const hotspot of HOTSPOTS[product.slug] ?? []) {
      hotspotViewSchema.parse(hotspot.view);
      for (const locale of LOCALES) if (!hotspot.text[locale]) throw new Error(`${product.slug}/${hotspot.key} no tiene textos en ${locale}`);
    }

    await prisma.$transaction(async (tx) => {
      const base = {
        reference: product.reference,
        category: product.category,
        subcategory: product.subcategory ?? null,
        avatarSlot: product.avatarSlot ?? null,
        brandId,
        priceCents: product.priceCents,
        availability: product.availability,
        attributes: product.attributes,
        published: isPublished(product) && !(product.model && !modelId),
        sortOrder: index,
        modelId: modelId ?? null,
        accentDark: product.accent?.dark ?? null,
        accentLight: product.accent?.light ?? null,
      };
      const row = await tx.product.upsert({ where: { slug: product.slug }, update: base, create: { slug: product.slug, ...base } });

      for (const locale of LOCALES) {
        const text = product.text[locale];
        const data = {
          name: text.name,
          colorway: text.colorway ?? null,
          tagline: text.tagline,
          description: text.description,
          edition: text.edition ?? null,
          hostCity: text.hostCity ?? null,
          materials: text.materials,
          tags: text.tags,
        };
        await tx.productTranslation.upsert({
          where: { productId_locale: { productId: row.id, locale } },
          update: data,
          create: { productId: row.id, locale, ...data },
        });
      }

      await tx.productSize.deleteMany({ where: { productId: row.id } });
      await tx.productSize.createMany({
        data: sizeLabels(product).map((label, sortOrder) => ({
          productId: row.id,
          system: product.sizes.system,
          label,
          sortOrder,
          stock: stockFor(product, label),
        })),
      });

      await tx.hotspot.deleteMany({ where: { productId: row.id } });
      for (const [sortOrder, hotspot] of (HOTSPOTS[product.slug] ?? []).entries()) {
        await tx.hotspot.create({
          data: {
            productId: row.id,
            key: hotspot.key,
            sortOrder,
            position: hotspot.position,
            view: hotspot.view,
            translations: { create: LOCALES.map((locale) => ({ locale, ...hotspot.text[locale] })) },
          },
        });
      }
    });
  }

  if (pendingModels.length) log(`Aviso: ${pendingModels.length} productos quedan sin 3D porque su modelo no está en el manifest: ${pendingModels.join(', ')}.`);
  const missingPosters = [...modelIds.keys()].filter((slug) => !posterUrl(slug, 'dark') || !posterUrl(slug, 'light'));
  if (missingPosters.length) log(`Aviso: modelos sin póster (pnpm models:posters): ${missingPosters.join(', ')}.`);
  log(
    `Seed listo: ${BRANDS.length} marcas, ${PRODUCTS.length} productos (es y en; ${PRODUCTS.filter(isPublished).length - pendingModels.length} publicados), ${modelIds.size} modelos 3D, ` +
      `${STATIC_CREDITS.length + modelIds.size} créditos${retired.length ? `, ${retired.length} retirados` : ''}.`,
  );
}

// Ejecución directa (no al importarlo desde las pruebas).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadWorkspaceEnv();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL }) });
  try {
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
  // Avisa a la web para que refresque su caché del catálogo (si está arriba).
  const webUrl = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  try {
    const response = await fetch(`${webUrl}/api/revalidate`, {
      method: 'POST',
      headers: process.env.REVALIDATE_SECRET ? { 'x-revalidate-secret': process.env.REVALIDATE_SECRET } : {},
      signal: AbortSignal.timeout(3000),
    });
    console.log(response.ok ? 'Web: caché del catálogo refrescada.' : `Web: no se pudo refrescar la caché (HTTP ${response.status}).`);
  } catch {
    console.log('Web: no está arriba; su caché se refresca sola en unos minutos.');
  }
}
