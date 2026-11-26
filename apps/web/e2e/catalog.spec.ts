import { en, es, expect, test, waitForApp } from './fixtures';

const API = 'http://127.0.0.1:4000';

// Filtros del catálogo: la categoría Tacos (cleat) tiene su chip con conteo,
// filtra solo los tacos y sobrevive al cambio de idioma por la URL.

for (const { code, messages } of [
  { code: 'es', messages: es },
  { code: 'en', messages: en },
] as const) {
  test(`catalog /${code}: the cleats chip filters to cleats only`, async ({ page, request }) => {
    // La ropa puede no tener prendas publicadas todavía (el seed la oculta
    // hasta que llegan sus modelos 3D): se pregunta a la API.
    const apparel = await request.get(`${API}/v1/products?category=apparel`);
    const hasApparel = ((await apparel.json()) as { items: unknown[] }).items.length > 0;
    await page.goto(`/${code}/catalog`);
    await waitForApp(page);
    const categories = page.getByRole('list', { name: messages.Catalog.categoryLabel });
    const chip = categories.getByRole('link', { name: new RegExp(`^${messages.Catalog.category.cleat}\\s*\\d+$`) });
    await expect(chip).toBeVisible();
    // Orden: Todo, Sneakers, Tacos, Ropa y Balones. Una categoría sin
    // productos (la ropa mientras no hay prendas publicadas) pasa al final
    // con "Próximamente".
    const labels = (await categories.getByRole('listitem').allTextContents()).map((label) => label.replace(/\d+/g, '').replace(/\s+/g, ' ').trim());
    const { allCategories, category, comingSoon } = messages.Catalog;
    if (hasApparel) {
      expect(labels.slice(0, 5)).toEqual([allCategories, category.sneaker, category.cleat, category.apparel, category.ball]);
    } else {
      expect(labels.slice(0, 4)).toEqual([allCategories, category.sneaker, category.cleat, category.ball]);
      expect(labels[4]).toContain(category.apparel);
      expect(labels[4]).toContain(comingSoon);
    }

    const count = Number((await chip.textContent())?.replace(/\D+/g, ''));
    expect(count).toBeGreaterThan(0);
    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/${code}/catalog\\?category=cleat$`));
    await expect(chip).toHaveAttribute('aria-current', 'true');
    const cards = page.getByRole('main').getByRole('article');
    await expect(cards).toHaveCount(count);
    await expect(cards.first()).toContainText('Adidas');
  });
}
