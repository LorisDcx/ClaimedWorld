import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSeason, get, run } from '../src/lib/db';
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
function advertiser(id: string, amount: number, at: number) {
  const season = currentSeason();
  run(
    'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
    id,
    id,
    '!',
    '#111111',
    at,
    at,
  );
  run(
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
  run(
    'INSERT INTO sponsor_topups(id,user_id,request_id,amount_cents,checkout_id,created_at) VALUES(?,?,?,?,?,?)',
    `topup-${id}`,
    id,
    `request-${id}`,
    amount,
    `cs-${id}`,
    at,
  );
  creditSponsorTopup(
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

test('advertising placements and unspent wallet survive game season changes', () => {
  const season = currentSeason();
  const placed = season.ends_at - DAY;
  advertiser('continuous', 30000, placed);
  placeSponsorFunds('continuous', 'continuous', '250', 10000, true, placed);
  assert.equal(
    get<{ wallet: number }>('SELECT wallet FROM users WHERE id=?', 'continuous')!.wallet,
    100,
    'paid credits never grant Influence',
  );
  currentSeason(season.ends_at);
  assert.equal(sponsorWallet('continuous').balance_cents, 20000);
  assert.equal(
    sponsorMarket(season.ends_at).find((bid) => bid.country_id === '250')?.id,
    'continuous',
  );
  sponsorMarket(placed + SPONSOR_DURATION);
  assert.equal(sponsorWallet('continuous').balance_cents, 20000);
  assert.equal(
    sponsorMarket(placed + SPONSOR_DURATION).some((bid) => bid.user_id === 'continuous'),
    false,
  );
  base = placed + 100 * DAY;
});

test('an outbid advertiser moves funds without recovering money or refreshing their lifetime', () => {
  const at = base;
  base += 100 * DAY;
  advertiser('move-a', 30000, at);
  advertiser('move-b', 30000, at);
  placeSponsorFunds('move-a', 'move-a', '250', 10000, true, at);
  placeSponsorFunds('move-b', 'move-b', '250', 20000, true, at + 1);
  assert.equal(
    sponsorMarket(at + 1).find((bid) => bid.winning && bid.country_id === '250')!.id,
    'move-b',
  );
  moveSponsorFunds('move-a', 'move-a', '250', 'move-a', '276', 10000, at + 10 * DAY);
  moveSponsorFunds('move-a', 'move-a', '276', 'move-a', '392', 10000, at + 25 * DAY);
  const portfolio = ownSponsoring('move-a', at + 25 * DAY);
  assert.equal(portfolio.wallet.balance_cents, 20000);
  assert.equal(portfolio.stakes.length, 1);
  assert.equal(portfolio.stakes[0].expires_at, at + SPONSOR_DURATION);
  assert.equal(portfolio.stakes[0].placed_at, at);
  assert.equal(portfolio.stakes[0].country_id, '392');
  assert.equal(ownSponsoring('move-a', at + SPONSOR_DURATION).stakes.length, 0);
  assert.equal(sponsorWallet('move-a').balance_cents, 20000);
  sponsorMarket(at + SPONSOR_DURATION + 1);
  assert.equal(
    Number(
      get(
        'SELECT COUNT(*) AS n FROM sponsor_ledger WHERE user_id=? AND kind=?',
        'move-a',
        'expire',
      )!.n,
    ),
    1,
  );
});

test('partial transfers preserve each original deadline and newer funds expire independently', () => {
  const at = base;
  base += 100 * DAY;
  advertiser('tranches', 10000, at);
  placeSponsorFunds('tranches', 'tranches', '250', 1000, true, at);
  placeSponsorFunds('tranches', 'tranches', '250', 500, true, at + 15 * DAY);
  moveSponsorFunds('tranches', 'tranches', '250', 'tranches', '276', 500, at + 20 * DAY);
  const before = ownSponsoring('tranches', at + 20 * DAY);
  assert.equal(before.stakes.length, 3);
  assert.equal(
    before.stakes.find((stake) => stake.country_id === '276')!.expires_at,
    at + 30 * DAY,
  );
  const after = ownSponsoring('tranches', at + 30 * DAY);
  assert.equal(after.stakes.length, 1);
  assert.equal(after.stakes[0].country_id, '250');
  assert.equal(after.stakes[0].amount_cents, 500);
  assert.equal(after.stakes[0].expires_at, at + 45 * DAY);
  assert.equal(after.wallet.balance_cents, 8500);
});

test('minimum bids, consent, campaign ownership and no wallet-return transfers are enforced atomically', () => {
  const at = base;
  base += 100 * DAY;
  advertiser('guard-a', 2000, at);
  advertiser('guard-b', 2000, at);
  assert.throws(() => placeSponsorFunds('guard-a', 'guard-a', '250', 499, true, at));
  assert.throws(() => placeSponsorFunds('guard-a', 'guard-a', '250', 500, false, at));
  assert.equal(sponsorWallet('guard-a').balance_cents, 2000);
  placeSponsorFunds('guard-a', 'guard-a', '250', 1000, true, at);
  assert.throws(() => moveSponsorFunds('guard-b', 'guard-a', '250', 'guard-b', '276', 500, at));
  assert.throws(() => moveSponsorFunds('guard-a', 'guard-a', '250', 'guard-a', 'wallet', 1000, at));
  assert.throws(() => moveSponsorFunds('guard-a', 'guard-a', '250', 'guard-a', '276', 600, at));
  assert.equal(ownSponsoring('guard-a', at).stakes[0].amount_cents, 1000);
  assert.equal(sponsorWallet('guard-a').balance_cents, 1000);
  run("UPDATE sponsors SET status='rejected' WHERE id=?", 'guard-b');
  assert.throws(() => placeSponsorFunds('guard-b', 'guard-b', '276', 500, true, at));
});

test('incumbent ties remain stable as old funding tranches expire', () => {
  const at = base;
  base += 100 * DAY;
  advertiser('tie-a', 3000, at);
  advertiser('tie-b', 3000, at);
  placeSponsorFunds('tie-a', 'tie-a', '250', 500, true, at);
  placeSponsorFunds('tie-a', 'tie-a', '250', 500, true, at + DAY);
  placeSponsorFunds('tie-b', 'tie-b', '250', 500, true, at + DAY + 1);
  assert.equal(
    sponsorMarket(at + 30 * DAY).find((bid) => bid.winning && bid.country_id === '250')!.id,
    'tie-a',
  );
  assert.equal(
    sponsorMarket(at + 31 * DAY).find((bid) => bid.winning && bid.country_id === '250')!.id,
    'tie-b',
  );
});
