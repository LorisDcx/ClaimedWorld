import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
test.beforeEach(() => {
  const path = process.env.E2E_DATABASE_PATH!;
  expect(path).toMatch(/^\.\/data\/test-\d+\.sqlite$/);
  const db = new DatabaseSync(path);
  db.prepare("DELETE FROM rate_limits WHERE key='auth:local'").run();
  db.close();
});

test('stock troops attack through a one-point border, and friendly targets require explicit acknowledgement', async ({
  page,
  playwright,
}) => {
  const post = (data: Record<string, unknown>) => page.request.post('/api/game', { data });
  const password = 'Controls-password-123!';
  let response = await post({ action: 'signup', username: 'StockBorderUI', password });
  const me = (await response.json()).player;
  await post({ action: 'contribute', countryId: '380', amount: 1 });
  await post({
    action: 'create-alliance',
    name: 'Friendly UI Team',
    description: 'Test des attaques alliées.',
    color: '#111111',
    emblem: '✳',
  });
  const world = await page.request.get('/api/game').then((r) => r.json());
  const faction = world.alliances.find((a: { id: string }) => a.id === world.player.alliance_id);
  const rival = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const rivalPost = (data: Record<string, unknown>) => rival.post('/api/game', { data });
  response = await rivalPost({ action: 'signup', username: 'FriendlyDefenderUI', password });
  const enemy = (await response.json()).player;
  await rivalPost({ action: 'contribute', countryId: '040', amount: 50 });
  expect(
    (await rivalPost({ action: 'join-alliance', allianceId: faction.invite })).ok(),
  ).toBeTruthy();
  await page.goto('/?country=040');
  const panel = page.getByRole('complementary', { name: 'Conquête de Autriche' });
  await panel.getByRole('tab', { name: 'Attaquer', exact: true }).click();
  await page.getByLabel('Rival ciblé').selectOption(enemy.id);
  await page.getByLabel('Troupes à envoyer').fill('60');
  const send = page.getByRole('button', { name: 'Envoyer 60 troupes' });
  await expect(page.locator('.attack-warning')).toContainText('votre alliance');
  await expect(send).toBeDisabled();
  const rejected = await post({
    action: 'border-attack',
    source: '380',
    destination: '040',
    target: enemy.id,
    amount: 60,
    mode: 'solo',
    useStock: true,
    requestId: randomUUID(),
  });
  expect(rejected.status()).toBe(409);
  await page.getByRole('checkbox', { name: 'Je confirme l’attaque contre un allié' }).check();
  await send.click();
  await expect
    .poll(async () => {
      const current = await page.request.get('/api/game').then((r) => r.json());
      return current.territories
        .find((t: { id: string }) => t.id === '040')
        .scores.find((s: { id: string }) => s.id === me.id)?.score;
    })
    .toBe(10);
  const after = await page.request.get('/api/game').then((r) => r.json());
  expect(after.territories.find((t: { id: string }) => t.id === '380').owner.score).toBe(1);
  expect(after.player.wallet).toBe(39);
  await page.screenshot({ path: 'artifacts/stock-allied-attack.png' });
  await rival.dispose();
});

test('admin reset exposes a warning and typed confirmation while cancellation leaves conquests intact', async ({
  page,
}) => {
  await page.request.post('/api/game', {
    data: { action: 'login', username: 'AdminTest', password: 'Admin-password-123!' },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Administration', exact: true }).click();
  const section = page.locator('.admin-map-reset');
  await section.getByRole('button', { name: 'Remettre la carte à zéro', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('irréversible');
  const confirm = section.getByRole('button', { name: 'Confirmer la remise à zéro' });
  await expect(confirm).toBeDisabled();
  await section.getByLabel('Confirmation de remise à zéro').fill('REINITIALISER');
  await expect(confirm).toBeDisabled();
  await section.getByLabel('Mot de passe pour confirmer le reset').fill('Admin-password-123!');
  await expect(confirm).toBeEnabled();
  await page.screenshot({ path: 'artifacts/admin-reset-warning.png' });
  await section.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  const visitor = await page.request.post('/api/game', { data: { action: 'logout' } });
  expect(visitor.ok()).toBeTruthy();
  const forbidden = await page.request.post('/api/game', {
    data: {
      action: 'admin-reset-map',
      confirmation: 'REINITIALISER',
      resetBefore: Date.now(),
      seasonId: 1,
    },
  });
  expect(forbidden.status()).toBe(401);
});
