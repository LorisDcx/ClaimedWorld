import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import countries from '../../src/data/countries.json';
import { DatabaseSync } from 'node:sqlite';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
const password = 'Test-password-123!';
test('sponsor credits fund competing ads and move without wallet refunds or extended expiry', async ({
  page,
  playwright,
}) => {
  const first = page.request;
  const second = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const admin = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const post = (context: typeof first, data: Record<string, unknown>) =>
    context.post('/api/game', { data });
  const accountA = await post(first, { action: 'signup', username: 'SponsorOne', password }).then(
    (r) => r.json(),
  );
  const accountB = await post(second, { action: 'signup', username: 'SponsorTwo', password }).then(
    (r) => r.json(),
  );
  await post(admin, { action: 'login', username: 'AdminTest', password: 'Admin-password-123!' });
  async function campaign(context: typeof first, name: string) {
    const response = await post(context, {
      action: 'sponsor-proposal',
      countryId: '250',
      name,
      description: 'An approved advertising visual for testing.',
      url: 'https://example.com',
      color: '#397bc5',
    });
    expect(response.ok()).toBeTruthy();
    const own = await context.get('/api/sponsoring').then((r) => r.json());
    const asset = own.campaigns.find((item: { name: string }) => item.name === name);
    expect(
      (await post(admin, { action: 'moderate', id: asset.id, decision: 'approve' })).ok(),
    ).toBeTruthy();
    return asset.id as string;
  }
  const campaignA = await campaign(first, 'Sponsor One');
  const campaignB = await campaign(second, 'Sponsor Two');
  const databasePath = process.env.E2E_DATABASE_PATH!;
  expect(databasePath).toMatch(/^\.\/data\/test-\d+\.sqlite$/);
  const db = new DatabaseSync(databasePath);
  async function recharge(userId: string, amount: number) {
    const id = randomUUID(),
      checkout = `cs-e2e-${id}`;
    db.prepare(
      'INSERT INTO sponsor_topups(id,user_id,request_id,amount_cents,checkout_id,created_at) VALUES(?,?,?,?,?,?)',
    ).run(id, userId, id, amount, checkout, Date.now());
    const payload = JSON.stringify({
      id: `evt-${id}`,
      object: 'event',
      livemode: false,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: checkout,
          object: 'checkout.session',
          payment_status: 'paid',
          payment_intent: `pi-${id}`,
          amount_total: amount,
          currency: 'eur',
          metadata: { kind: 'sponsor_topup', topup_id: id, user_id: userId },
        },
      },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_e2e_local_webhook_only',
    });
    expect(
      (
        await first.post('/api/webhooks/stripe', {
          data: payload,
          headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
        })
      ).ok(),
    ).toBeTruthy();
  }
  await recharge(accountA.player.id, 30000);
  await recharge(accountB.player.id, 30000);
  let result = await post(first, {
    action: 'sponsor-place',
    campaignId: campaignA,
    countryId: '250',
    amountCents: 499,
    accepted: true,
  });
  expect(result.status()).toBe(400);
  await page.goto('/?country=250');
  const panel = page.getByRole('complementary', { name: 'Conquête de France' });
  await panel.getByRole('tab', { name: 'Sponsoring', exact: true }).click();
  await expect(panel.locator('.sponsor-country-price strong')).toHaveText('60 €');
  await panel.getByLabel('Enchère sponsor du pays').fill('100');
  await panel.getByRole('checkbox', { name: /Ces fonds seront engagés/ }).check();
  await panel.getByRole('button', { name: 'Enchérir 100,00 €' }).click();
  await expect(panel.locator('.sponsor-ranking')).toContainText('Sponsor One');
  await panel.getByRole('button', { name: 'Gérer mes crédits sponsor' }).click();
  const console = page.locator('.sponsor-console');
  await expect(console.locator('.sponsor-position')).toContainText('France');
  await expect(console.locator('.sponsor-wallet strong').first()).toContainText('200,00');
  const before = await first.get('/api/sponsoring').then((r) => r.json());
  result = await post(second, {
    action: 'sponsor-place',
    campaignId: campaignB,
    countryId: '250',
    amountCents: 20000,
    accepted: true,
  });
  expect(result.ok()).toBeTruthy();
  await expect(console.locator('.sponsor-position')).toContainText('Dépassé');
  await page.screenshot({ path: 'artifacts/sponsor-console.png' });
  await console
    .getByRole('combobox', { name: 'Destination des fonds sponsor' })
    .selectOption('276');
  await console.getByRole('button', { name: 'Déplacer 100,00 crédits', exact: true }).click();
  await expect(console.locator('.sponsor-position')).toContainText('Allemagne');
  const after = await first.get('/api/sponsoring').then((r) => r.json());
  expect(after.wallet.balance_cents).toBe(20000);
  expect(after.stakes[0].expires_at).toBe(before.stakes[0].expires_at);
  expect(after.stakes[0].placed_at).toBe(before.stakes[0].placed_at);
  let world = await first.get('/api/game').then((r) => r.json());
  expect(world.territories.find((t: { id: string }) => t.id === '250').sponsor.id).toBe(campaignB);
  expect(world.territories.find((t: { id: string }) => t.id === '276').sponsor.id).toBe(campaignA);
  expect(world.player.wallet).toBe(100);
  result = await post(first, {
    action: 'sponsor-move',
    fromCampaignId: campaignA,
    fromCountryId: '276',
    campaignId: campaignA,
    countryId: 'wallet',
    amountCents: 10000,
  });
  expect(result.status()).toBe(400);
  result = await post(second, {
    action: 'sponsor-move',
    fromCampaignId: campaignA,
    fromCountryId: '276',
    campaignId: campaignB,
    countryId: '392',
    amountCents: 10000,
  });
  expect(result.status()).toBe(400);
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(panel.locator('.sponsor-ranking')).toContainText('Sponsor Two');
  await page.screenshot({ path: 'artifacts/sponsor-auction.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Gérer mes crédits sponsor' }).click();
  await expect(console.locator('.sponsor-wallet')).toBeVisible();
  await page
    .getByRole('dialog')
    .evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  await page.screenshot({ path: 'artifacts/sponsor-mobile.png' });
  // Simulate the elapsed 30-day lifetime in this test-only database.
  db.prepare('UPDATE sponsor_stakes SET expires_at=? WHERE user_id=?').run(
    Date.now() - 1,
    accountA.player.id,
  );
  const expired = await first.get('/api/sponsoring').then((r) => r.json());
  expect(expired.stakes).toHaveLength(0);
  expect(expired.wallet.balance_cents).toBe(20000);
  const simultaneous = await Promise.all([
    post(first, {
      action: 'sponsor-place',
      campaignId: campaignA,
      countryId: '724',
      amountCents: 15000,
      accepted: true,
    }),
    post(first, {
      action: 'sponsor-place',
      campaignId: campaignA,
      countryId: '380',
      amountCents: 15000,
      accepted: true,
    }),
  ]);
  expect(simultaneous.map((r) => r.status()).sort()).toEqual([200, 400]);
  expect((await first.get('/api/sponsoring').then((r) => r.json())).wallet.balance_cents).toBe(
    5000,
  );
  await post(admin, { action: 'moderate', id: campaignB, decision: 'reject' });
  world = await first.get('/api/game').then((r) => r.json());
  expect(world.territories.find((t: { id: string }) => t.id === '250').sponsor).toBeNull();
  const replacement = await campaign(second, 'Sponsor Two Replacement');
  result = await post(second, {
    action: 'sponsor-move',
    fromCampaignId: campaignB,
    fromCountryId: '250',
    campaignId: replacement,
    countryId: '392',
    amountCents: 20000,
  });
  expect(result.ok()).toBeTruthy();
  expect((await second.get('/api/sponsoring').then((r) => r.json())).wallet.balance_cents).toBe(
    10000,
  );
  db.close();
  await second.dispose();
  await admin.dispose();
});
test('one-point claims, live contender rankings and overtaking work on every territory', async ({
  page,
  playwright,
}) => {
  let response = await page.request.post('/api/game', {
    data: { action: 'signup', username: 'FirstBidder', password },
  });
  expect(response.ok()).toBeTruthy();
  for (const countryId of ['064', '276']) {
    response = await page.request.post('/api/game', {
      data: { action: 'contribute', countryId, amount: 1 },
    });
    expect(response.ok()).toBeTruthy();
    const world = await response.json();
    expect(world.territories.find((t: { id: string }) => t.id === countryId).owner.score).toBe(1);
  }
  await page.goto('/?country=064');
  const panel = page.getByRole('complementary', { name: 'Conquête de Bhoutan' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.contender-list li').first()).toContainText('FirstBidder');
  await expect(page.getByRole('spinbutton', { name: 'Influence à investir' })).toHaveAttribute(
    'min',
    '1',
  );
  const challenger = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  await challenger.post('/api/game', {
    data: { action: 'signup', username: 'SecondBidder', password },
  });
  response = await challenger.post('/api/game', {
    data: { action: 'contribute', countryId: '064', amount: 1 },
  });
  expect(
    (await response.json()).territories.find((t: { id: string }) => t.id === '064').owner.name,
  ).toBe('FirstBidder');
  await challenger.post('/api/game', {
    data: { action: 'contribute', countryId: '064', amount: 1 },
  });
  await expect(panel.locator('.contender-list li').first()).toContainText('SecondBidder');
  await expect(panel.locator('.contender-list li').nth(1)).toContainText('+2 pour passer devant');
  await expect(panel.locator('.standings-clock time')).toBeVisible();
  const before = await panel.locator('.standings-clock time').innerText();
  await expect.poll(() => panel.locator('.standings-clock time').innerText()).not.toBe(before);
  await page.screenshot({ path: 'artifacts/standings-desktop.png' });
  await panel.getByRole('button', { name: /Passer devant/ }).click();
  await expect(panel.locator('.contender-list li').first()).toContainText('FirstBidder');
  await expect(panel.locator('.contender-list li').first().locator('b')).toHaveText('3');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel.getByRole('button', { name: /Renforcer/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  await page.screenshot({ path: 'artifacts/standings-mobile.png' });
  await panel.getByRole('button', { name: 'Fermer le classement du pays' }).click();
  await expect(panel).toHaveCount(0);
  await challenger.dispose();
});
test('claimed neighbors retain separate thick color bands on their shared border', async ({
  page,
}) => {
  await page.route('**/api/events', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: ': isolated visual test\n\n',
    }),
  );
  await page.route('**/api/game', async (route) => {
    const response = await route.fetch();
    const world = await response.json();
    world.territories = world.territories.map((t: { id: string }) => ({
      ...t,
      owner: ['250', '276'].includes(t.id)
        ? {
            id: `visual-${t.id}`,
            name: 'Border test',
            color: t.id === '250' ? '#28c48b' : '#ae6cf2',
            score: 100,
            alliance: false,
            emblem: '',
          }
        : null,
    }));
    await route.fulfill({ response, json: world });
  });
  await page.goto('/?country=250');
  await expect(page.locator('.ownership-border')).toHaveCount(2);
  await expect(page.locator('.selection-name')).toContainText('France');
  await page
    .locator('.map-geography')
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const samples = await page.evaluate(() => {
    const france = document.querySelector<SVGGeometryElement>(
      '.country-path[aria-label="France"]',
    )!;
    function borderWith(name: string) {
      const neighbor = document.querySelector<SVGGeometryElement>(
        `.country-path[aria-label="${name}"]`,
      )!;
      const matrix = france.getScreenCTM()!;
      const inverse = matrix.inverse();
      for (let distance = 1; distance < france.getTotalLength() - 1; distance += 0.15) {
        const p = france.getPointAtLength(distance);
        const a = france.getPointAtLength(distance - 0.04).matrixTransform(matrix);
        const b = france.getPointAtLength(distance + 0.04).matrixTransform(matrix);
        const center = p.matrixTransform(matrix);
        if (
          center.x < 20 ||
          center.x > innerWidth - 20 ||
          center.y < 100 ||
          center.y > innerHeight - 50
        )
          continue;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length < 0.001) continue;
        for (const sign of [1, -1]) {
          const dx = ((b.y - a.y) / length) * 1.8 * sign;
          const dy = ((a.x - b.x) / length) * 1.8 * sign;
          const inside = new DOMPoint(center.x + dx, center.y + dy);
          const outside = new DOMPoint(center.x - dx, center.y - dy);
          const stable = [-4, 0, 4].every((step) => {
            const tx = ((b.x - a.x) / length) * step;
            const ty = ((b.y - a.y) / length) * step;
            return (
              france.isPointInFill(
                new DOMPoint(inside.x + tx, inside.y + ty).matrixTransform(inverse),
              ) &&
              neighbor.isPointInFill(
                new DOMPoint(outside.x + tx, outside.y + ty).matrixTransform(inverse),
              )
            );
          });
          if (stable)
            return {
              france: { x: inside.x, y: inside.y },
              neighbor: { x: outside.x, y: outside.y },
            };
        }
      }
      throw new Error(`No visible France / ${name} border sample`);
    }
    return { germany: borderWith('Allemagne'), spain: borderWith('Espagne') };
  });
  const screenshot = await page.screenshot({ path: 'artifacts/border-neighbors.png' });
  const { data, info } = await sharp(screenshot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (point: { x: number; y: number }) => {
    const index = (Math.round(point.y) * info.width + Math.round(point.x)) * info.channels;
    return [...data.subarray(index, index + 3)];
  };
  const near = (actual: number[], expected: number[]) =>
    actual.every((value, i) => Math.abs(value - expected[i]) < 35);
  expect(near(pixel(samples.germany.france), [40, 196, 139])).toBeTruthy();
  expect(near(pixel(samples.germany.neighbor), [174, 108, 242])).toBeTruthy();
  expect(
    near(pixel(samples.spain.france), [40, 196, 139]),
    JSON.stringify({ samples, color: pixel(samples.spain.france) }),
  ).toBeTruthy();
  await page.getByRole('textbox', { name: 'Rechercher un pays' }).fill('Allemagne');
  await page
    .locator('.search-results')
    .getByRole('button', { name: /Allemagne/ })
    .click();
  await expect(
    page.locator('.ownership-border[data-territory="276"] > path').first(),
  ).toHaveAttribute('stroke-width', '6');
});
test('ocean labels follow the canvas and small Pacific territories can be selected', async ({
  page,
}) => {
  // Wait for the post-hydration request before sending pointer gestures.
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/game')),
    page.goto('/'),
  ]);
  expect(await page.locator('.island-marker').count()).toBeLessThanOrEqual(8);
  const ocean = page.locator('.map-geography .ocean-labels text').nth(1);
  await expect(ocean).toHaveText('OCÉAN ATLANTIQUE');
  const before = await ocean.boundingBox();
  const canvas = await page.getByRole('img', { name: 'Carte interactive du monde' }).boundingBox();
  await page.mouse.move(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas!.x + canvas!.width / 2 + 100, canvas!.y + canvas!.height / 2 + 50, {
    steps: 5,
  });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await ocean.boundingBox())!.x - before!.x)).toBe(100);
  await expect.poll(async () => Math.round((await ocean.boundingBox())!.y - before!.y)).toBe(50);
  await page.getByRole('button', { name: 'Recentrer la carte', exact: true }).click();
  await page.locator('.island-marker[data-territory="584"]').first().click();
  await expect(page.locator('.selection-name')).toContainText('Îles Marshall');
  const search = page.getByRole('textbox', { name: 'Rechercher un pays' });
  for (const [query, name] of [
    ['Reunion', 'La Réunion / France'],
    ['Martinique', 'Martinique / France'],
    ['Guadeloupe', 'Guadeloupe / France'],
    ['Midway', 'Îles Midway / États-Unis'],
    ['Marshall', 'Îles Marshall'],
  ]) {
    await search.fill(query);
    await page
      .locator('.search-results')
      .getByRole('button', { name: new RegExp(name) })
      .click();
    await expect(page.locator('.selection-name')).toContainText(name);
  }
  expect(Number((await page.locator('.map-scale').innerText()).split('×')[0])).toBeGreaterThan(5);
  await expect(page.locator('.right-drawer,.map-tooltip')).toHaveCount(0);
});
test('visitor exploration and a complete account, conquest, and alliance journey', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.world-canvas')).toBeVisible();
  await expect(page.locator('.right-drawer')).toHaveCount(0);
  expect(await page.locator('.country-path').count()).toBe(countries.length);
  await page.getByRole('button', { name: 'Entrer dans le jeu' }).click();
  await page.getByLabel('Pseudonyme', { exact: true }).fill('ExplorerTest');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Créer mon compte gratuit' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.wallet strong')).toHaveText('100');
  const search = page.getByRole('textbox', { name: 'Rechercher un pays' });
  await search.fill('Islande');
  await page
    .locator('.search-results')
    .getByRole('button', { name: /Islande/ })
    .click();
  await expect(page.locator('.selection-name')).toContainText('Islande');
  await page.getByRole('spinbutton', { name: 'Influence à investir' }).fill('50');
  await page.getByRole('button', { name: 'Investir mon Influence' }).click();
  await expect(page.locator('.wallet strong')).toHaveText('50');
  await expect(page.locator('.selection-name small')).toHaveText('ExplorerTest');
  await page.reload();
  await expect(page.locator('.wallet strong')).toHaveText('50');
  await page.getByRole('button', { name: 'Alliances', exact: true }).click();
  await page.getByRole('button', { name: 'Créer une alliance', exact: true }).click();
  await page.getByLabel('Nom de l’alliance').fill('Test Collective');
  await page.getByLabel('En quelques mots').fill('Une communauté de test qui explore le monde.');
  await page.getByRole('button', { name: 'Créer mon alliance', exact: true }).click();
  await expect(page.locator('.your-alliance')).toContainText('Test Collective');
  await page.getByRole('button', { name: 'Gérer et inviter' }).click();
  await page.getByRole('button', { name: 'Quitter l’alliance' }).click();
  await expect(page.getByRole('dialog')).toContainText('24 h');
  await page.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.locator('.your-alliance')).toHaveCount(0);
  await page.getByRole('button', { name: 'Créer une alliance', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Créer mon alliance', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'La carte', exact: true }).click();
  await search.fill('Islande');
  await page
    .locator('.search-results')
    .getByRole('button', { name: /Islande/ })
    .click();
  await page.getByRole('button', { name: 'Sponsoriser ce pays' }).click();
  await page.getByRole('button', { name: 'Créer un visuel' }).click();
  await page.getByLabel('Nom de votre projet').fill('Test Brand');
  await page.getByLabel('Description courte').fill('Une campagne de démonstration à modérer.');
  await page.getByLabel('Site, application ou Instagram').fill('https://example.com');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Soumettre pour validation' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('server rejects unauthorized actions, overspending, spoofed origins and unmoderated payments', async ({
  request,
}) => {
  let r = await request.post('/api/game', {
    data: { action: 'contribute', countryId: '352', amount: 50 },
  });
  expect(r.status()).toBe(401);
  r = await request.post('/api/game', {
    data: { action: 'signup', username: 'SecurityTest', password, color: '#7972e8' },
  });
  expect(r.ok()).toBeTruthy();
  r = await request.post('/api/game', {
    data: { action: 'contribute', countryId: '352', amount: 101 },
  });
  expect(r.status()).toBe(400);
  r = await request.post('/api/game', {
    data: { action: 'contribute', countryId: '352', amount: -50 },
  });
  expect(r.status()).toBe(400);
  r = await request.post('/api/game', { data: { action: 'collect' } });
  expect(r.status()).toBe(400);
  r = await request.post('/api/game', {
    headers: { origin: 'https://evil.example' },
    data: { action: 'collect' },
  });
  expect(r.status()).toBe(403);
  r = await request.get('/api/game?admin=1');
  expect(r.status()).toBe(403);
  r = await request.post('/api/checkout', { data: { sponsorId: 'fake' } });
  expect(r.status()).toBe(503);
  r = await request.post('/api/game', {
    data: {
      action: 'sponsor-proposal',
      countryId: '352',
      name: 'Unsafe',
      description: 'Invalid insecure destination',
      url: 'javascript:alert(1)',
    },
  });
  expect(r.status()).toBe(400);
  const s = await request.get('/api/game').then((r) => r.json());
  expect(s.player.wallet).toBe(100);
});
test('mobile navigation and map search remain usable without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.world-canvas')).toBeVisible();
  await expect(page.locator('.right-drawer')).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('textbox', { name: 'Rechercher un pays' }).fill('Malte');
  await page.locator('.search-results').getByRole('button', { name: /Malte/ }).click();
  await expect(page.locator('.selection-name')).toContainText('Malte');
  await page.getByRole('button', { name: 'La carte', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom avant', exact: true }).click();
  await expect(page.locator('.map-scale')).not.toContainText('1.0');
  await page.getByRole('button', { name: 'Recentrer la carte' }).click();
  await expect(page.locator('.map-scale')).toContainText('1.0');
  await page.getByRole('button', { name: 'Classement', exact: true }).click();
  await expect(page.locator('.ranking-table')).toBeVisible();
  await page.getByRole('button', { name: 'Sponsors', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Un pays. Une place pour votre projet.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});

test('alliance treasury, strategy, personal freedom, generals and succession are enforced', async ({
  playwright,
  browser,
}) => {
  const leader = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const member = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const post = (ctx: typeof leader, data: Record<string, unknown>) =>
    ctx.post('/api/game', { data });
  let r = await post(leader, { action: 'signup', username: 'TeamLeader', password });
  expect(r.ok()).toBeTruthy();
  const leaderId = (await r.json()).player.id;
  r = await post(member, { action: 'signup', username: 'TeamMember', password });
  expect(r.ok()).toBeTruthy();
  const memberId = (await r.json()).player.id;
  r = await post(leader, {
    action: 'create-alliance',
    name: 'Pooling Test',
    color: '#7972e8',
    description: 'Testing the game rules.',
    emblem: '◈',
  });
  expect(r.ok()).toBeTruthy();
  const allianceId = (await r.json()).player.alliance_id;
  r = await post(member, { action: 'join-alliance', allianceId });
  expect(r.ok()).toBeTruthy();
  r = await post(leader, { action: 'alliance-deposit', amount: 60 });
  expect(r.ok()).toBeTruthy();
  r = await post(member, { action: 'alliance-deposit', amount: 70 });
  expect(r.ok()).toBeTruthy();
  r = await post(member, { action: 'contribute', mode: 'alliance', countryId: '008', amount: 1 });
  expect(r.status()).toBe(403);
  r = await post(member, { action: 'contribute', mode: 'solo', countryId: '304', amount: 1 });
  let s = await r.json();
  expect(s.territories.find((t: { id: string }) => t.id === '304').owner.id).toBe(memberId);
  r = await post(leader, { action: 'contribute', mode: 'alliance', countryId: '008', amount: 1 });
  expect(r.status()).toBe(403);
  r = await post(member, {
    action: 'alliance-objective',
    objective: 'Unapproved',
    targets: ['304'],
  });
  expect(r.status()).toBe(403);
  const page = await browser.newPage({ storageState: await leader.storageState() });
  await page.goto('/');
  await page.getByRole('button', { name: 'Alliances', exact: true }).click();
  await page.getByRole('button', { name: 'Gérer et inviter' }).click();
  await page.getByLabel('But de l’alliance').fill('Défendre l’Albanie');
  await page.getByRole('textbox', { name: 'Filtrer les cibles de l’alliance' }).fill('Albanie');
  await page.locator('.objective-targets').getByLabel('Albanie', { exact: true }).check();
  await page.getByRole('button', { name: 'Enregistrer la stratégie' }).click();
  await expect(page.locator('.alliance-objective')).toContainText('Défendre l’Albanie');
  await page.screenshot({ path: 'artifacts/alliance-management.png' });
  await page.goto('/?country=008');
  await page.getByRole('combobox', { name: 'Revendiquer au nom de' }).selectOption('alliance');
  await expect(page.locator('.standings-mode')).toContainText('Trésorerie de Pooling Test');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
  await expect(page.getByRole('combobox', { name: 'Revendiquer au nom de' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/alliance-mode-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  r = await post(leader, { action: 'contribute', mode: 'alliance', countryId: '008', amount: 50 });
  s = await r.json();
  expect(s.player.wallet).toBe(40);
  expect(s.alliances.find((a: { id: string }) => a.id === allianceId).treasury).toBe(80);
  r = await post(leader, { action: 'set-general', userId: memberId });
  expect(r.ok()).toBeTruthy();
  r = await post(member, { action: 'contribute', mode: 'alliance', countryId: '008', amount: 50 });
  s = await r.json();
  expect(s.territories.find((t: { id: string }) => t.id === '008').owner.score).toBe(100);
  expect(s.player.wallet).toBe(29);
  r = await post(member, { action: 'contribute', mode: 'alliance', countryId: '304', amount: 1 });
  expect(r.status()).toBe(403);
  r = await post(leader, { action: 'set-general', userId: memberId, enabled: false });
  expect(r.ok()).toBeTruthy();
  r = await post(member, { action: 'contribute', mode: 'alliance', countryId: '008', amount: 1 });
  expect(r.status()).toBe(403);
  await post(leader, { action: 'set-general', userId: memberId });
  const details = await leader
    .get(`/api/game?alliance=${allianceId}`)
    .then((response) => response.json());
  expect(details.members.find((m: { id: string }) => m.id === leaderId).engaged).toBe(60);
  expect(details.members.find((m: { id: string }) => m.id === memberId).engaged).toBe(40);
  const spendTreasury = await Promise.all([
    post(member, { action: 'contribute', mode: 'alliance', countryId: '008', amount: 30 }),
    post(member, { action: 'contribute', mode: 'alliance', countryId: '008', amount: 30 }),
  ]);
  expect(spendTreasury.map((response) => response.status()).sort()).toEqual([200, 400]);
  // Test-only fixture: one remaining membership slot, without extra signup requests.
  const databasePath = process.env.E2E_DATABASE_PATH!;
  expect(databasePath).toMatch(/^\.\/data\/test-\d+\.sqlite$/);
  const db = new DatabaseSync(databasePath);
  for (let i = 0; i < 9; i++) {
    const uid = `limit-fixture-${i}`;
    db.prepare(
      'INSERT INTO users(id,username,password,color,created_at,generation_anchor,alliance_id,alliance_joined_at) VALUES(?,?,?,?,?,?,?,?)',
    ).run(uid, uid, '!', '#111111', Date.now(), Date.now(), allianceId, Date.now());
  }
  const waiting = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  await post(waiting, { action: 'signup', username: 'TeamWaiting', password });
  const incoming = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  await post(incoming, { action: 'signup', username: 'TeamIncoming', password });
  const joins = await Promise.all([
    post(waiting, { action: 'join-alliance', allianceId }),
    post(incoming, { action: 'join-alliance', allianceId }),
  ]);
  expect(joins.map((response) => response.status()).sort()).toEqual([200, 400]);
  expect(
    Number(db.prepare('SELECT COUNT(*) AS n FROM users WHERE alliance_id=?').get(allianceId)!.n),
  ).toBe(12);
  const joined = joins[0].ok() ? waiting : incoming;
  const joinedPlayer = await joined.get('/api/game').then((response) => response.json());
  await post(leader, { action: 'kick-member', userId: joinedPlayer.player.id });
  await waiting.dispose();
  await incoming.dispose();
  // Full-stock ticks are settled before spending, not saved as a hidden reserve.
  db.prepare('UPDATE users SET generation_anchor=?,collected_slots=0 WHERE id=?').run(
    Date.now() - 24 * 3600000,
    leaderId,
  );
  s = await leader.get('/api/game').then((response) => response.json());
  expect(s.player.wallet).toBe(160);
  await post(leader, { action: 'contribute', mode: 'solo', countryId: '004', amount: 1 });
  s = await leader.get('/api/game').then((response) => response.json());
  expect(s.player.wallet).toBe(159);
  expect(s.player.reserve).toBe(0);
  db.prepare('UPDATE alliances SET treasury=1900 WHERE id=?').run(allianceId);
  r = await post(leader, { action: 'alliance-deposit', amount: 21 });
  expect(r.status()).toBe(400);
  r = await post(leader, { action: 'alliance-deposit', amount: 20 });
  expect(r.ok()).toBeTruthy();
  r = await post(leader, { action: 'alliance-deposit', amount: 1 });
  expect(r.status()).toBe(400);
  db.close();
  r = await post(leader, { action: 'leave-alliance' });
  s = await r.json();
  expect(s.player.cooldown_until).toBeGreaterThan(Date.now());
  expect(s.alliances.find((a: { id: string }) => a.id === allianceId).leader_id).toBe(memberId);
  expect(s.territories.find((t: { id: string }) => t.id === '008').owner.score).toBe(130);
  // Personal funds cannot be spent twice, even by parallel requests.
  const recruit = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  r = await post(recruit, { action: 'signup', username: 'TeamRecruit', password });
  const recruitId = (await r.json()).player.id;
  await post(recruit, { action: 'join-alliance', allianceId });
  r = await post(member, { action: 'kick-member', userId: recruitId });
  expect(r.ok()).toBeTruthy();
  const expelled = await recruit.get('/api/game').then((r) => r.json());
  expect(expelled.player.cooldown_until).toBe(0);
  expect(expelled.player.alliance_id).toBeNull();
  r = await post(recruit, {
    action: 'create-alliance',
    name: 'New Start',
    color: '#4aaf83',
    emblem: '✦',
  });
  expect(r.ok()).toBeTruthy();
  await recruit.dispose();
  const spend = await Promise.all([
    post(leader, { action: 'contribute', countryId: '008', amount: 100 }),
    post(leader, { action: 'contribute', countryId: '008', amount: 100 }),
  ]);
  expect(spend.map((r) => r.status()).sort()).toEqual([200, 400]);
  expect(leaderId).not.toBe(memberId);
  await leader.dispose();
  await member.dispose();
  await page.close();
});

test('logos stay private until moderation/payment and only provisioned admins can moderate', async ({
  playwright,
}) => {
  const owner = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const admin = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  const visitor = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3001' });
  await owner.post('/api/game', { data: { action: 'signup', username: 'CampaignTest', password } });
  const logo = await sharp({
    create: { width: 24, height: 24, channels: 4, background: '#ff5d35' },
  })
    .png()
    .toBuffer();
  let r = await owner.post('/api/logo', {
    multipart: { logo: { name: 'brand.png', mimeType: 'image/png', buffer: logo } },
  });
  expect(r.ok()).toBeTruthy();
  const { logoId } = await r.json();
  r = await visitor.get(`/api/media/${logoId}`);
  expect(r.status()).toBe(404);
  r = await owner.get(`/api/media/${logoId}`);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toBe('image/webp');
  r = await owner.post('/api/logo', {
    multipart: {
      logo: {
        name: 'bad.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      },
    },
  });
  expect(r.status()).toBe(400);
  r = await owner.post('/api/game', {
    data: {
      action: 'sponsor-proposal',
      countryId: '470',
      name: 'Brand Test',
      description: 'A moderated campaign for a test brand.',
      url: 'https://example.com',
      logoId,
    },
  });
  expect(r.ok()).toBeTruthy();
  let mine = await owner.get('/api/game?mine=1').then((r) => r.json());
  const campaignId = mine.sponsors[0].id;
  r = await owner.post('/api/game', {
    data: { action: 'moderate', id: campaignId, decision: 'approve' },
  });
  expect(r.status()).toBe(403);
  r = await owner.post('/api/game', {
    data: { action: 'profile', username: 'AdminTest', color: '#7972e8' },
  });
  expect(r.status()).toBe(409);
  r = await admin.post('/api/game', {
    data: { action: 'login', username: 'AdminTest', password: 'Admin-password-123!' },
  });
  expect(r.ok()).toBeTruthy();
  expect((await r.json()).player.isAdmin).toBeTruthy();
  r = await admin.get(`/api/media/${logoId}`);
  expect(r.status()).toBe(200);
  r = await admin.post('/api/game', {
    data: { action: 'moderate', id: campaignId, decision: 'approve' },
  });
  expect(r.ok()).toBeTruthy();
  mine = await owner.get('/api/game?mine=1').then((r) => r.json());
  expect(mine.sponsors[0].status).toBe('approved');
  expect(mine.sponsors[0].payment_status).toBe('unpaid');
  const world = await visitor.get('/api/game').then((r) => r.json());
  expect(world.territories.find((t: { id: string }) => t.id === '470').sponsor).toBeNull();
  await owner.dispose();
  await admin.dispose();
  await visitor.dispose();
});

test('a second browser receives conquests over the live event stream', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext();
  const watcher = await context.newPage();
  await watcher.goto('/?country=020');
  await expect(watcher.locator('.selection-name')).toContainText('Andorre');
  let r = await request.post('/api/game', {
    data: { action: 'signup', username: 'RealtimeTest', password },
  });
  expect(r.ok()).toBeTruthy();
  r = await request.post('/api/game', {
    data: { action: 'contribute', countryId: '020', amount: 50 },
  });
  expect(r.ok()).toBeTruthy();
  await expect(watcher.locator('.selection-name small')).toHaveText('RealtimeTest', {
    timeout: 7000,
  });
  await context.close();
});
