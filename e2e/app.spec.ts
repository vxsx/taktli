import { expect, test, type Page } from '@playwright/test';

const cell = (page: Page, track: string, beat: number, c: number) =>
  page.locator(`[data-track="${track}"][data-beat="${beat}"][data-cell="${c}"]`);

async function openMore(page: Page, item: string) {
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-cell]').first()).toBeVisible();
});

test('loads the demo groove in landscape', async ({ page }) => {
  await expect(page.locator('[data-cell]')).toHaveCount(9 * 16);
  await expect(page.getByRole('button', { name: 'Pattern' })).toHaveText(/A/);
  await expect(cell(page, 'kick', 0, 0)).toHaveAttribute('data-on', '');
  await expect(page.getByTestId('rotate-overlay')).toBeHidden();
});

test('a tap toggles a note and survives a reload', async ({ page }) => {
  const c = cell(page, 'tom1', 1, 1);
  await c.tap();
  await expect(c).toHaveAttribute('data-on', '');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(cell(page, 'tom1', 1, 1)).toHaveAttribute('data-on', '');
});

test('a vertical drag sets the volume', async ({ page }) => {
  const c = cell(page, 'tom2', 2, 0);
  await c.scrollIntoViewIfNeeded(); // short phone viewports scroll the track list
  const box = (await c.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 15, { steps: 3 });
  await page.mouse.move(x, y - 30, { steps: 3 });
  await page.mouse.up();
  await expect(c).toHaveAttribute('aria-label', /volume 125$/);
});

test('copies a bar and pastes it into a new bar', async ({ page }) => {
  await page.getByRole('button', { name: 'Copy' }).click();
  await page.getByRole('button', { name: 'Add bar' }).click();
  await expect(page.getByRole('button', { name: 'Bar 3' })).toHaveAttribute('aria-current', 'true');
  await expect(cell(page, 'crash', 0, 0)).not.toHaveAttribute('data-on', '');
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await expect(cell(page, 'crash', 0, 0)).toHaveAttribute('data-on', '');
});

test('switches a beat to triplets', async ({ page }) => {
  await page.getByRole('button', { name: /^Beat 4:/ }).click();
  await page.getByRole('menuitem', { name: '8th triplets' }).click();
  await expect(page.locator('[data-track="snare"][data-beat="3"]')).toHaveCount(3);
});

test('builds a song', async ({ page }) => {
  await openMore(page, 'Song');
  const steps = page.getByRole('button', { name: /^Step \d+: pattern/ });
  await expect(steps).toHaveCount(2);
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByRole('menuitem', { name: 'Pattern B' }).click();
  await expect(steps).toHaveCount(3);
});

test('renders notation', async ({ page }) => {
  await openMore(page, 'Notation');
  const svg = page.getByTestId('notation').locator('svg');
  await expect(svg).toBeVisible();
  expect(await svg.locator('.vf-stavenote').count()).toBeGreaterThan(10);
});

test('shares a link that opens as a new project', async ({ page, context }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true });
  });
  await openMore(page, 'Share link');
  const url = await page.getByRole('dialog', { name: 'Share link' }).locator('input').inputValue();
  expect(url).toMatch(/#p=[A-Za-z0-9_-]+$/);
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByText(/Opened shared beat/)).toBeVisible();
  await expect(other.locator('[data-cell]')).toHaveCount(9 * 16);
  expect(new URL(other.url()).hash).toBe('');
});

test('exports MIDI', async ({ page }) => {
  const download = page.waitForEvent('download');
  await openMore(page, 'Export MIDI');
  expect((await download).suggestedFilename()).toBe('Demo-groove.mid');
});

test('plays and moves the playhead', async ({ page }) => {
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.locator('[data-cell][class*="playing"]').first()).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test.describe('portrait phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('asks to rotate', async ({ page }) => {
    await expect(page.getByTestId('rotate-overlay')).toBeVisible();
  });
});
