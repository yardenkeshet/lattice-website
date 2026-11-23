import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, type Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IGS_FIXTURE = path.resolve(__dirname, '../../samples/igs/ExtrudeSrf.igs');

type SentCalc = { args: { nt1: number }; tolerance: number; silent?: boolean };

/** Records every Socket.IO `calculate` event the page sends (frames look like `42["calculate",{...}]`). */
function recordCalculateEvents(page: Page): SentCalc[] {
  const sent: SentCalc[] = [];
  page.on('websocket', ws => {
    ws.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string' || !payload.startsWith('42')) return;
      try {
        const [name, data] = JSON.parse(payload.slice(2));
        if (name === 'calculate') sent.push(data);
      } catch { /* not a JSON event frame */ }
    });
  });
  return sent;
}

async function setFineness(page: Page, value: number) {
  const badge = page.getByLabel('Tessellation Fineness value');
  await badge.fill(String(value));
  await badge.press('Enter');   // badge Enter = commit, same as releasing the slider
}

test('releasing the fineness slider recalculates the shown lattice with its own settings', async ({ page }) => {
  const sent = recordCalculateEvents(page);
  const realCalcs = () => sent.filter(c => !c.silent);

  await page.goto('/tool');
  await page.locator('input[type="file"]').setInputFiles(IGS_FIXTURE);
  await page.getByRole('button', { name: 'Make Lattice' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('alertdialog')).toBeHidden({ timeout: 30_000 });

  expect(realCalcs()).toHaveLength(1);
  expect(realCalcs()[0].tolerance).toBe(20);       // page always starts at 20
  const shownNt1 = realCalcs()[0].args.nt1;

  // An unsaved edit to another setting must NOT be picked up by the auto-recalc.
  const nt1Input = page.getByLabel('X tiles');
  await nt1Input.fill(String(shownNt1 === 5 ? 4 : 5));
  await nt1Input.press('Tab');

  await page.getByRole('button', { name: /Viewer Settings/ }).click();
  await setFineness(page, 60);

  await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('alertdialog')).toBeHidden({ timeout: 30_000 });
  expect(realCalcs()).toHaveLength(2);
  expect(realCalcs()[1].tolerance).toBe(60);
  expect(realCalcs()[1].args.nt1).toBe(shownNt1);  // the shown lattice's settings, not the edit

  // Same value again → no recalculation.
  await setFineness(page, 60);
  await page.waitForTimeout(1500);
  expect(realCalcs()).toHaveLength(2);
});

test('with no lattice on screen, releasing the slider only refreshes previews', async ({ page }) => {
  const sent = recordCalculateEvents(page);

  await page.goto('/tool');
  await page.locator('input[type="file"]').setInputFiles(IGS_FIXTURE);
  await expect.poll(() => sent.length, { timeout: 10_000 }).toBeGreaterThan(0);  // initial macro preview

  await page.getByRole('button', { name: /Viewer Settings/ }).click();
  await setFineness(page, 40);

  await expect.poll(() => sent.some(c => c.silent && c.tolerance === 40), { timeout: 10_000 }).toBe(true);
  expect(sent.filter(c => !c.silent)).toHaveLength(0);
  await expect(page.getByRole('alertdialog')).toBeHidden();
});
