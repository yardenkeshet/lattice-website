import { test, expect } from '@playwright/test';

const BACKEND_URL = 'http://localhost:5003';

test('viewlog and viewfulllog render and cross-navigate correctly', async ({ page }) => {
  await page.goto(`${BACKEND_URL}/viewlog`);
  await expect(page.locator('h1')).toContainText('Live');
  await expect(page.getByText('Full detail →')).toBeVisible();

  await page.getByText('Full detail →').click();
  await expect(page).toHaveURL(`${BACKEND_URL}/viewfulllog`);
  await expect(page.locator('h1')).toContainText('Full Detail');
  await expect(page.getByText('← Surface view')).toBeVisible();

  await page.getByText('← Surface view').click();
  await expect(page).toHaveURL(`${BACKEND_URL}/viewlog`);
  await expect(page.locator('h1')).toContainText('Live');
});
