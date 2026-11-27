import { expect, test, type Page } from '@playwright/test';
import { fakeMojang } from './fakeMojang';

// a tablet: touch screen, no mouse hover
test.use({ hasTouch: true, viewport: { width: 1180, height: 820 } });

/** Real multi-touch through Chrome's input pipeline (Playwright's touchscreen has one finger only). */
async function touch(page: Page, steps: { type: 'touchStart' | 'touchMove' | 'touchEnd'; points: [number, number][] }[]) {
  const cdp = await page.context().newCDPSession(page);
  for (const s of steps) {
    await cdp.send('Input.dispatchTouchEvent', { type: s.type, touchPoints: s.points.map(([x, y], id) => ({ x, y, id })) });
  }
}

test('the texture editor zooms with two fingers and draws with one', async ({ page }) => {
  await fakeMojang(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Create new pack' }).click();
  await page.getByTitle(/minecraft:stone$/).click();
  await page.getByRole('button', { name: '✎ Edit' }).first().click();
  const canvas = page.locator('canvas.cursor-crosshair');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const zoom = page.locator('input[type=range]').first();
  const before = Number(await zoom.inputValue());

  // pinch out: zoom grows, nothing is drawn
  await touch(page, [
    { type: 'touchStart', points: [[cx - 20, cy]] },
    { type: 'touchStart', points: [[cx - 20, cy], [cx + 20, cy]] },
    { type: 'touchMove', points: [[cx - 40, cy], [cx + 40, cy]] },
    { type: 'touchMove', points: [[cx - 60, cy], [cx + 60, cy]] },
    { type: 'touchEnd', points: [] },
  ]);
  await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(before);
  await expect(page.getByRole('button', { name: '↶ Undo' })).toBeDisabled();

  // one finger draws
  const b2 = (await canvas.boundingBox())!;
  await page.touchscreen.tap(b2.x + 5, b2.y + 5);
  await expect(page.getByRole('button', { name: '↶ Undo' })).toBeEnabled();
});
