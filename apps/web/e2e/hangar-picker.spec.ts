import type { ProductCard } from '@airspace/contracts';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { es, expect, test, translate, waitForApp } from './fixtures';

// Pestaña "Zapatos" del Hangar: las tarjetas siguen su orden natural y no se
// mueven al elegir otro par (ni animación ni scroll); solo cambia "Puesto".
// Si los filtros dejan fuera el par puesto, sigue visible al final con una nota.

const h = es.Hangar;
const f = h.filters;
const API = 'http://127.0.0.1:4000';
// Par que lleva el maniquí al abrir (DEFAULT_PAIR en lib/avatar/outfit.ts).
const DEFAULT_PAIR = 'air-jordan-1';

// Orden natural de la lista (el de la vitrina): los calzables con modelo de
// un pie, como los elige la página del Hangar. El par por defecto no es el
// primero de la vitrina, así que el orden se lee de la API.
async function catalogOrder(request: APIRequestContext): Promise<string[]> {
  const response = await request.get(`${API}/v1/products?locale=es`);
  const { items } = (await response.json()) as { items: ProductCard[] };
  return items.filter((item) => ['sneaker', 'cleat'].includes(item.category) && item.model?.foot).map((item) => item.slug);
}

async function openPicker(page: Page) {
  await page.goto('/es/hangar');
  await waitForApp(page);
  await expect(page.getByRole('slider', { name: /Avatar/ })).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const tab = page.getByRole('tablist', { name: h.tabs.label }).getByRole('tab', { name: h.tabs.shoes, exact: true });
  await tab.click();
  const panel = page.getByRole('tabpanel', { name: h.tabs.shoes, exact: true });
  const picker = panel.getByRole('region', { name: h.pickerLabel });
  return { panel, picker, items: picker.locator('li') };
}

const keys = (items: Locator) => items.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.key ?? ''));

// Animaciones de script en curso en la lista (sin las transiciones CSS de
// hover y foco).
const scriptAnimations = (picker: Locator) =>
  picker.evaluate(
    (root) => root.getAnimations({ subtree: true }).filter((animation) => !(animation instanceof CSSTransition) && !(animation instanceof CSSAnimation)).length,
  );

test('choosing a pair keeps every card in place, the panel does not scroll, and focus stays on the card', async ({ page, request, consoleErrors }) => {
  const { panel, picker, items } = await openPicker(page);
  const natural = await catalogOrder(request);
  // Al cargar, la lista va en su orden natural con el par por defecto puesto.
  await expect.poll(() => keys(items)).toEqual(natural);
  const defaultCard = picker.locator(`li[data-key="${DEFAULT_PAIR}"]`);
  await expect(defaultCard.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  await expect(defaultCard).toContainText(f.worn);

  // Elegir uno de la mitad, con el panel desplazado: nada se mueve.
  const target = natural.find((key, index) => index >= 10 && key !== DEFAULT_PAIR)!;
  const card = picker.locator(`li[data-key="${target}"]`);
  await card.scrollIntoViewIfNeeded();
  await panel.evaluate((element) => (element.scrollTop += 40));
  const top = await panel.evaluate((element) => element.scrollTop);
  expect(top).toBeGreaterThan(0);
  await card.getByRole('button').click();
  expect(await scriptAnimations(picker)).toBe(0);
  await expect(card.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toContainText(f.worn);
  await expect(defaultCard.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  await expect(defaultCard).not.toContainText(f.worn);
  expect(await keys(items)).toEqual(natural);
  await page.waitForTimeout(700);
  await expect(panel).toHaveJSProperty('scrollTop', top);
  await expect(picker.locator('p[aria-live="polite"]')).toHaveText(translate('es', 'Hangar.filters.wornAnnounce', { name: (await card.innerText()).split('\n')[0]! }));

  // Con el teclado: Enter sobre otra tarjeta la elige y el foco sigue en ella.
  const next = natural.filter((key) => key !== target && key !== DEFAULT_PAIR)[5]!;
  const nextButton = picker.locator(`li[data-key="${next}"] button`);
  await nextButton.focus();
  await page.keyboard.press('Enter');
  await expect(nextButton).toHaveAttribute('aria-pressed', 'true');
  await expect(nextButton).toBeFocused();
  expect(await keys(items)).toEqual(natural);

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test('the worn pair stays visible at the end with a note when the filters leave it out', async ({ page, consoleErrors }) => {
  const { panel, items } = await openPicker(page);
  await panel.getByRole('searchbox', { name: f.search }).fill('zzzz');
  await expect(items).toHaveCount(1);
  const card = items.last().getByRole('button');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toContainText(f.outOfFilter);
  await expect(card).toHaveAccessibleDescription(f.outOfFilter);
  await panel.getByRole('button', { name: f.clear }).click();
  await expect(card).not.toContainText(f.outOfFilter);
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('choosing a pair keeps the row order and its scroll', async ({ page, request }) => {
    const { picker, items } = await openPicker(page);
    const natural = await catalogOrder(request);
    const target = natural.find((key, index) => index >= 4 && key !== DEFAULT_PAIR)!;
    const row = picker.locator('ul');
    await row.evaluate((list, key) => (list.scrollLeft = (list.querySelector(`li[data-key="${key}"]`) as HTMLElement).offsetLeft), target);
    const left = await row.evaluate((list) => list.scrollLeft);
    expect(left).toBeGreaterThan(0);
    await picker.locator(`li[data-key="${target}"] button`).click();
    await expect(picker.locator(`li[data-key="${target}"] button`)).toHaveAttribute('aria-pressed', 'true');
    expect(await keys(items)).toEqual(natural);
    // La fila no se mueve (ni por el imán al terminar).
    await page.waitForTimeout(800);
    await expect(row).toHaveJSProperty('scrollLeft', left);
  });
});
