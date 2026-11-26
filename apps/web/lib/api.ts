import {
  type BrandList,
  brandListSchema,
  type CategoryList,
  categoryListSchema,
  type CreditList,
  creditListSchema,
  type HealthResponse,
  healthResponseSchema,
  type Locale,
  type ProductDetail,
  productDetailSchema,
  type ProductList,
  type ProductListQuery,
  productListSchema,
} from '@airspace/contracts';
import { cacheLife, cacheTag } from 'next/cache';

// Cliente de la API para el servidor de Next (el navegador nunca la llama
// directo; la web no guarda secretos). Cada respuesta se valida con los
// contratos compartidos. Las lecturas del catálogo se guardan en la caché de
// Next unos minutos ("use cache"), etiquetadas para poder invalidarlas.
//
// Importante: `next build` necesita la API arriba (pnpm db:up y pnpm dev:api),
// porque el catálogo se prerenderiza. Si no responde, el build falla en vez
// de publicar un catálogo vacío.
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`API ${status} ${code}`);
  }
}

async function request<T>(path: string, schema: { parse(value: unknown): T }): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(5000) });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof body === 'object' && body && 'code' in body ? String(body.code) : 'internal_error';
    throw new ApiError(response.status, code);
  }
  return schema.parse(body);
}

export async function getProducts(query: ProductListQuery): Promise<ProductList> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');
  const params = new URLSearchParams({ locale: query.locale });
  if (query.category) params.set('category', query.category);
  if (query.brand) params.set('brand', query.brand);
  return request(`/v1/products?${params}`, productListSchema);
}

// Devuelve null si el producto no existe (la página responde 404).
export async function getProduct(slug: string, locale: Locale): Promise<ProductDetail | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog', `product:${slug}`);
  try {
    return await request(`/v1/products/${encodeURIComponent(slug)}?locale=${locale}`, productDetailSchema);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

export async function getBrands(): Promise<BrandList> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');
  return request('/v1/brands', brandListSchema);
}

export async function getCategories(): Promise<CategoryList> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');
  return request('/v1/categories', categoryListSchema);
}

export async function getCredits(): Promise<CreditList> {
  'use cache';
  cacheLife('hours');
  cacheTag('credits');
  return request('/v1/credits', creditListSchema);
}

// Estado en vivo (sin caché). Devuelve null si la API no contesta.
export async function getHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${API_URL}/health`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    const parsed = healthResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
