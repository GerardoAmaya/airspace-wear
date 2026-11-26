import boardEn from '../messages/home/board.en.json' with { type: 'json' };
import boardEs from '../messages/home/board.es.json' with { type: 'json' };
import { expect, test, waitForApp } from './fixtures';

// "Destacados" de la home: seis tarjetas del catálogo en el orden de vitrina,
// botón al catálogo completo y paso a la ficha con la transición de la
// tarjeta (ViewTransition), con toque y con teclado.

const FEATURED = ['jordan-4-travis-scott', 'nike-dunk-high-hawaii', 'adidas-prophere', 'adidas-gazelle', 'nike-air-uptempo', 'jordan-4-university-blue'];

for (const { code, messages } of [
  { code: 'es', messages: boardEs },
  { code: 'en', messages: boardEn },
] as const) {
  test(`featured /${code}: six cards in showcase order and a catalog button`, async ({ page }) => {
    await page.goto(`/${code}`);
    await waitForApp(page);
    const section = page.locator('#catalogo');
    await expect(section.getByRole('heading', { level: 2, name: messages.HomeBoard.title })).toBeAttached();

    const cards = section.getByRole('listitem').getByRole('link');
    await expect(cards).toHaveCount(FEATURED.length);
    const hrefs = await cards.evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname));
    expect(hrefs).toEqual(FEATURED.map((slug) => `/${code}/products/${slug}`));

    // El conteo del botón sale de la API (no está escrito en el código).
    const cta = section.getByRole('link', { name: messages.HomeBoard.cta });
    await expect(cta).toHaveAttribute('href', `/${code}/catalog`);
    await expect(section.getByText(/^\d+ (productos|products)$/)).toBeVisible();
  });
}

test('tapping a featured card opens the product with the card morph', async ({ page }) => {
  // Cuenta las transiciones de vista que arranca React al navegar.
  await page.addInitScript(() => {
    const original = document.startViewTransition?.bind(document);
    (window as unknown as { __transitions: number }).__transitions = 0;
    if (original) {
      document.startViewTransition = ((...args: Parameters<typeof original>) => {
        (window as unknown as { __transitions: number }).__transitions += 1;
        return original(...args);
      }) as typeof document.startViewTransition;
    }
  });
  await page.goto('/es');
  await waitForApp(page);
  const card = page.locator('#catalogo').getByRole('listitem').getByRole('link').first();
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await expect(page).toHaveURL(/\/es\/products\/jordan-4-travis-scott$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __transitions: number }).__transitions)).toBeGreaterThan(0);
});

test('a featured card opens with the keyboard', async ({ page }) => {
  await page.goto('/es');
  await waitForApp(page);
  const card = page.locator('#catalogo').getByRole('listitem').getByRole('link').nth(1);
  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/es\/products\/nike-dunk-high-hawaii$/);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the featured header is static text', async ({ page }) => {
    await page.goto('/es');
    await waitForApp(page);
    const section = page.locator('#catalogo');
    await section.scrollIntoViewIfNeeded();
    const title = section.locator('h2 [data-scramble]');
    await expect(title).toHaveText(boardEs.HomeBoard.title);
    await expect(title).toHaveCSS('opacity', '1');
    await expect(section.locator('p [data-scramble]')).toHaveText('06 pares');
  });
});
