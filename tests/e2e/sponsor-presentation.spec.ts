import { test, expect } from '@playwright/test';

test('country-sized logos remain inside land and expose a compact sponsor attribution', async ({
  page,
  request,
}) => {
  const state = await request.get('/api/game').then((response) => response.json());
  const sponsor = {
    id: 'qa-map-sponsor',
    name: 'Projet test',
    description: 'Une application pour découvrir le monde.',
    url: 'https://www.instagram.com/projettest/',
    initials: 'PT',
    color: '#841b3c',
    logo_url: '/sponsors/waant.webp',
    status: 'approved',
    amount: 500,
  };
  const world = {
    ...state,
    territories: state.territories.map((territory: { id: string }) => ({
      ...territory,
      sponsor: ['156', '262'].includes(territory.id)
        ? { ...sponsor, country_id: territory.id }
        : null,
    })),
  };
  await page.route('**/api/game', (route) => route.fulfill({ json: world }));
  await page.route('**/api/events', (route) => route.fulfill({ status: 204 }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?country=156');
  await page.getByRole('button', { name: 'Je connais déjà le jeu' }).click();
  const china = page.locator('.map-sponsor[data-territory="156"]');
  const djibouti = page.locator('.map-sponsor[data-territory="262"]');
  await expect(china.locator('image')).toBeVisible();
  expect(Number(await china.locator('image').getAttribute('width'))).toBeGreaterThan(
    Number(await djibouti.locator('image').getAttribute('width')) * 10,
  );
  await expect(page.locator('.map-sponsor rect')).toHaveCount(0);
  expect(await china.getAttribute('clip-path')).toMatch(/^url\(#.+-border-156\)$/);
  expect(await china.getAttribute('transform')).toBeNull();
  const original = (await china.boundingBox())!;
  await page.getByRole('button', { name: 'Zoom avant', exact: true }).click();
  await expect
    .poll(async () => (await china.boundingBox())!.width / original.width)
    .toBeCloseTo(1.4, 1);
  const attribution = page.getByRole('complementary', { name: 'Sponsor de Chine' });
  await expect(attribution).toContainText('Projet test');
  await expect(attribution).toContainText(sponsor.description);
  await expect(
    attribution.getByRole('link', {
      name: 'Instagram de Projet test (nouvel onglet)',
      exact: true,
    }),
  ).toHaveAttribute('href', sponsor.url);
  const standings = page.getByRole('complementary', { name: 'Conquête de Chine' });
  const assertSeparate = async () => {
    const info = (await attribution.boundingBox())!,
      ranking = (await standings.boundingBox())!;
    expect(info.y).toBeGreaterThanOrEqual(ranking.y + ranking.height);
    expect(info.x + info.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(info.y + info.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  };
  await assertSeparate();
  await page.screenshot({ path: 'artifacts/sponsor-map-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await assertSeparate();
  await page.screenshot({ path: 'artifacts/sponsor-map-mobile.png' });
  // Clicking through the logo selects its country, rather than navigating away.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Recentrer la carte' }).click();
  await page.locator('.country-path[aria-label="Djibouti"]').dispatchEvent('click');
  await expect(page.getByRole('complementary', { name: 'Sponsor de Djibouti' })).toBeVisible();
  await expect(attribution).toHaveCount(0);
});
