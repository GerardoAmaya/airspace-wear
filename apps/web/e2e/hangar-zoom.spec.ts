import type { CDPSession, Locator, Page } from '@playwright/test';
import { es, expect, test, waitForApp } from './fixtures';

// Zoom del escenario del Hangar 360°: pellizco con dos dedos en el teléfono
// (sin zoom de página), restablecer con el botón, el doble toque y al
// cambiar de encuadre; un dedo en vertical sigue desplazando la página. En
// escritorio, Ctrl + rueda y las teclas + y - acercan; la rueda sola desplaza.

const h = es.Hangar;

async function openHangar(page: Page) {
  await page.goto('/es/hangar');
  await waitForApp(page);
  const stage = page.getByRole('slider', { name: /Avatar/ });
  await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(stage).toHaveAttribute('data-zoom', '1.00');
  return stage;
}

const zoomOf = async (stage: Locator) => Number(await stage.getAttribute('data-zoom'));

async function center(stage: Locator) {
  const box = (await stage.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Pellizco con dos dedos (CDP): los dedos se separan de `from` a `to` píxeles.
async function pinch(cdp: CDPSession, at: { x: number; y: number }, from: number, to: number) {
  const points = (gap: number) => [
    { x: at.x - gap / 2, y: at.y, id: 0 },
    { x: at.x + gap / 2, y: at.y, id: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) });
  const steps = 12;
  for (let step = 1; step <= steps; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(from + ((to - from) * step) / steps) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function tap(cdp: CDPSession, at: { x: number; y: number }) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 0 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a two-finger pinch zooms the avatar, not the page, and resets', async ({ page, consoleErrors }) => {
    const stage = await openHangar(page);
    const reset = page.getByRole('button', { name: h.zoomReset });
    await expect(reset).toBeHidden();
    const cdp = await page.context().newCDPSession(page);
    const scrollBefore = await page.evaluate(() => window.scrollY);

    // Separar los dedos acerca; la página no se acerca ni se desplaza.
    await pinch(cdp, await center(stage), 60, 200);
    await expect.poll(() => zoomOf(stage)).toBeGreaterThan(2);
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    // El máximo del cuerpo entero es 3x.
    await pinch(cdp, await center(stage), 60, 400);
    await expect.poll(() => zoomOf(stage)).toBe(3);

    // El botón de restablecer aparece solo con zoom y vuelve a 1x.
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(stage).toHaveAttribute('data-zoom', '1.00');
    await expect(reset).toBeHidden();

    // Doble toque: vuelve a 1x.
    await pinch(cdp, await center(stage), 80, 200);
    await expect.poll(() => zoomOf(stage)).toBeGreaterThan(1.5);
    const point = await center(stage);
    await tap(cdp, point);
    await tap(cdp, point);
    await expect(stage).toHaveAttribute('data-zoom', '1.00');

    // Juntar los dedos aleja (nunca por debajo de 1x).
    await pinch(cdp, await center(stage), 80, 200);
    await expect.poll(() => zoomOf(stage)).toBeGreaterThan(1.5);
    await pinch(cdp, await center(stage), 240, 60);
    await expect(stage).toHaveAttribute('data-zoom', '1.00');

    // Cambiar de encuadre empieza sin zoom.
    await pinch(cdp, await center(stage), 80, 200);
    await expect.poll(() => zoomOf(stage)).toBeGreaterThan(1.5);
    await page.getByRole('group', { name: h.viewLabel }).getByRole('button', { name: h.views.feet }).click();
    await expect(stage).toHaveAttribute('data-zoom', '1.00');
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });

  test('a one-finger vertical swipe over the stage still scrolls the page', async ({ page }) => {
    const stage = await openHangar(page);
    const cdp = await page.context().newCDPSession(page);
    const at = await center(stage);
    const before = await page.evaluate(() => window.scrollY);
    await cdp.send('Input.synthesizeScrollGesture', {
      x: Math.round(at.x),
      y: Math.round(at.y),
      yDistance: -300,
      gestureSourceType: 'touch',
      speed: 800,
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 100);
    await expect(stage).toHaveAttribute('data-zoom', '1.00');
  });
});

test('desktop: Ctrl + wheel and the +/- keys zoom the stage, the plain wheel scrolls the page', async ({ page, consoleErrors }) => {
  const stage = await openHangar(page);
  const at = await center(stage);
  await page.mouse.move(at.x, at.y);

  // La rueda sola desplaza la página (sin zoom).
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  await expect(stage).toHaveAttribute('data-zoom', '1.00');
  await page.evaluate(() => window.scrollTo(0, 0));

  // Ctrl + rueda acerca el escenario, no la página.
  const scrollAt = await page.evaluate(() => window.scrollY);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(() => zoomOf(stage)).toBeGreaterThan(1.5);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollAt);

  // Teclas: 0 vuelve a 1x, + acerca y - aleja.
  await stage.focus();
  await page.keyboard.press('0');
  await expect(stage).toHaveAttribute('data-zoom', '1.00');
  await page.keyboard.press('+');
  await expect(stage).toHaveAttribute('data-zoom', '1.25');
  await page.keyboard.press('-');
  await expect(stage).toHaveAttribute('data-zoom', '1.00');
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
