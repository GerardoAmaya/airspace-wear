import type { StylistRequest } from '@airspace/contracts';
import { expect, fulfillSse, mockStylist, stylistEn, stylistEs, test, waitForApp } from './fixtures';

// Estilista IA con la respuesta SSE simulada (route de Playwright): nunca se
// llama a la API real ni a Anthropic. Un caso feliz (texto en trozos,
// productos y fin) y un caso de error que vuelve al motor guionado.

const QUESTION = 'Busco algo para correr por la mañana';
// Slugs reales del catálogo (la web arma las tarjetas con sus propios datos).
const PICKS = [
  { slug: 'nike-pegasus-36', name: 'Nike Pegasus 36', match: 94, reason: 'Ligera y con buena amortiguación.' },
  { slug: 'new-balance-997', name: 'New Balance 997', match: 81, reason: 'Cómoda para todo el día.' },
];

test('streams the mocked reply and shows the recommended products', async ({ page, request }) => {
  // Nombres en español desde la API (el texto de la tarjeta sale del catálogo).
  const catalog = (await (await request.get('http://127.0.0.1:4000/v1/products?locale=es')).json()) as { items: { slug: string; name: string }[] };
  const names = PICKS.map((pick) => catalog.items.find((item) => item.slug === pick.slug)?.name ?? pick.name);

  const calls: StylistRequest[] = [];
  await mockStylist(page, async (route) => {
    const body = route.request().postDataJSON() as StylistRequest;
    calls.push(body);
    if (body.messages.at(-1)?.content !== QUESTION) {
      // Cualquier otra consulta (por ejemplo, el guion automático): sin IA.
      await fulfillSse(route, [{ type: 'error', code: 'unavailable' }]);
      return;
    }
    await fulfillSse(route, [
      { type: 'text', text: 'Para correr temprano te recomiendo las ' },
      { type: 'text', text: `[${names[0]}], ligeras y rápidas, ` },
      { type: 'text', text: `y como segunda opción las [${names[1]}].` },
      { type: 'products', items: PICKS.map(({ slug, match, reason }) => ({ slug, match, reason })) },
      { type: 'done' },
    ]);
  });

  await page.goto('/es');
  await waitForApp(page);
  const section = page.getByRole('region', { name: stylistEs.HomeStylist.title });
  await section.scrollIntoViewIfNeeded();

  const input = section.getByRole('textbox', { name: stylistEs.HomeStylist.controls.inputLabel });
  await input.fill(QUESTION);
  await input.press('Enter');

  const log = section.getByRole('log', { name: stylistEs.HomeStylist.console.logLabel });
  await expect(log).toContainText(QUESTION);
  await expect(log).toContainText(`Para correr temprano te recomiendo las ${names[0]}`);
  await expect(log).toContainText(`segunda opción las ${names[1]}.`);

  const cards = section.getByRole('list', { name: stylistEs.HomeStylist.card.listLabel }).getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) });
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByRole('heading', { level: 3 })).toHaveText(names[0]);
  await expect(cards.nth(0)).toContainText(PICKS[0].reason);
  await expect(cards.nth(1).getByRole('heading', { level: 3 })).toHaveText(names[1]);
  // El porcentaje termina en el valor recibido (cuenta animada).
  await expect(cards.nth(0).locator(`[data-match="${PICKS[0].match}"]`)).toHaveText(String(PICKS[0].match));

  // La región en vivo anuncia la respuesta final, con las recomendaciones.
  await expect(section.getByRole('status')).toContainText(names[0]);

  // El pedido cumple el contrato: idioma y la pregunta como último mensaje.
  const sent = calls.find((call) => call.messages.at(-1)?.content === QUESTION);
  expect(sent?.locale).toBe('es');
  expect(sent?.messages.at(-1)).toEqual({ role: 'user', content: QUESTION });
});

test('falls back to the scripted engine when the AI is unavailable', async ({ page }) => {
  let calls = 0;
  await mockStylist(page, async (route) => {
    calls += 1;
    await fulfillSse(route, [{ type: 'error', code: 'unavailable' }]);
  });

  await page.goto('/en');
  await waitForApp(page);
  const copy = stylistEn.HomeStylist;
  const section = page.getByRole('region', { name: copy.title });
  await section.scrollIntoViewIfNeeded();

  const input = section.getByRole('textbox', { name: copy.controls.inputLabel });
  await input.fill('Do you have anything for a wedding?');
  await input.press('Enter');

  // Respuesta fija del guion (en inglés), sin tarjetas.
  const log = section.getByRole('log', { name: copy.console.logLabel });
  const opening = copy.freeReply.split(' ').slice(0, 5).join(' ');
  await expect(log).toContainText(opening);
  await expect(log).toContainText(copy.freeReply.split(' ').slice(-4).join(' '));
  expect(calls).toBeGreaterThanOrEqual(1);

  // Tras la primera falta de disponibilidad, una idea sugerida usa el guion
  // sin volver a llamar a la API.
  const before = calls;
  const chip = section.getByRole('group', { name: copy.controls.suggestions }).getByRole('button').first();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(section.getByRole('list', { name: copy.card.listLabel }).getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) }).first()).toBeVisible();
  expect(calls).toBe(before);
});
