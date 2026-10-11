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

/** Drawn note parts that stick out of the bar they belong to (VexFlow draws each stave, then its notes). */
const strayNotes = (page: Page) =>
  page.getByTestId('notation').evaluate((root) => {
    const out: string[] = [];
    let bar = 0;
    let [left, right] = [0, 0];
    for (const g of root.querySelectorAll<SVGGElement>('g.vf-stave, g.vf-stavenote')) {
      if (g.classList.contains('vf-stave')) {
        const b = g.getBBox();
        bar += 1;
        [left, right] = [b.x, b.x + b.width];
        continue;
      }
      // Only drawn glyphs and lines: VexFlow also adds an invisible hit-area rect that can start at x≈0.
      for (const ink of g.querySelectorAll<SVGGraphicsElement>('text, path')) {
        const b = ink.getBBox();
        if (b.x < left || b.x + b.width > right) {
          out.push(`bar ${bar}: ${ink.tagName} at ${Math.round(b.x)}..${Math.round(b.x + b.width)}, bar is ${Math.round(left)}..${Math.round(right)}`);
        }
      }
    }
    return out;
  });

test('notation keeps every note inside its own bar @desktop', async ({ page }) => {
  await openMore(page, 'Notation');
  const notes = page.getByTestId('notation').locator('svg .vf-stavenote');
  await expect(notes.first()).toBeVisible();
  expect(await strayNotes(page)).toEqual([]);
  await page.getByRole('button', { name: 'Pattern' }).click();
  await page.getByRole('menuitem', { name: /^B · / }).click();
  await expect(page.getByRole('heading', { name: /Pattern B/ })).toBeVisible();
  await expect(notes.first()).toBeVisible();
  expect(await strayNotes(page)).toEqual([]);
});

test('notation fills a desktop screen @desktop', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop-chromium', 'phones keep the 1× staff');
  await openMore(page, 'Notation');
  const svg = page.getByTestId('notation').locator('svg');
  await expect(svg.locator('.vf-stavenote').first()).toBeVisible();
  expect((await svg.boundingBox())!.width).toBeGreaterThan(0.9 * page.viewportSize()!.width);
  // A 5-line staff is 40 units tall at 1×.
  expect((await svg.locator('.vf-stave').first().boundingBox())!.height).toBeGreaterThanOrEqual(80);
});

test('tapping a bar in notation opens it in the grid @desktop', async ({ page }) => {
  await openMore(page, 'Notation');
  const second = page.getByTestId('notation').locator('svg .vf-stave').nth(1);
  await expect(second).toBeVisible();
  const box = (await second.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('button', { name: 'Bar 2' })).toHaveAttribute('aria-current', 'true');
});

test('project actions work from the Projects sheet @desktop', async ({ page }) => {
  await openMore(page, 'Projects…');
  await page.getByRole('button', { name: 'More for Demo groove' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click({ timeout: 3000 });
  await expect(page.getByRole('button', { name: /^More for / })).toHaveCount(2);
});

test('project rows centre their name and date @desktop', async ({ page }) => {
  await openMore(page, 'Projects…');
  const row = page.getByRole('dialog', { name: 'Projects' }).locator('li').first().getByRole('button').first();
  // Measure the rendered text, not the (possibly stretched) element boxes around it.
  const offsets = await row.evaluate((button) => {
    const middle = (r: DOMRect) => r.top + r.height / 2;
    const rowMiddle = middle(button.getBoundingClientRect());
    return [...button.children].map((child) => {
      const range = document.createRange();
      range.selectNodeContents(child);
      return Math.abs(middle(range.getBoundingClientRect()) - rowMiddle);
    });
  });
  expect(offsets).toHaveLength(2);
  for (const off of offsets) expect(off).toBeLessThanOrEqual(1.5);
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

test('keeps playing when the tab is hidden @desktop', async ({ page }) => {
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
});

test.describe('portrait phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('asks to rotate', async ({ page }) => {
    await expect(page.getByTestId('rotate-overlay')).toBeVisible();
  });
});
