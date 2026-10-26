import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import type { Snapshot } from '../../src/lib/types';

const password = 'Progress-password-123!';

test('guests can skip or replay the tutorial, explore progression and find the creator support link', async ({
  page,
}) => {
  await page.goto('/');
  const guide = page.getByRole('complementary', { name: 'Didacticiel' });
  await expect(guide).toBeVisible();
  await page.getByRole('button', { name: 'Masquer le didacticiel' }).click();
  await page.reload();
  await expect(guide).toHaveCount(0);
  await page.getByRole('button', { name: 'Succès & objectifs', exact: true }).click();
  await page.getByRole('tab', { name: 'Objectifs', exact: true }).click();
  await expect(page.locator('.objective-card')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Suivre cet objectif' }).first()).toBeDisabled();
  await page.getByRole('button', { name: 'Rejouer le didacticiel' }).click();
  await expect(guide).toBeVisible();
  await page.getByRole('button', { name: 'Sponsors', exact: true }).click();
  const support = page.getByRole('link', { name: /Soutenir Loris/ });
  await expect(support).toHaveAttribute('href', 'https://buymeacoffee.com/LorisDc');
  await expect(support).toHaveAttribute('target', '_blank');
  await page.setViewportSize({ width: 390, height: 844 });
  await support.scrollIntoViewIfNeeded();
  await expect(support).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('progression, cosmetic equipment, offline objectives and targeted frontier attacks work through the UI', async ({
  page,
  playwright,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const response = await page.request.post('/api/game', {
    data: { action: 'signup', username: 'ProgressExplorer', password, color: '#39a5c5' },
  });
  expect(response.ok()).toBeTruthy();
  const initial = (await response.json()) as Snapshot;
  const userId = initial.player!.id;
  expect(initial.progression!.unlocks).toHaveLength(0);
  expect(
    (
      await page.request.post('/api/game', {
        data: { action: 'equip-cosmetic', cosmeticId: 'border-double' },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post('/api/game', {
        data: { action: 'tutorial', step: 999, dismissed: false },
      })
    ).status(),
  ).toBe(400);
  for (const [countryId, amount] of [
    ['012', 50],
    ['638', 1],
    ['480', 1],
  ] as const)
    expect(
      (
        await page.request.post('/api/game', { data: { action: 'contribute', countryId, amount } })
      ).ok(),
    ).toBeTruthy();
  const rival = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const third = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const rivalWorld = (await rival
    .post('/api/game', { data: { action: 'signup', username: 'FrontierDefender', password } })
    .then((r) => r.json())) as Snapshot;
  await rival.post('/api/game', { data: { action: 'contribute', countryId: '434', amount: 20 } });
  await third.post('/api/game', {
    data: { action: 'signup', username: 'FrontierThird', password },
  });
  await third.post('/api/game', { data: { action: 'contribute', countryId: '434', amount: 15 } });
  await page.goto('/?country=434');
  const panel = page.getByRole('complementary', { name: 'Conquête de Libye' });
  await panel.getByRole('tab', { name: 'Attaquer', exact: true }).click();
  await expect(page.getByLabel('Pays de départ')).toHaveValue('012');
  await page.getByLabel('Rival ciblé').selectOption(rivalWorld.player!.id);
  await page.getByLabel('Troupes à envoyer').fill('30');
  await expect(page.getByLabel('Résultat prévu')).toContainText('40 Influence brûlée');
  await expect(page.getByLabel('Résultat prévu')).toContainText(
    'FrontierThird serait en tête avec 15',
  );
  mkdirSync('artifacts', { recursive: true });
  await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await page.screenshot({ path: 'artifacts/frontier-attack.png' });
  await page.getByRole('button', { name: 'Envoyer 30 troupes' }).click();
  await expect
    .poll(async () => {
      const world = (await page.request.get('/api/game').then((r) => r.json())) as Snapshot;
      return world.territories.find((t) => t.id === '434')?.scores.find((c) => c.id === userId)
        ?.score;
    })
    .toBe(10);
  let world = (await page.request.get('/api/game').then((r) => r.json())) as Snapshot;
  expect(world.territories.find((t) => t.id === '012')!.owner!.score).toBe(20);
  expect(world.territories.find((t) => t.id === '434')!.owner!.name).toBe('FrontierThird');
  expect(world.player!.wallet).toBe(48);
  expect(world.progression!.metrics.spent).toBe(52);
  await page.getByRole('button', { name: 'Succès & objectifs', exact: true }).click();
  await expect(page.locator('.achievement-card.earned')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Apparence', exact: true }).click();
  await page
    .locator('.cosmetic-card')
    .filter({ has: page.getByRole('heading', { name: 'Signal', exact: true }) })
    .getByRole('button', { name: 'Équiper' })
    .click();
  await page.getByRole('button', { name: 'Titres', exact: true }).click();
  await page
    .locator('.cosmetic-card')
    .filter({ has: page.getByRole('heading', { name: 'Pionnier', exact: true }) })
    .getByRole('button', { name: 'Équiper' })
    .click();
  await page.getByRole('tab', { name: 'Objectifs', exact: true }).click();
  const mission = page.locator('.objective-card').filter({ hasText: 'L’océan en partage' });
  await mission.getByRole('button', { name: 'Suivre cet objectif' }).click();
  await expect(mission).toContainText('Objectif suivi');
  await expect
    .poll(
      async () =>
        ((await page.request.get('/api/game').then((r) => r.json())) as Snapshot).progression!
          .tutorial.step,
    )
    .toBe(4);
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Didacticiel' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ouvrir mon profil' })).toHaveClass(/frame-signal/);
  const path = process.env.E2E_DATABASE_PATH!;
  expect(path).toMatch(/^\.\/data\/test-\d+\.sqlite$/);
  const db = new DatabaseSync(path);
  const earlier = Date.now() - 3600001;
  db.prepare('UPDATE player_objectives SET started_at=? WHERE user_id=?').run(earlier, userId);
  db.prepare(
    'UPDATE ownership_periods SET starts_at=? WHERE camp_id=? AND country_id IN (?,?) AND ends_at IS NULL',
  ).run(earlier, userId, '638', '480');
  db.close();
  world = (await page.request.get('/api/game').then((r) => r.json())) as Snapshot;
  expect(world.progression!.unlocks.some((u) => u.id === 'goal:mascarene')).toBe(true);
  await page.getByRole('button', { name: 'Succès & objectifs', exact: true }).click();
  await page.getByRole('tab', { name: 'Objectifs', exact: true }).click();
  await expect(
    page.locator('.objective-card').filter({ hasText: 'L’océan en partage' }),
  ).toContainText('ACCOMPLI');
  await page
    .getByRole('dialog')
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await page.screenshot({ path: 'artifacts/progression-objectives.png' });
  await page.getByRole('tab', { name: 'Apparence', exact: true }).click();
  await page.screenshot({ path: 'artifacts/progression-appearance.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/progression-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('tab', { name: 'Attaquer', exact: true }).click();
  await page.locator('.border-attack-panel').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.screenshot({ path: 'artifacts/frontier-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
  await rival.dispose();
  await third.dispose();
});
