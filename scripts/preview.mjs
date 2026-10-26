import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await Promise.all([
  page.waitForResponse((r) => r.url().endsWith('/api/game')),
  page.goto('http://localhost:3000', { waitUntil: 'load' }),
]);
await page.screenshot({ path: 'artifacts/desktop.png' });
const world = await page.request.get('http://localhost:3000/api/game').then((r) => r.json());
const layout = await page.evaluate(() => {
  const header = document.querySelector('.topbar').getBoundingClientRect();
  const canvas = document.querySelector('.world-canvas').getBoundingClientRect();
  const svg = document.querySelector('.world-canvas svg').getBoundingClientRect();
  return {
    headerBottom: header.bottom,
    canvasTop: canvas.top,
    svgTop: svg.top,
    canvasLeft: canvas.left,
    svgLeft: svg.left,
    canvasWidth: canvas.width,
    svgWidth: svg.width,
    canvasBottom: canvas.bottom,
    viewportHeight: innerHeight,
  };
});
await page.locator('path.country-path[aria-label="Botswana"]').hover();
await page.locator('path.country-path[aria-label="Botswana"]').click();
await page.locator('.selection-name').filter({ hasText: 'Botswana' }).waitFor();
await page
  .locator('.map-geography')
  .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
console.log(
  'focus',
  await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    outline: getComputedStyle(document.activeElement).outline,
    focusVisible: document.activeElement?.matches(':focus-visible'),
  })),
);
await page.screenshot({ path: 'artifacts/country-selected.png' });
console.log(
  JSON.stringify({
    errors,
    layout,
    alliances: world.alliances.length,
    claimed: world.territories.filter((t) => t.owner).length,
    panels: await page.locator('.right-drawer,.map-tooltip').count(),
  }),
);
await page.setViewportSize({ width: 390, height: 844 });
await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/game')), page.reload()]);
await page.screenshot({ path: 'artifacts/mobile.png' });
console.log(
  'mobile overflow',
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
);
await browser.close();
