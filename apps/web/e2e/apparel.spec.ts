import type { ProductCard } from '@airspace/contracts';
import type { APIRequestContext } from '@playwright/test';
import apparelEn from '../messages/home/apparel.en.json' with { type: 'json' };
import apparelEs from '../messages/home/apparel.es.json' with { type: 'json' };
import { en, es, expect, test, waitForApp } from './fixtures';

// Ropa (paso 4): chip "Ropa" del catálogo, tipos de prenda, sección "Ropa" de
// la home y ficha con tallas de letra. Las pruebas leen de la API cuántas
// prendas hay publicadas: sin ninguna (hoy, hasta que llegue la lista curada)
// comprueban que todo queda oculto o en "Próximamente"; con prendas,
// comprueban el flujo completo.

const API = 'http://127.0.0.1:4000';

async function publishedApparel(request: APIRequestContext, locale: 'es' | 'en'): Promise<ProductCard[]> {
  const response = await request.get(`${API}/v1/products?category=apparel&locale=${locale}`);
  return ((await response.json()) as { items: ProductCard[] }).items;
}

for (const { code, messages, home } of [
  { code: 'es', messages: es, home: apparelEs },
  { code: 'en', messages: en, home: apparelEn },
] as const) {
  test(`catalog /${code}: the apparel chip and its garment types`, async ({ page, request }) => {
    const apparel = await publishedApparel(request, code);
    await page.goto(`/${code}/catalog`);
    await waitForApp(page);
    const categories = page.getByRole('list', { name: messages.Catalog.categoryLabel });

    if (apparel.length === 0) {
      // Sin prendas: el chip no es enlace y dice "Próximamente".
      const soon = categories.getByText(messages.Catalog.category.apparel, { exact: false });
      await expect(soon).toContainText(messages.Catalog.comingSoon);
      await expect(categories.getByRole('link', { name: new RegExp(`^${messages.Catalog.category.apparel}`) })).toHaveCount(0);
      return;
    }

    const chip = categories.getByRole('link', { name: new RegExp(`^${messages.Catalog.category.apparel}\\s*\\d+$`) });
    await expect(chip).not.toContainText(messages.Catalog.comingSoon);
    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/${code}/catalog\\?category=apparel$`));
    const cards = page.getByRole('main').getByRole('article');
    await expect(cards).toHaveCount(apparel.length);

    // Tipos de prenda: solo con dos o más tipos; cada chip filtra el suyo.
    const types = [...new Set(apparel.map((item) => item.subcategory))];
    const typeList = page.getByRole('list', { name: messages.Catalog.subcategoryLabel });
    if (types.length < 2) {
      await expect(typeList).toHaveCount(0);
      return;
    }
    const first = types[0]!;
    await typeList.getByRole('link', { name: new RegExp(`^${messages.Catalog.subcategory[first]}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/${code}/catalog\\?category=apparel&subcategory=${first}$`));
    await expect(cards).toHaveCount(apparel.filter((item) => item.subcategory === first).length);
  });

  test(`home /${code}: the apparel section shows only with published apparel`, async ({ page, request }) => {
    const apparel = await publishedApparel(request, code);
    await page.goto(`/${code}`);
    await waitForApp(page);
    const section = page.locator('#ropa');

    if (apparel.length === 0) {
      await expect(page.locator('#catalogo')).toBeAttached();
      await expect(section).toHaveCount(0);
      return;
    }

    await expect(section.getByRole('heading', { level: 2, name: home.HomeApparel.title })).toBeAttached();
    // Va justo después de Destacados.
    expect(await page.locator('#catalogo + #ropa').count()).toBe(1);
    const cards = section.getByRole('listitem').getByRole('link');
    await expect(cards).toHaveCount(Math.min(6, apparel.length));
    const hrefs = await cards.evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname));
    expect(hrefs).toEqual(apparel.slice(0, 6).map((item) => `/${code}/products/${item.slug}`));
    const cta = section.getByRole('link', { name: home.HomeApparel.cta });
    await expect(cta).toHaveAttribute('href', `/${code}/catalog?category=apparel`);
  });

  test(`product /${code}: a garment with letter sizes shows S to XL`, async ({ page, request }) => {
    const apparel = await publishedApparel(request, code);
    const garment = apparel.find((item) => item.sizeRange?.system === 'ALPHA');
    test.skip(!garment, 'No hay prendas publicadas con tallas de letra.');
    await page.goto(`/${code}/products/${garment!.slug}`);
    await waitForApp(page);
    const picker = page.getByRole('group', { name: messages.Product.chooseSizeAlpha });
    await expect(picker).toBeVisible();
    const values = await picker.getByRole('radio').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    expect(values).toEqual(garment!.sizeRange!.min === 'S' && garment!.sizeRange!.max === 'XL' ? ['S', 'M', 'L', 'XL'] : expect.arrayContaining([garment!.sizeRange!.min]));
  });
}
