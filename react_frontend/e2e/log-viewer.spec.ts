import { test, expect } from '@playwright/test';

const BACKEND_URL = 'http://localhost:5003';

test('viewlog renders the full-detail log viewer', async ({ page }) => {
  await page.goto(`${BACKEND_URL}/viewlog`);
  await expect(page.locator('h1')).toContainText('Full Detail');
  await expect(page.locator('.lvl-btn[data-level=DEBUG]')).not.toHaveClass(/\boff\b/);
});
