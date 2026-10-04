import { test, expect } from '@playwright/test';

test('clicking Make Lattice without an uploaded file shows a visible error', async ({ page }) => {
  await page.goto('/tool');
  await page.getByRole('button', { name: 'Make Lattice' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Please upload a 3D file first');
});
