import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSeason, get, run } from '../src/lib/db';
import { sponsorMinimum } from '../src/lib/sponsor-pricing';
import { houseSponsor } from '../src/lib/house-ads';
import {
  creditSponsorTopup,
  moveSponsorFunds,
  ownSponsoring,
  placeSponsorFunds,
  sponsorMarket,
  sponsorWallet,
  SPONSOR_DURATION,
} from '../src/lib/sponsoring';
process.env.DATABASE_PATH = ':memory:';
const DAY = 86400000;
let base = Date.now();

test('house campaigns occupy only the six requested countries and use the supplied Waant mark', () => {
  for (const id of ['276', '840']) assert.equal(houseSponsor(id)?.name, 'CramDesk');
  for (const id of ['578', '752', '208', '036']) {
    assert.equal(houseSponsor(id)?.name, 'Waant');
    assert.equal(houseSponsor(id)?.logo_url, '/sponsors/waant-symbol.png');
  }
  for (const id of ['250', '156', '643', '304', '076', '246']) assert.equal(houseSponsor(id), null);
});
async function advertiser(id: string, amount: number, at: number) {
  const season = await currentSeason();
  await run(
    'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
    id,
    id,
    '!',
    '#111111',
    at,
    at,
  );
  await run(
    "INSERT INTO sponsors(id,user_id,country_id,season_id,name,description,url,initials,color,amount,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'approved',?)",
    id,
    id,
    '250',
    season.id,
    id,
    'Test advertiser',
    'https://example.com',
    'AD',
    '#444444',
    0,
    at,
  );
  await run(
    'INSERT INTO sponsor_topups(id,user_id,request_id,amount_cents,checkout_id,created_at) VALUES(?,?,?,?,?,?)',
    `topup-${id}`,
    id,
    `request-${id}`,
    amount,
    `cs-${id}`,
    at,
  );
  await creditSponsorTopup(
    {
      topupId: `topup-${id}`,
      userId: id,
      checkoutId: `cs-${id}`,
      paymentIntent: `pi-${id}`,
      amount,
      currency: 'eur',
      eventId: `event-${id}`,
    },
    at,
  );
}

test('advertising placements and unspent wallet survive game season changes', async () => {
  const season = await currentSeason();
  const placed = season.ends_at - DAY;
  await advertiser('continuous', 30000, placed);
  await placeSponsorFunds('continuous', 'continuous', '250', 10000, true, placed);
  assert.equal(
    (await get<{ wallet: number }>('SELECT wallet FROM users WHERE id=?', 'continuous'))!.wallet,
    100,
    'paid credits never grant Influence',
  );
  await currentSeason(season.ends_at);
  assert.equal((await sponsorWallet('continuous')).balance_cents, 20000);
  assert.equal(
    (await sponsorMarket(season.ends_at)).find((bid) => bid.country_id === '250')?.id,
    'continuous',
  );
  await sponsorMarket(placed + SPONSOR_DURATION);
  assert.equal((await sponsorWallet('continuous')).balance_cents, 20000);
  assert.equal(
    (await sponsorMarket(placed + SPONSOR_DURATION)).some((bid) => bid.user_id === 'continuous'),
    false,
  );
  base = placed + 100 * DAY;
});

test('an outbid advertiser moves funds without recovering money or refreshing their lifetime', async () => {
  const at = base;
  base += 100 * DAY;
  await advertiser('move-a', 30000, at);
  await advertiser('move-b', 30000, at);
  await placeSponsorFunds('move-a', 'move-a', '250', 10000, true, at);
  await placeSponsorFunds('move-b', 'move-b', '250', 20000, true, at + 1);
  assert.equal(
    (await sponsorMarket(at + 1)).find((bid) => bid.winning && bid.country_id === '250')!.id,
    'move-b',
  );
  await moveSponsorFunds('move-a', 'move-a', '250', 'move-a', '276', 10000, at + 10 * DAY);
  await moveSponsorFunds('move-a', 'move-a', '276', 'move-a', '392', 10000, at + 25 * DAY);
  const portfolio = await ownSponsoring('move-a', at + 25 * DAY);
  assert.equal(portfolio.wallet.balance_cents, 20000);
  assert.equal(portfolio.stakes.length, 1);
  assert.equal(portfolio.stakes[0].expires_at, at + SPONSOR_DURATION);
  assert.equal(portfolio.stakes[0].placed_at, at);
  assert.equal(portfolio.stakes[0].country_id, '392');
  assert.equal((await ownSponsoring('move-a', at + SPONSOR_DURATION)).stakes.length, 0);
  assert.equal((await sponsorWallet('move-a')).balance_cents, 20000);
  await sponsorMarket(at + SPONSOR_DURATION + 1);
  assert.equal(
    Number(
      (await get(
        'SELECT COUNT(*) AS n FROM sponsor_ledger WHERE user_id=? AND kind=?',
        'move-a',
        'expire',
      ))!.n,
    ),
    1,
  );
});

