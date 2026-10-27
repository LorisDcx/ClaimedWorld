import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { emailCode, confirmEmailUI, testEmail } from './email-helpers';
import { hashPassword } from '../../src/lib/password';
test.beforeEach(() => {
  const location = process.env.E2E_DATABASE_PATH!;
  if (!/^\.\/data\/test-\d+\.sqlite$/.test(location)) throw new Error('Isolated database required');
  const db = new DatabaseSync(location);
  db.exec('DELETE FROM rate_limits');
  db.close();
});
test('email is mandatory, disposable addresses are rejected and a pending account cannot play', async ({
  page,
  playwright,
}) => {
  const data = { action: 'signup', username: 'EmailRequired', password: 'Carte-42' };
  let r = await page.request.post('/api/game', { data });
  expect(r.status()).toBe(400);
  for (const email of ['mail@yopmail.com', 'mail@mailinator.com', 'mail@sub.yopmail.fr']) {
    r = await page.request.post('/api/game', { data: { ...data, email } });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toContain('temporaires');
  }
  const email = testEmail('EmailRequired');
  r = await page.request.post('/api/game', { data: { ...data, email } });
  expect(r.status()).toBe(202);
  const pending = await r.json();
  expect(pending.verificationRequired).toBe(true);
  expect(pending).not.toHaveProperty('code');
  expect(pending).not.toHaveProperty('player');
  expect((await page.request.get('/api/game').then((r) => r.json())).player).toBeNull();
  r = await page.request.post('/api/game', {
    data: { action: 'contribute', countryId: '250', amount: 1 },
  });
  expect(r.status()).toBe(401);
  const code = await emailCode(email);
  const other = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  expect(
    (await other.post('/api/account/email', { data: { action: 'verify', code } })).status(),
  ).toBe(400);
  await other.dispose();
  const wrong = code === '000000' ? '000001' : '000000';
  expect(
    (
      await page.request.post('/api/account/email', { data: { action: 'verify', code: wrong } })
    ).status(),
  ).toBe(400);
  r = await page.request.post('/api/account/email', { data: { action: 'verify', code } });
  expect(r.ok()).toBe(true);
  const world = await r.json();
  expect(world.account.emailVerified).toBe(true);
  expect(world.player.wallet).toBe(100);
  expect(
    (await page.request.post('/api/account/email', { data: { action: 'verify', code } })).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post('/api/game', {
        data: { action: 'contribute', countryId: '250', amount: 1 },
      })
    ).ok(),
  ).toBe(true);
});
test('registration asks for a code before the tutorial and retains the pending step on reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrer dans le jeu', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const email = testEmail('EmailUI');
  await dialog.getByLabel('Pseudonyme').fill('EmailUI');
  await dialog.getByLabel('Adresse e-mail').fill(email);
  await dialog.getByLabel('Mot de passe', { exact: true }).fill('Carte-42');
  await dialog.getByRole('button', { name: 'Créer mon compte gratuit' }).click();
  await expect(dialog.getByLabel('Code de vérification')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Didacticiel' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/email-verification-mobile.png' });
  await page.reload();
  await page.getByRole('button', { name: 'Entrer dans le jeu', exact: true }).click();
  await expect(page.getByLabel('Code de vérification')).toBeVisible();
  await confirmEmailUI(page, email);
  await expect(page.getByRole('complementary', { name: 'Didacticiel' })).toBeVisible();
});
test('legacy sessions need verified email even when bypassing the browser, with balances preserved', async ({
  page,
}) => {
  const db = new DatabaseSync(process.env.E2E_DATABASE_PATH!);
  const now = Date.now();
  db.prepare(
    'INSERT INTO users(id,username,password,color,created_at,generation_anchor,wallet) VALUES(?,?,?,?,?,?,?)',
  ).run('legacy-email-test', 'LegacyEmail', hashPassword('Carte-42'), '#111111', now, now, 37);
  db.prepare('INSERT INTO sponsor_wallets(user_id,balance_cents) VALUES(?,?)').run(
    'legacy-email-test',
    1234,
  );
  db.close();
  expect(
    (
      await page.request.post('/api/game', {
        data: { action: 'login', username: 'LegacyEmail', password: 'Carte-42' },
      })
    ).ok(),
  ).toBe(true);
  for (const action of ['contribute', 'create-alliance', 'border-attack', 'sponsor-proposal']) {
    const r = await page.request.post('/api/game', { data: { action } });
    expect(r.status()).toBe(403);
    expect((await r.json()).error).toContain('e-mail');
  }
  expect((await page.request.post('/api/logo')).status()).toBe(403);
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Vérifiez votre adresse e-mail.' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Adresse e-mail').fill(testEmail('LegacyEmail'));
  await dialog.getByLabel('Mot de passe actuel').fill('Carte-42');
  await dialog.getByRole('button', { name: 'Recevoir mon code' }).click();
  await expect(dialog.getByLabel('Code de vérification')).toBeVisible();
  await confirmEmailUI(page, testEmail('LegacyEmail'));
  await expect(dialog).not.toBeVisible();
  const world = await page.request.get('/api/game').then((r) => r.json());
  expect(world.player.id).toBe('legacy-email-test');
  expect(world.player.wallet).toBe(37);
  expect(world.sponsorWallet.balance_cents).toBe(1234);
});
