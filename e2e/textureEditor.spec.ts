import { expect, test } from '@playwright/test';
import { fakeMojang, samplePack } from './fakeMojang';

test.beforeEach(async ({ page }) => {
  await fakeMojang(page);
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'e2e-pack.zip', mimeType: 'application/zip', buffer: await samplePack() });
  await page.getByRole('button', { name: 'Open pack' }).click();
  await page.getByRole('button', { name: 'Textures', exact: true }).click();
  await page.getByTitle('assets/minecraft/textures/item/apple.png', { exact: true }).click();
  await page.getByTitle('Edit right here').click();
  await expect(page.getByText('Edit texture')).toBeVisible();
});

test('replaces a colour, paints a rectangle on a new layer and saves', async ({ page }) => {
  // the apple is one colour: it is the current colour once the editor is open
  await page.getByText('Replace colour').click();
  await page.getByRole('button', { name: '← current colour' }).first().click();
  const hex = page.getByLabel('Colour as hex');
  await hex.fill('#ff0000');
  await page.getByRole('button', { name: '← current colour' }).nth(1).click();
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.getByText('256 pixels changed.')).toBeVisible();

  await page.getByRole('button', { name: '+ Layer' }).click();
  await expect(page.getByText('2 layers')).toBeVisible();
  await hex.fill('#0000ff');
  await page.getByRole('button', { name: 'Rectangle' }).click();
  const canvas = page.getByLabel('Texture', { exact: true });
  const box = (await canvas.boundingBox())!;
  const at = (x: number, y: number) => [box.x + ((x + 0.5) * box.width) / 16, box.y + ((y + 0.5) * box.height) / 16] as const;
  await page.mouse.move(...at(2, 2));
  await page.mouse.down();
  await page.mouse.move(...at(8, 6), { steps: 4 });
  await page.mouse.up();
  // the new colour is now among the texture's colours
  await expect(page.getByTitle('#0000ff · 100%').first()).toBeVisible();

  await page.getByRole('button', { name: '✓ Save' }).click();
  await expect(page.getByText('✓ 1 change')).toBeVisible();
});

test('selects, copies and pastes into a new layer', async ({ page }) => {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.keyboard.press('Control+A');
  await expect(page.getByText('Selection 16×16')).toBeVisible();
  await page.keyboard.press('Control+C');
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await expect(page.getByText('2 layers')).toBeVisible();
  await expect(page.getByRole('option', { name: /Pasted/ })).toBeVisible();
  await page.keyboard.press('Control+Z');
  await expect(page.getByText('2 layers')).toBeHidden();
});