test('partial transfers preserve each original deadline and newer funds expire independently', async () => {
  const at = base;
  base += 100 * DAY;
  await advertiser('tranches', 10000, at);
  await placeSponsorFunds('tranches', 'tranches', '470', 1000, true, at);
  await placeSponsorFunds('tranches', 'tranches', '470', 500, true, at + 15 * DAY);
  await moveSponsorFunds('tranches', 'tranches', '470', 'tranches', '492', 500, at + 20 * DAY);
  const before = await ownSponsoring('tranches', at + 20 * DAY);
  assert.equal(before.stakes.length, 3);
  assert.equal(
    before.stakes.find((stake) => stake.country_id === '492')!.expires_at,
    at + 30 * DAY,
  );
  const after = await ownSponsoring('tranches', at + 30 * DAY);
  assert.equal(after.stakes.length, 1);
  assert.equal(after.stakes[0].country_id, '470');
  assert.equal(after.stakes[0].amount_cents, 500);
  assert.equal(after.stakes[0].expires_at, at + 45 * DAY);
  assert.equal(after.wallet.balance_cents, 8500);
});

test('minimum bids, consent, campaign ownership and no wallet-return transfers are enforced atomically', async () => {
  const at = base;
  base += 100 * DAY;
  await advertiser('guard-a', 2000, at);
  await advertiser('guard-b', 2000, at);
  await assert.rejects(() => placeSponsorFunds('guard-a', 'guard-a', '470', 199, true, at));
  await assert.rejects(() => placeSponsorFunds('guard-a', 'guard-a', '470', 500, false, at));
  assert.equal((await sponsorWallet('guard-a')).balance_cents, 2000);
  await placeSponsorFunds('guard-a', 'guard-a', '470', 1000, true, at);
  await assert.rejects(() =>
    moveSponsorFunds('guard-b', 'guard-a', '470', 'guard-b', '492', 500, at),
  );
  await assert.rejects(() =>
    moveSponsorFunds('guard-a', 'guard-a', '470', 'guard-a', 'wallet', 1000, at),
  );
  await assert.rejects(() =>
    moveSponsorFunds('guard-a', 'guard-a', '470', 'guard-a', '492', 900, at),
  );
  assert.equal((await ownSponsoring('guard-a', at)).stakes[0].amount_cents, 1000);
  assert.equal((await sponsorWallet('guard-a')).balance_cents, 1000);
  await run("UPDATE sponsors SET status='rejected' WHERE id=?", 'guard-b');
  await assert.rejects(() => placeSponsorFunds('guard-b', 'guard-b', '276', 500, true, at));
});

test('incumbent ties remain stable as old funding tranches expire', async () => {
  const at = base;
  base += 100 * DAY;
  await advertiser('tie-a', 3000, at);
  await advertiser('tie-b', 3000, at);
  await placeSponsorFunds('tie-a', 'tie-a', '470', 500, true, at);
  await placeSponsorFunds('tie-a', 'tie-a', '470', 500, true, at + DAY);
  await placeSponsorFunds('tie-b', 'tie-b', '470', 500, true, at + DAY + 1);
  assert.equal(
    (await sponsorMarket(at + 30 * DAY)).find((bid) => bid.winning && bid.country_id === '470')!.id,
    'tie-a',
  );
  assert.equal(
    (await sponsorMarket(at + 31 * DAY)).find((bid) => bid.winning && bid.country_id === '470')!.id,
    'tie-b',
  );
});

test('country minimums apply to placements, transfers, partial withdrawals and winner eligibility', async () => {
  const at = base;
  base += 100 * DAY;
  assert.equal(sponsorMinimum('470'), 200);
  for (const id of ['643', '156', '840']) assert.equal(sponsorMinimum(id), 10000);
  for (const id of ['124', '076', '036']) assert.equal(sponsorMinimum(id), 8000);
  assert.equal(sponsorMinimum('250'), 6000);
  assert.ok(
    sponsorMinimum('us-hi') < sponsorMinimum('840'),
    'a separate territory does not inherit its parent country premium',
  );
  await advertiser('country-prices', 30000, at);
  await assert.rejects(
    () => placeSponsorFunds('country-prices', 'country-prices', '156', 9999, true, at),
    /100 crédits/,
  );
  assert.equal((await sponsorWallet('country-prices')).balance_cents, 30000);
  await placeSponsorFunds('country-prices', 'country-prices', '470', 200, true, at);
  await assert.rejects(
    () =>
      moveSponsorFunds(
        'country-prices',
        'country-prices',
        '470',
        'country-prices',
        '156',
        200,
        at + 1,
      ),
    /100 crédits/,
  );
  await placeSponsorFunds('country-prices', 'country-prices', '250', 6000, true, at + 1);
  await assert.rejects(
    () =>
      moveSponsorFunds(
        'country-prices',
        'country-prices',
        '250',
        'country-prices',
        '470',
        200,
        at + 2,
      ),
    /60 crédits/,
  );
  assert.equal(
    (await sponsorMarket(at + 2)).find(
      (b) => b.country_id === '250' && b.user_id === 'country-prices',
    )?.winning,
    true,
  );
  await placeSponsorFunds('country-prices', 'country-prices', '250', 100, true, at + DAY);
  const expired = await sponsorMarket(at + SPONSOR_DURATION + 1);
  assert.equal(
    expired.find((b) => b.country_id === '250' && b.user_id === 'country-prices')?.winning,
    false,
  );
});
