import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { fakeMojang, samplePack } from './fakeMojang';

test.beforeEach(async ({ page }) => {
  await fakeMojang(page);
  await page.goto('/');
});

async function openSamplePack(page: Page) {
  await page.locator('input[type=file]').first().setInputFiles({ name: 'e2e-pack.zip', mimeType: 'application/zip', buffer: await samplePack() });
  await page.getByRole('button', { name: 'Open pack' }).click();
  await expect(page.getByRole('button', { name: 'Items', exact: true })).toBeVisible();
}

test('creates a new pack and shows an item', async ({ page }) => {
  await page.getByRole('button', { name: 'Create new pack' }).click();
  await page.getByTitle(/minecraft:stone$/).click();
  await expect(page.getByRole('heading', { name: 'Stone' })).toBeVisible();
  await expect(page.getByText('minecraft:block/stone').first()).toBeVisible();
});

test('opens a pack, finds an item with the palette and exports the pack', async ({ page }) => {
  await openSamplePack(page);
  await expect(page.getByRole('button', { name: 'In pack (1)' })).toBeVisible();

  await page.keyboard.press('Control+K');
  await page.keyboard.type('dirt');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Dirt' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export pack' }).click();
  // the check dialog shows up only when it finds something
  const dialog = page.getByText('Pack check');
  if (await dialog.isVisible().catch(() => false)) await page.getByRole('button', { name: 'Export pack' }).last().click();
  const zip = await JSZip.loadAsync(await (await download).createReadStream().then(streamToBuffer));
  expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['pack.mcmeta', 'assets/minecraft/textures/block/stone.png']));
});

test('undoes and redoes a change with the keyboard', async ({ page }) => {
  await openSamplePack(page);
  await page.getByRole('button', { name: 'Texts', exact: true }).click();
  const field = page.locator('textarea').first();
  await field.fill('§aChanged by the test');
  await page.getByRole('button', { name: '✓ Save' }).click();
  const counter = page.getByText('✓ 1 change');
  await expect(counter).toBeVisible();

  await page.locator('h2').first().click();
  await page.keyboard.press('Control+Z');
  await expect(counter).toBeHidden();
  await page.keyboard.press('Control+Y');
  await expect(counter).toBeVisible();
});

test('draws the title screen and the font preview', async ({ page }) => {
  await page.getByRole('button', { name: 'Create new pack' }).click();
  await page.getByRole('button', { name: 'Scenes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Title screen' })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Font', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Glyph sheets' }).or(page.getByText('Glyph sheets'))).toBeVisible();
});

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}
