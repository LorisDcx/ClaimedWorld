import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { currentSeason, get, run } from '../src/lib/db';
import { placeSponsorFunds, sponsorMarket, sponsorWallet } from '../src/lib/sponsoring';
import { POST } from '../src/app/api/webhooks/stripe/route';
process.env.DATABASE_PATH = ':memory:';
process.env.STRIPE_SECRET_KEY = 'sk_test_local_signature_verification_only';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_local_test_only';
async function setup(id: string) {
  const season = await currentSeason(),
    now = Date.now();
  await run(
    'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
    id,
    id,
    '!',
    '#111111',
    now,
    now,
  );
  await run(
    "INSERT INTO sponsors(id,user_id,country_id,season_id,name,description,url,initials,color,amount,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'approved',?)",
    id,
    id,
    '250',
    season.id,
    id,
    'Advertiser',
    'https://example.com',
    'AD',
    '#111111',
    0,
    now,
  );
  await run(
    'INSERT INTO sponsor_topups(id,user_id,request_id,amount_cents,checkout_id,created_at) VALUES(?,?,?,?,?,?)',
    id,
    id,
    id,
    1000,
    `cs-${id}`,
    now,
  );
}
async function send(id: string, type: string, object: Record<string, unknown>, invalid = false) {
  const payload = JSON.stringify({ id, object: 'event', type, livemode: false, data: { object } });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': invalid ? 'bad' : signature },
      body: payload,
    }),
  );
}
function paid(id: string, amount = 1000) {
  return {
    id: `cs-${id}`,
    object: 'checkout.session',
    payment_status: 'paid',
    payment_intent: `pi-${id}`,
    amount_total: amount,
    currency: 'eur',
    metadata: { kind: 'sponsor_topup', topup_id: id, user_id: id },
  };
}

test('Stripe credits only verified matching payments, once per purchase even with different event IDs', async () => {
  await setup('buyer');
  assert.equal((await send('bad', 'checkout.session.completed', paid('buyer'), true)).status, 400);
  assert.equal((await sponsorWallet('buyer')).balance_cents, 0);
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(
      (await send('wrong', 'checkout.session.completed', paid('buyer', 900))).status,
      500,
    );
    assert.equal(
      (
        await send('wrong-user', 'checkout.session.completed', {
          ...paid('buyer'),
          metadata: { kind: 'sponsor_topup', topup_id: 'buyer', user_id: 'other' },
        })
      ).status,
      500,
    );
  } finally {
    console.error = original;
  }
  assert.equal((await sponsorWallet('buyer')).balance_cents, 0);
  assert.equal((await send('paid', 'checkout.session.completed', paid('buyer'))).status, 200);
  assert.equal((await send('paid', 'checkout.session.completed', paid('buyer'))).status, 200);
  assert.equal(
    (await send('duplicate-session', 'checkout.session.completed', paid('buyer'))).status,
    200,
  );
  assert.equal((await sponsorWallet('buyer')).balance_cents, 1000);
  assert.equal(
    Number(
      (await get(
        'SELECT COUNT(*) AS n FROM sponsor_ledger WHERE user_id=? AND kind=?',
        'buyer',
        'credit',
      ))!.n,
    ),
    1,
  );
  assert.equal(
    (await get<{ wallet: number }>('SELECT wallet FROM users WHERE id=?', 'buyer'))!.wallet,
    100,
  );
});

test('refunds debit unused credits and active stakes without resurrecting money on duplicate delivery', async () => {
  await placeSponsorFunds('buyer', 'buyer', '470', 500, true);
  const refund = {
    id: 'charge-buyer',
    object: 'charge',
    payment_intent: 'pi-buyer',
    amount: 1000,
    amount_refunded: 1000,
    currency: 'eur',
    metadata: { topup_id: 'buyer' },
  };
  assert.equal((await send('refund', 'charge.refunded', refund)).status, 200);
  assert.equal((await send('refund-again', 'charge.refunded', refund)).status, 200);
  assert.equal((await sponsorWallet('buyer')).balance_cents, 0);
  assert.equal((await sponsorWallet('buyer')).debt_cents, 0);
  assert.equal(
    (await sponsorMarket()).some((bid) => bid.user_id === 'buyer'),
    false,
  );
  await send('paid-after-refund', 'checkout.session.completed', paid('buyer'));
  assert.equal((await sponsorWallet('buyer')).balance_cents, 0);
});

test('a valid signature cannot credit a webhook from the other Stripe environment', async () => {
  const before = (await sponsorWallet('buyer')).balance_cents;
  const payload = JSON.stringify({
    id: 'evt_wrong_environment',
    object: 'event',
    type: 'checkout.session.completed',
    livemode: true,
    data: { object: paid('buyer') },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  const response = await POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body: payload,
    }),
  );
  assert.equal(response.status, 400);
  assert.equal((await sponsorWallet('buyer')).balance_cents, before);
});

test('out-of-order refund and dispute events are respected when payment confirmation arrives later', async () => {
  await setup('late');
  await send('early-refund', 'charge.refunded', {
    id: 'charge-late',
    payment_intent: 'pi-late',
    amount: 1000,
    amount_refunded: 500,
    currency: 'eur',
    metadata: { topup_id: 'late' },
  });
  await send('early-dispute', 'charge.dispute.created', {
    id: 'dispute-late',
    payment_intent: 'pi-late',
  });
  await send('late-paid', 'checkout.session.completed', paid('late'));
  assert.equal((await sponsorWallet('late')).balance_cents, 500);
  assert.equal((await sponsorWallet('late')).frozen, 1);
  await assert.rejects(() => placeSponsorFunds('late', 'late', '470', 500, true));
  await send('dispute-won', 'charge.dispute.closed', {
    id: 'dispute-late',
    payment_intent: 'pi-late',
    status: 'won',
  });
  assert.equal((await sponsorWallet('late')).frozen, 0);
  await placeSponsorFunds('late', 'late', '470', 500, true);
  assert.equal((await sponsorWallet('late')).balance_cents, 0);
});
