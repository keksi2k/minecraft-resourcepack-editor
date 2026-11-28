import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { fakeMojang, png, samplePack } from './fakeMojang';

test.beforeEach(async ({ page }) => {
  await fakeMojang(page);
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'e2e-pack.zip', mimeType: 'application/zip', buffer: await samplePack() });
  await page.getByRole('button', { name: 'Open pack' }).click();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
});

const zipOf = async (files: Record<string, string | Buffer>) => {
  const zip = new JSZip();
  for (const [path, data] of Object.entries(files)) zip.file(path, data);
  return zip.generateAsync({ type: 'nodebuffer' });
};

test('stacks another pack onto the open one', async ({ page }) => {
  await page.getByRole('button', { name: 'Stack packs' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add packs …' }).click();
  await (await chooser).setFiles({
    name: 'other.zip',
    mimeType: 'application/zip',
    buffer: await zipOf({
      'pack.mcmeta': JSON.stringify({ pack: { pack_format: 97, description: 'Other' } }),
      'assets/minecraft/textures/block/dirt.png': png(16, [10, 200, 10]),
      'assets/minecraft/lang/en_us.json': JSON.stringify({ 'block.minecraft.dirt': 'Stacked dirt' }),
    }),
  });
  await expect(page.getByText('other', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Stack into this pack \(2 files\)$/ }).click();
  await expect(page.getByText('The stack looks just like your pack already.')).toBeVisible();
  await page.getByRole('button', { name: 'Items', exact: true }).click();
  await expect(page.getByTitle(/minecraft:dirt$/)).toContainText('Stacked dirt');
});

test('shrinks the pack: junk goes, PNGs get smaller', async ({ page }) => {
  // put a badly compressed image and some junk into the pack by stacking them in
  await page.getByRole('button', { name: 'Stack packs' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add packs …' }).click();
  await (await chooser).setFiles({
    name: 'junk.zip',
    mimeType: 'application/zip',
    buffer: await zipOf({ 'assets/minecraft/textures/block/dirt.png': png(64, [120, 80, 40]), 'assets/minecraft/textures/block/dirt.psd': Buffer.alloc(5000, 1) }),
  });
  await page.getByRole('button', { name: /^Stack into this pack/ }).click();

  await page.getByRole('button', { name: 'Shrink pack' }).click();
  await expect(page.getByText('assets/minecraft/textures/block/dirt.psd')).toBeVisible();
  await page.getByRole('button', { name: 'Shrink', exact: true }).click();
  await expect(page.getByText(/smaller \(\d+ %\)/)).toBeVisible();
  await expect(page.getByText(/^Compress PNGs better: .+ → .+$/)).toBeVisible();
  await expect(page.getByText(/^Remove files the game never reads: 4\.9 KB → 0 B$/)).toBeVisible();
});
