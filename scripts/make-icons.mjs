// Renders the app icon to PNGs with Playwright's Chromium: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';

const lit = { 0: '#ff3d6e', 2: '#4fb8e8', 5: '#ff6a3d', 6: '#4fb8e8', 8: '#ff3d6e', 10: '#4fb8e8', 13: '#ff6a3d', 14: '#4fb8e8' };
const cells = Array.from({ length: 16 }, (_, i) => {
  const x = 72 + (i % 4) * 96;
  const y = 72 + Math.floor(i / 4) * 96;
  return `<rect x="${x}" y="${y}" width="80" height="80" rx="16" fill="${lit[i] ?? '#2c2c36'}"/>`;
}).join('');
const svg = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" fill="#16161a"/>${cells}</svg>`;

const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg(size)}</body></html>`);
  await page.screenshot({ path: `public/icon-${size}.png` });
  await page.close();
}
await browser.close();
