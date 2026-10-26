import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSeason, get, run } from '../src/lib/db';
import {
  creditSponsorTopup,
  freezeSponsorAccount,
  ownSponsoring,
  placeSponsorFunds,
  refundSponsorTopup,
  sponsorMarket,
  sponsorWallet,
} from '../src/lib/sponsoring';
import { sponsorEnvironmentQuery, sponsorFinancialTables } from '../src/lib/sponsor-environment';
import { postgresQuery } from '../src/lib/storage';
process.env.DATABASE_PATH = ':memory:';

test('financial SQL routes identifiers without rewriting values, literals or game tables', () => {
  const original = process.env.STRIPE_SECRET_KEY;
  try {
    process.env.STRIPE_SECRET_KEY = 'sk_live_isolation_unit_only';
    for (const name of sponsorFinancialTables) {
      const sql = `SELECT '${name}' AS label FROM ${name} WHERE id=?`;
      assert.equal(
        sponsorEnvironmentQuery(sql),
        `SELECT '${name}' AS label FROM live_${name} WHERE id=?`,
      );
      assert.equal(
        postgresQuery(sql),
        `SELECT '${name}' AS label FROM game.live_${name} WHERE id=$1`,
      );
    }
    assert.equal(
      sponsorEnvironmentQuery('SELECT * FROM users JOIN sponsors ON users.id=sponsors.user_id'),
      'SELECT * FROM users JOIN sponsors ON users.id=sponsors.user_id',
    );
    process.env.STRIPE_SECRET_KEY = 'sk_test_isolation_unit_only';
    assert.equal(
      postgresQuery('SELECT * FROM sponsor_wallets'),
      'SELECT * FROM game.sponsor_wallets',
    );
  } finally {
    if (original === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = original;
  }
});

test('live funds, placements, refunds and disputes stay independent from the preserved test register', async () => {
  const original = process.env.STRIPE_SECRET_KEY;
  try {
    process.env.STRIPE_SECRET_KEY = 'sk_test_isolation_unit_only';
    const at = Date.now(),
      season = await currentSeason();
    await run(
      'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
      'isolation-player',
      'IsolationPlayer',
      '!',
      '#111111',
      at,
      at,
    );
    await run(
      "INSERT INTO sponsors(id,user_id,country_id,season_id,name,description,url,initials,color,amount,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'approved',?)",
      'isolation-ad',
      'isolation-player',
      '262',
      season.id,
      'Isolation Ad',
      'Test',
      'https://example.com',
      'AD',
      '#111111',
      0,
      at,
    );
    const topup = async () => {
      await run(
        'INSERT INTO sponsor_topups(id,user_id,request_id,amount_cents,checkout_id,created_at) VALUES(?,?,?,?,?,?)',
        'identical-topup-id',
        'isolation-player',
        'identical-request-id',
        1000,
        'identical-checkout-id',
        at,
      );
      await creditSponsorTopup(
        {
          topupId: 'identical-topup-id',
          userId: 'isolation-player',
          checkoutId: 'identical-checkout-id',
          paymentIntent: 'identical-intent-id',
          amount: 1000,
          currency: 'eur',
          eventId: 'identical-event-id',
        },
        at,
      );
    };
    await topup();
    await placeSponsorFunds('isolation-player', 'isolation-ad', '262', 500, true, at);
    assert.equal((await sponsorWallet('isolation-player')).balance_cents, 500);
    assert.equal((await sponsorMarket(at))[0].amount, 500);

    process.env.STRIPE_SECRET_KEY = 'sk_live_isolation_unit_only';
    assert.equal((await sponsorWallet('isolation-player')).balance_cents, 0);
    assert.deepEqual(await sponsorMarket(at), []);
    const empty = await ownSponsoring('isolation-player', at);
    assert.equal(empty.campaigns.length, 1);
    assert.equal(empty.stakes.length, 0);
    assert.equal(empty.ledger.length, 0);
    assert.equal(
      await get('SELECT * FROM sponsor_topups WHERE id=?', 'identical-topup-id'),
      undefined,
    );
    await assert.rejects(
      () => placeSponsorFunds('isolation-player', 'isolation-ad', '262', 500, true, at),
      /insuffisant/,
    );
    await topup();
    await placeSponsorFunds('isolation-player', 'isolation-ad', '262', 500, true, at);
    assert.equal((await sponsorMarket(at))[0].amount, 500);
    await freezeSponsorAccount('identical-intent-id', 'live-dispute', at);
    assert.equal((await sponsorWallet('isolation-player')).frozen, 1);
    await refundSponsorTopup(
      'identical-intent-id',
      'identical-topup-id',
      1000,
      1000,
      'live-refund',
      at,
    );
    assert.equal((await sponsorWallet('isolation-player')).balance_cents, 0);

    process.env.STRIPE_SECRET_KEY = 'sk_test_isolation_unit_only';
    assert.equal((await sponsorWallet('isolation-player')).balance_cents, 500);
    assert.equal((await sponsorWallet('isolation-player')).frozen, 0);
    const preserved = await ownSponsoring('isolation-player', at);
    assert.equal(preserved.stakes[0].amount_cents, 500);
    assert.equal(preserved.bids[0].winning, true);
    assert.equal(
      preserved.ledger.some((entry) => entry.kind === 'refund'),
      false,
    );
    assert.equal(await get('SELECT * FROM sponsor_disputes'), undefined);
  } finally {
    if (original === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = original;
  }
});
