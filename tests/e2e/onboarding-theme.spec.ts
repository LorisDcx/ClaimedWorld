import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import type { Snapshot } from '../../src/lib/types';

const password = 'Onboarding-password-123!';
test.beforeEach(() => {
  const path = process.env.E2E_DATABASE_PATH!;
  expect(path).toMatch(/^\.\/data\/test-\d+\.sqlite$/);
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout=5000');
  db.prepare("DELETE FROM rate_limits WHERE key='auth:local'").run();
  db.close();
});

test('registration starts an optional guided visit that works with an empty stock', async ({
  page,
}) => {
  await page.goto('/');
  const guide = page.getByRole('complementary', { name: 'Didacticiel' });
  await expect(guide).toHaveCount(0);
  await page.getByRole('button', { name: 'Entrer dans le jeu', exact: true }).click();
  const signup = page.getByRole('dialog');
  await signup.getByLabel('Pseudonyme').fill('GuidedNewcomer');
  await signup.getByLabel('Mot de passe').fill(password);
  await expect(guide).toHaveCount(0);
  await signup.getByRole('button', { name: 'Créer mon compte gratuit' }).click();
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('Bienvenue');
  const initial = (await page.request.get('/api/game').then((r) => r.json())) as Snapshot;
  const db = new DatabaseSync(process.env.E2E_DATABASE_PATH!);
  db.exec('PRAGMA busy_timeout=5000');
  db.prepare('UPDATE users SET wallet=0 WHERE id=?').run(initial.player!.id);
  db.close();
  await page.reload();
  await expect(page.locator('.wallet strong')).toHaveText('0');
  await guide.getByRole('button', { name: 'Suivant', exact: true }).click();
  await expect(guide).toHaveAttribute('data-step', '1');
  await guide.getByRole('button', { name: 'Me montrer un pays' }).click();
  await expect(page.locator('.country-standings')).toBeVisible();
  await guide.getByRole('button', { name: 'Suivant', exact: true }).click();
  await expect(guide).toHaveAttribute('data-step', '2');
  await expect(page.getByLabel('Influence dans ce pays')).toBeVisible();
  await expect(page.locator('.standings-bid')).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await guide.getByRole('button', { name: 'Précédent' }).click();
  await expect(guide).toHaveAttribute('data-step', '1');
  await guide.getByRole('button', { name: 'Suivant', exact: true }).click();
  await guide.getByRole('button', { name: 'Suivant', exact: true }).click();
  await expect(guide).toContainText('votre rythme');
  await page.screenshot({ path: 'artifacts/tutorial-mobile.png' });
  await guide.getByRole('button', { name: 'Terminer la visite' }).click();
  await expect(guide).toHaveCount(0);
  const after = (await page.request.get('/api/game').then((r) => r.json())) as Snapshot;
  expect(after.progression!.metrics.spent).toBe(0);
  expect(after.player!.wallet).toBe(0);
  expect(after.territories.some((t) => t.scores.some((s) => s.id === initial.player!.id))).toBe(
    false,
  );
  await page.reload();
  await expect(guide).toHaveCount(0);
  await page.getByRole('button', { name: 'Succès & objectifs', exact: true }).click();
  await page.getByRole('button', { name: 'Rejouer le didacticiel' }).click();
  await expect(guide).toHaveAttribute('data-step', '0');
  await guide.getByRole('button', { name: 'Masquer le didacticiel' }).click();
  await page.reload();
  await expect(guide).toHaveCount(0);
});

test('country pane stakes any chosen amount and dark mode persists while keeping player and sponsor colors', async ({
  page,
}) => {
  const signup = await page.request.post('/api/game', {
    data: { action: 'signup', username: 'PaneInvestor', password, color: '#39a5c5' },
  });
  expect(signup.ok()).toBeTruthy();
  const initial = (await signup.json()) as Snapshot;
  await page.request.post('/api/game', { data: { action: 'tutorial', step: 4, dismissed: false } });
  await page.goto('/?country=554');
  const pane = page.getByRole('complementary', { name: /Conquête de Nouvelle-Zélande/ });
  await pane.getByLabel('Influence dans ce pays').fill('37');
  await expect(page.getByLabel('Influence à investir', { exact: true })).toHaveValue('37');
  await pane.getByRole('button', { name: 'Revendiquer · 37 Influence' }).click();
  await expect(pane.locator('.contender-title b')).toHaveText('37');
  await expect(page.locator('.wallet strong')).toHaveText('63');
  await pane.getByRole('button', { name: 'Choisir 10 Influence', exact: true }).click();
  await pane.getByRole('button', { name: 'Renforcer · 10 Influence' }).click();
  await expect(pane.locator('.contender-title b')).toHaveText('47');
  await expect(page.locator('.wallet strong')).toHaveText('53');
  const ownerBorder = page.locator(
    '.ownership-border[data-territory="554"] path[stroke-width="6"]',
  );
  const color = await ownerBorder.getAttribute('stroke');
  const sponsorLogo = page.locator('.map-sponsor image').first();
  const logo = await sponsorLogo.getAttribute('href');
  await page.getByRole('button', { name: 'Activer le mode sombre' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(9, 10, 12)',
  );
  await expect(page.locator('.country-path:not(.is-sponsored):not(.selected)').first()).toHaveCSS(
    'fill',
    'rgb(115, 118, 123)',
  );
  expect(await ownerBorder.getAttribute('stroke')).toBe(color);
  expect(await sponsorLogo.getAttribute('href')).toBe(logo);
  expect(color).toBe(initial.player!.color);
  await page.screenshot({ path: 'artifacts/dark-map-desktop.png' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Activer le mode clair' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'artifacts/dark-map-mobile.png' });
  await page.getByRole('button', { name: 'Activer le mode clair' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
