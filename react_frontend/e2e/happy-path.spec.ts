import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IGS_FIXTURE = path.resolve(__dirname, '../../igs/ExtrudeSrf.igs');

test('upload, calculate, and export a real lattice end to end', async ({ page }) => {
  await page.goto('/tool');

  await page.locator('input[type="file"]').setInputFiles(IGS_FIXTURE);

  const exportButton = page.getByRole('button', { name: 'Export Lattice' });
  await expect(exportButton).toBeDisabled();

  await page.getByRole('button', { name: 'Make Lattice' }).click();

  // The calculation overlay (role="alertdialog") appears, then must
  // disappear once the real DLL finishes — generous timeouts, this is a
  // real native calculation against the real backend, not a mock.
  await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('alertdialog')).toBeHidden({ timeout: 30_000 });

  await expect(exportButton).toBeEnabled();

  // Scoped to .first(): the tool page also renders a second, smaller canvas
  // for the tile live preview (TileMenu); the main viewer canvas (ViewerScene)
  // mounts first in DOM order.
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);
});
