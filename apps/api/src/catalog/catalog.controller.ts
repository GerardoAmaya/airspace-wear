import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  type BrandList,
  type CategoryList,
  type LocaleQuery,
  localeQuerySchema,
  type ProductDetail,
  type ProductList,
  type ProductListQuery,
  productListQuerySchema,
  slugSchema,
} from '@airspace/contracts';
import { PublicCache } from '../common/cache-control.js';
import { CatalogService } from './catalog.service.js';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // GET /v1/products?locale=es&category=sneaker&brand=adidas
  @Get('products')
  @PublicCache()
  listProducts(@Query({ schema: productListQuerySchema }) query: ProductListQuery): Promise<ProductList> {
    return this.catalog.listProducts(query);
  }

  // GET /v1/products/air-jordan-1?locale=en
  @Get('products/:slug')
  @PublicCache()
  getProduct(@Param('slug', { schema: slugSchema }) slug: string, @Query({ schema: localeQuerySchema }) query: LocaleQuery): Promise<ProductDetail> {
    return this.catalog.getProduct(slug, query.locale);
  }

  @Get('brands')
  @PublicCache()
  listBrands(): Promise<BrandList> {
    return this.catalog.listBrands();
  }

  @Get('categories')
  @PublicCache()
  listCategories(): Promise<CategoryList> {
    return this.catalog.listCategories();
  }
}
