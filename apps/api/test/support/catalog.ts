import { BRANDS, PUBLISHED_PRODUCTS, type SeedProduct } from '../../prisma/seed/catalog.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';

// Lo que el seed dejó a la vista en airspace_test. Un producto cuyo modelo
// todavía no está listo en el manifest (pnpm models sin terminar) queda sin
// publicar y sin 3D, misma regla que prisma/seed/index.ts. Los modelos
// listos se leen de la base (los que el seed cargó) y no del manifest: así
// las pruebas no se desfasan si pnpm models escribe el manifest mientras
// corren.
export interface SeededCatalog {
  // Slugs de los modelos 3D que el seed cargó.
  models: Set<string>;
  // Productos publicados tras el seed, en el orden de PRODUCTS.
  listed: SeedProduct[];
  // Productos marcados como publicados en el seed pero ocultos porque su
  // modelo todavía no está listo.
  pending: SeedProduct[];
}

export async function seededCatalog(prisma: PrismaService): Promise<SeededCatalog> {
  const rows = await prisma.model3D.findMany({ select: { slug: true } });
  const models = new Set(rows.map((row) => row.slug));
  const ready = (product: SeedProduct) => !product.model || models.has(product.model);
  return {
    models,
    listed: PUBLISHED_PRODUCTS.filter(ready),
    pending: PUBLISHED_PRODUCTS.filter((product) => !ready(product)),
  };
}

// Publica o despublica productos para una prueba y devuelve la función que
// los deja como estaban. Así una prueba que necesita ropa no depende de que
// sus modelos 3D ya existan.
export async function setPublished(
  prisma: PrismaService,
  slugs: readonly string[],
  published: boolean,
): Promise<() => Promise<void>> {
  const before = await prisma.product.findMany({
    where: { slug: { in: [...slugs] } },
    select: { slug: true, published: true },
  });
  if (before.length !== new Set(slugs).size) {
    throw new Error(`setPublished: faltan productos en la base (${slugs.join(', ')})`);
  }
  await prisma.product.updateMany({ where: { slug: { in: [...slugs] } }, data: { published } });
  return async () => {
    for (const state of [true, false]) {
      const group = before.filter((row) => row.published === state).map((row) => row.slug);
      if (group.length) await prisma.product.updateMany({ where: { slug: { in: group } }, data: { published: state } });
    }
  };
}

// Marcas que /v1/brands muestra para estos productos: solo las que tienen
// alguno, por nombre (la base ordena las mayúsculas primero, como el sort
// por defecto de JS).
export function visibleBrandSlugs(products: readonly SeedProduct[]): string[] {
  const withProducts = new Set(products.map((product) => product.brand));
  return BRANDS.filter((brand) => withProducts.has(brand.slug))
    .map((brand) => brand.name)
    .sort()
    .map((name) => BRANDS.find((brand) => brand.name === name)!.slug);
}
