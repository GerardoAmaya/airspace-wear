import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type BrandList,
  CATEGORIES,
  type CategoryList,
  type Locale,
  type ProductCard,
  type ProductDetail,
  type ProductList,
  type ProductListQuery,
} from '@airspace/contracts';
import { TtlCache } from '../common/ttl-cache.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogDataError, cardInclude, detailInclude, toCard, toDetail } from './catalog.mapper.js';

const CACHE_TTL_MS = 60_000;

// Lecturas del catálogo con caché en memoria. Cada tipo de lectura tiene su
// propia caché acotada: muchos detalles distintos no pueden desalojar las
// listas, y una marca o un slug inexistente nunca ocupa lugar (los 404 no se
// guardan y las marcas se validan antes de consultar).
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private readonly lists = new TtlCache<ProductList>(CACHE_TTL_MS, 50);
  private readonly details = new TtlCache<ProductDetail>(CACHE_TTL_MS, 200);
  private readonly facets = new TtlCache<BrandList | CategoryList>(CACHE_TTL_MS, 4);

  constructor(private readonly prisma: PrismaService) {}

  async listProducts({ locale, category, brand }: ProductListQuery): Promise<ProductList> {
    if (brand) {
      const brands = await this.listBrands();
      if (!brands.items.some((item) => item.slug === brand)) return { locale, items: [] };
    }
    return this.lists.get(`products:${locale}:${category ?? '*'}:${brand ?? '*'}`, async () => {
      const rows = await this.prisma.product.findMany({
        where: { published: true, ...(category ? { category } : {}), ...(brand ? { brand: { slug: brand } } : {}) },
        include: cardInclude(locale),
        orderBy: { sortOrder: 'asc' },
      });
      // Un producto con datos rotos se omite (y se registra) en lugar de
      // tumbar todo el listado.
      const items = rows.flatMap((row): ProductCard[] => {
        try {
          return [toCard(row, locale)];
        } catch (error) {
          if (!(error instanceof CatalogDataError)) throw error;
          this.logger.error(error.message);
          return [];
        }
      });
      return { locale, items };
    });
  }

  getProduct(slug: string, locale: Locale): Promise<ProductDetail> {
    return this.details.get(`product:${slug}:${locale}`, async () => {
      const row = await this.prisma.product.findFirst({ where: { slug, published: true }, include: detailInclude(locale) });
      // Lanzar dentro de la carga hace que la caché no guarde el 404.
      if (!row) throw new NotFoundException();
      return toDetail(row, locale);
    });
  }

  listBrands(): Promise<BrandList> {
    return this.facets.get('brands', async () => {
      const rows = await this.prisma.brand.findMany({
        select: { slug: true, name: true, _count: { select: { products: { where: { published: true } } } } },
        orderBy: { name: 'asc' },
      });
      return {
        items: rows.filter((row) => row._count.products > 0).map((row) => ({ slug: row.slug, name: row.name, productCount: row._count.products })),
      };
    }) as Promise<BrandList>;
  }

  // Todas las categorías, también las vacías (ropa): la web decide si mostrarlas.
  listCategories(): Promise<CategoryList> {
    return this.facets.get('categories', async () => {
      const groups = await this.prisma.product.groupBy({ by: ['category'], where: { published: true }, _count: { _all: true } });
      const counts = new Map(groups.map((group) => [group.category, group._count._all]));
      return { items: CATEGORIES.map((slug) => ({ slug, productCount: counts.get(slug) ?? 0 })) };
    }) as Promise<CategoryList>;
  }
}
