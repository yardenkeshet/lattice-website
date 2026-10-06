import { test, expect } from '@playwright/test';

test('home page loads with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page).toHaveTitle('Lattice Maker');

  expect(errors, `Console/page errors on home page: ${errors.join('; ')}`).toEqual([]);
});

test('tool page loads with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/tool');
  await expect(page.getByRole('button', { name: 'Make Lattice' })).toBeVisible();

  expect(errors, `Console/page errors on tool page: ${errors.join('; ')}`).toEqual([]);
});
