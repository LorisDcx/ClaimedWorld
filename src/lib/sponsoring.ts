import { randomUUID } from 'node:crypto';
import { all, get, run, transaction } from './db';
import type { Sponsor, SponsorBid, SponsorStake } from './types';
import countries from '@/data/countries.json';
import { sponsorMinimum, SPONSOR_BASE_MINIMUM, SPONSOR_MINIMUMS } from './sponsor-pricing';
const countryIds = new Set(countries.map((country) => country.id));

export const SPONSOR_DURATION = 30 * 86400000;
export class SponsorError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function ensure(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new SponsorError(message, status);
}
function cents(amount: number) {
  ensure(Number.isSafeInteger(amount) && amount > 0 && amount <= 100000000, 'Montant invalide.');
}
async function journal(
  user: string,
  kind: string,
  amount: number,
  delta: number,
  from: string | null,
  to: string | null,
  stake: string | null,
  topup: string | null,
  at: number,
) {
  await run(
    'INSERT INTO sponsor_ledger VALUES(?,?,?,?,?,?,?,?,?,?)',
    randomUUID(),
    user,
    kind,
    amount,
    delta,
    from,
    to,
    stake,
    topup,
    at,
  );
}
export async function sponsorWallet(user: string) {
  await run('INSERT OR IGNORE INTO sponsor_wallets(user_id) VALUES(?)', user);
  return (await get<{ balance_cents: number; debt_cents: number; frozen: number }>(
    'SELECT * FROM sponsor_wallets WHERE user_id=?',
    user,
  ))!;
}
export async function publicSponsorLogo(logoId: string, at = Date.now()) {
  return !!(await get(
    `SELECT s.id FROM sponsors s JOIN sponsor_stakes b ON b.campaign_id=s.id
    WHERE s.logo_id=? AND s.status='approved' AND b.status='active'
    AND b.amount_cents>0 AND b.placed_at<=? AND b.expires_at>? LIMIT 1`,
    logoId,
    at,
    at,
  ));
}
async function approved(user: string, campaign: string) {
  const wallet = await sponsorWallet(user);
  ensure(
    !wallet.frozen && !wallet.debt_cents,
    'Le compte de sponsoring nécessite une vérification.',
    403,
  );
  ensure(
    await get(
      "SELECT id FROM sponsors WHERE id=? AND user_id=? AND status='approved'",
      campaign,
      user,
    ),
    'Un visuel approuvé vous appartenant est requis.',
    403,
  );
  return wallet;
}
async function ranked(at: number, record: boolean): Promise<SponsorBid[]> {
  const bids = await all<SponsorBid & { priority: number }>(
    `SELECT s.id,s.name,s.description,s.url,s.initials,s.color,s.status,s.logo_id,b.country_id,b.user_id,
    SUM(b.amount_cents) AS amount,MIN(b.expires_at) AS nextExpiryAt,MAX(b.changed_at) AS priority
    FROM sponsor_stakes b JOIN sponsors s ON s.id=b.campaign_id JOIN users u ON u.id=b.user_id
    LEFT JOIN sponsor_wallets w ON w.user_id=b.user_id
    WHERE b.status='active' AND b.amount_cents>0 AND b.placed_at<=? AND b.expires_at>? AND s.status='approved' AND u.banned=0 AND COALESCE(w.frozen,0)=0 AND COALESCE(w.debt_cents,0)=0
    GROUP BY b.country_id,b.campaign_id,b.user_id,s.id ORDER BY amount DESC,priority,s.id`,
    at,
    at,
  );
  const incumbents = new Map(
    (await all<{ country_id: string; campaign_id: string }>('SELECT * FROM sponsor_ownership')).map(
      (r) => [r.country_id, r.campaign_id],
    ),
  );
  const winners = new Map<string, string>();
  for (const country of new Set(bids.map((bid) => bid.country_id))) {
    const eligible = bids.filter(
      (bid) => bid.country_id === country && bid.amount >= sponsorMinimum(country),
    );
    if (!eligible.length) continue;
    const top = eligible[0].amount;
    winners.set(
      country,
      eligible.find((bid) => bid.amount === top && bid.id === incumbents.get(country))?.id ||
        eligible[0].id,
    );
  }
  if (record) {
    for (const [country, id] of winners)
      if (incumbents.get(country) !== id)
        await run(
          'INSERT INTO sponsor_ownership VALUES(?,?,?) ON CONFLICT(country_id) DO UPDATE SET campaign_id=excluded.campaign_id,changed_at=excluded.changed_at',
          country,
          id,
          at,
        );
    for (const country of incumbents.keys())
      if (!winners.has(country))
        await run('DELETE FROM sponsor_ownership WHERE country_id=?', country);
  }
  return bids.map((bid) => ({ ...bid, winning: winners.get(bid.country_id) === bid.id }));
}
async function resolve(at: number) {
  const checkpoint = Number(
    (await get('SELECT processed_at FROM sponsor_clock WHERE id=1'))?.processed_at || 0,
  );
  if (at < checkpoint) return ranked(at, false);
  for (const { expires_at } of await all<{ expires_at: number }>(
    "SELECT DISTINCT expires_at FROM sponsor_stakes WHERE status='active' AND expires_at<=? ORDER BY expires_at",
    at,
  )) {
    for (const stake of await all<SponsorStake>(
      "SELECT * FROM sponsor_stakes WHERE status='active' AND expires_at=?",
      expires_at,
    )) {
      await run("UPDATE sponsor_stakes SET status='expired' WHERE id=?", stake.id);
      await journal(
        stake.user_id,
        'expire',
        stake.amount_cents,
        0,
        stake.country_id,
        null,
        stake.id,
        null,
        expires_at,
      );
    }
    await ranked(expires_at, true);
  }
  const bids = await ranked(at, true);
  await run(
    'INSERT INTO sponsor_clock VALUES(1,?) ON CONFLICT(id) DO UPDATE SET processed_at=excluded.processed_at',
    at,
  );
  return bids;
}
// Network calls to Stripe never take place under a game database lock.
export async function sponsorMarket(at = Date.now()) {
  return transaction(() => resolve(at));
}

export async function placeSponsorFunds(
  user: string,
  campaign: string,
  country: string,
  amount: number,
  accepted: boolean,
  at = Date.now(),
) {
  cents(amount);
  ensure(countryIds.has(country), 'Territoire inconnu.');
  ensure(
    accepted === true,
    'Confirmez que les crédits engagés ne reviennent pas au portefeuille et expirent après 30 jours.',
  );
  return transaction(async () => {
    await resolve(at);
    const wallet = await approved(user, campaign);
    const existing = Number(
      (
        await get(
          "SELECT COALESCE(SUM(amount_cents),0) AS n FROM sponsor_stakes WHERE user_id=? AND campaign_id=? AND country_id=? AND status='active' AND expires_at>?",
          user,
          campaign,
          country,
          at,
        )
      )?.n || 0,
    );
    ensure(
      existing + amount >= sponsorMinimum(country),
      `L’enchère de ce pays commence à ${sponsorMinimum(country) / 100} crédits (${sponsorMinimum(country) / 100} €).`,
    );
    ensure(wallet.balance_cents >= amount, 'Solde de crédits sponsor insuffisant.');
    await run(
      'UPDATE sponsor_wallets SET balance_cents=balance_cents-? WHERE user_id=?',
      amount,
      user,
    );
    const id = randomUUID();
    await run(
      'INSERT INTO sponsor_stakes VALUES(?,?,?,?,?,?,?,?,?,?)',
      id,
      user,
      campaign,
      country,
      amount,
      at,
      at + SPONSOR_DURATION,
      at,
      'active',
      id,
    );
    await run("UPDATE sponsors SET payment_status='paid' WHERE id=?", campaign);
    await journal(user, 'place', amount, -amount, null, country, id, null, at);
    return resolve(at);
  });
}

export async function moveSponsorFunds(
  user: string,
  sourceCampaign: string,
  source: string,
  campaign: string,
  destination: string,
  amount: number,
  at = Date.now(),
) {
  cents(amount);
  ensure(countryIds.has(source) && countryIds.has(destination), 'Territoire inconnu.');
  ensure(
    source !== destination || sourceCampaign !== campaign,
    'Choisissez une autre destination ou un autre visuel.',
  );
  return transaction(async () => {
    await resolve(at);
    await approved(user, campaign);
    const lots = await all<SponsorStake>(
      "SELECT * FROM sponsor_stakes WHERE user_id=? AND campaign_id=? AND country_id=? AND status='active' AND expires_at>? AND amount_cents>0 ORDER BY expires_at,id",
      user,
      sourceCampaign,
      source,
      at,
    );
    const available = lots.reduce((sum, lot) => sum + lot.amount_cents, 0);
    ensure(available >= amount, 'Ces fonds ne sont pas disponibles ou ont expiré.');
    ensure(
      available === amount || available - amount >= sponsorMinimum(source),
      `Laissez zéro ou au moins ${sponsorMinimum(source) / 100} crédits sur le pays de départ.`,
    );
    const existing = Number(
      (
        await get(
          "SELECT COALESCE(SUM(amount_cents),0) AS n FROM sponsor_stakes WHERE user_id=? AND campaign_id=? AND country_id=? AND status='active' AND expires_at>?",
          user,
          campaign,
          destination,
          at,
        )
      )?.n || 0,
    );
    ensure(
      existing + amount >= sponsorMinimum(destination),
      `La destination doit atteindre au moins ${sponsorMinimum(destination) / 100} crédits.`,
    );
    let remaining = amount;
    for (const lot of lots) {
      const moved = Math.min(remaining, lot.amount_cents);
      if (moved === lot.amount_cents)
        await run(
          'UPDATE sponsor_stakes SET country_id=?,campaign_id=?,changed_at=? WHERE id=?',
          destination,
          campaign,
          at,
          lot.id,
        );
      else {
        await run(
          'UPDATE sponsor_stakes SET amount_cents=amount_cents-?,changed_at=? WHERE id=?',
          moved,
          at,
          lot.id,
        );
        await run(
          'INSERT INTO sponsor_stakes VALUES(?,?,?,?,?,?,?,?,?,?)',
          randomUUID(),
          user,
          campaign,
          destination,
          moved,
          lot.placed_at,
          lot.expires_at,
          at,
          'active',
          lot.origin_id,
        );
      }
      await journal(user, 'move', moved, 0, source, destination, lot.id, null, at);
      remaining -= moved;
      if (!remaining) break;
    }
    await run("UPDATE sponsors SET payment_status='paid' WHERE id=?", campaign);
    return resolve(at);
  });
}

export async function ownSponsoring(user: string, at = Date.now()) {
  return transaction(async () => {
    const market = await resolve(at);
    return {
      wallet: await sponsorWallet(user),
      minimumBidCents: SPONSOR_BASE_MINIMUM,
      minimumBids: SPONSOR_MINIMUMS,
      campaigns: await all<Sponsor>(
        'SELECT * FROM sponsors WHERE user_id=? ORDER BY created_at DESC',
        user,
      ),
      stakes: await all<SponsorStake>(
        "SELECT * FROM sponsor_stakes WHERE user_id=? AND status='active' AND amount_cents>0 AND expires_at>? ORDER BY expires_at,id",
        user,
        at,
      ),
      bids: market,
      ledger: await all(
        'SELECT * FROM sponsor_ledger WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100',
        user,
      ),
    };
  });
}

export async function creditSponsorTopup(
  payment: {
    topupId: string;
    userId: string;
    checkoutId: string;
    paymentIntent: string;
    amount: number;
    currency: string;
    eventId: string;
  },
  at = Date.now(),
) {
  return transaction(async () => {
    if (await get('SELECT id FROM webhook_events WHERE id=?', payment.eventId)) return;
    const topup = await get<{
      user_id: string;
      amount_cents: number;
      checkout_id: string;
      credited_at: number | null;
      refunded_cents: number;
      payment_intent: string | null;
    }>('SELECT * FROM sponsor_topups WHERE id=?', payment.topupId);
    ensure(
      topup &&
        topup.user_id === payment.userId &&
        topup.checkout_id === payment.checkoutId &&
        topup.amount_cents === payment.amount &&
        payment.currency === 'eur' &&
        !!payment.paymentIntent,
      'Le paiement ne correspond pas à la recharge.',
    );
    ensure(
      !topup.payment_intent || topup.payment_intent === payment.paymentIntent,
      'Identifiant de paiement incohérent.',
    );
    if (topup.credited_at === null) {
      const wallet = await sponsorWallet(topup.user_id);
      const net = Math.max(0, topup.amount_cents - topup.refunded_cents);
      const debtPaid = Math.min(net, wallet.debt_cents);
      await run(
        'UPDATE sponsor_wallets SET balance_cents=balance_cents+?,debt_cents=debt_cents-? WHERE user_id=?',
        net - debtPaid,
        debtPaid,
        topup.user_id,
      );
      await run(
        'UPDATE sponsor_topups SET status=?,credited_at=?,payment_intent=? WHERE id=?',
        net === topup.amount_cents ? 'credited' : net ? 'partially_refunded' : 'refunded',
        at,
        payment.paymentIntent,
        payment.topupId,
      );
      await journal(
        topup.user_id,
        'credit',
        net,
        net - debtPaid,
        null,
        null,
        null,
        payment.topupId,
        at,
      );
      if (
        await get(
          "SELECT payment_intent FROM sponsor_disputes WHERE payment_intent=? AND status IN ('open','lost')",
          payment.paymentIntent,
        )
      )
        await run('UPDATE sponsor_wallets SET frozen=1 WHERE user_id=?', topup.user_id);
    }
    await run('INSERT INTO webhook_events VALUES(?,?)', payment.eventId, at);
  });
}

export async function refundSponsorTopup(
  paymentIntent: string,
  topupId: string | undefined,
  refunded: number,
  charged: number,
  eventId: string,
  at = Date.now(),
) {
  return transaction(async () => {
    if (await get('SELECT id FROM webhook_events WHERE id=?', eventId)) return;
    const byIntent = await get<{
      id: string;
      user_id: string;
      amount_cents: number;
      refunded_cents: number;
      credited_at: number | null;
    }>('SELECT * FROM sponsor_topups WHERE payment_intent=?', paymentIntent);
    const topup =
      byIntent ||
      (await get<NonNullable<typeof byIntent>>(
        'SELECT * FROM sponsor_topups WHERE id=? AND payment_intent IS NULL',
        topupId || '',
      ));
    if (!topup) return; // A charge belonging to another product is not a credit purchase.
    ensure(!topupId || topupId === topup.id, 'Le remboursement ne correspond pas à la recharge.');
    ensure(
      Number.isSafeInteger(refunded) &&
        refunded >= 0 &&
        refunded <= topup.amount_cents &&
        charged === topup.amount_cents,
      'Remboursement incohérent.',
    );
    const delta = Math.max(0, refunded - topup.refunded_cents);
    if (delta && topup.credited_at !== null) {
      await resolve(at);
      const wallet = await sponsorWallet(topup.user_id);
      const fromWallet = Math.min(delta, wallet.balance_cents);
      await run(
        'UPDATE sponsor_wallets SET balance_cents=balance_cents-? WHERE user_id=?',
        fromWallet,
        topup.user_id,
      );
      let remaining = delta - fromWallet;
      for (const stake of await all<SponsorStake>(
        "SELECT * FROM sponsor_stakes WHERE user_id=? AND status='active' AND amount_cents>0 ORDER BY expires_at,id",
        topup.user_id,
      )) {
        const removed = Math.min(remaining, stake.amount_cents);
        await run(
          'UPDATE sponsor_stakes SET amount_cents=amount_cents-? WHERE id=?',
          removed,
          stake.id,
        );
        remaining -= removed;
        if (!remaining) break;
      }
      if (remaining)
        await run(
          'UPDATE sponsor_wallets SET debt_cents=debt_cents+? WHERE user_id=?',
          remaining,
          topup.user_id,
        );
      await journal(topup.user_id, 'refund', delta, -fromWallet, null, null, null, topup.id, at);
      await resolve(at);
    }
    await run(
      "UPDATE sponsor_topups SET refunded_cents=MAX(refunded_cents,?),payment_intent=COALESCE(payment_intent,?),status=CASE WHEN credited_at IS NULL THEN status WHEN ?>=amount_cents THEN 'refunded' WHEN ?>0 THEN 'partially_refunded' ELSE status END WHERE id=?",
      refunded,
      paymentIntent,
      refunded,
      refunded,
      topup.id,
    );
    await run('INSERT INTO webhook_events VALUES(?,?)', eventId, at);
  });
}

export async function freezeSponsorAccount(
  paymentIntent: string,
  eventId: string,
  at = Date.now(),
) {
  await transaction(async () => {
    if (await get('SELECT id FROM webhook_events WHERE id=?', eventId)) return;
    await run(
      'INSERT OR IGNORE INTO sponsor_disputes(payment_intent,event_id,created_at) VALUES(?,?,?)',
      paymentIntent,
      eventId,
      at,
    );
    const topup = await get<{ user_id: string }>(
      'SELECT user_id FROM sponsor_topups WHERE payment_intent=?',
      paymentIntent,
    );
    if (
      topup &&
      (await get(
        "SELECT payment_intent FROM sponsor_disputes WHERE payment_intent=? AND status IN ('open','lost')",
        paymentIntent,
      ))
    ) {
      await sponsorWallet(topup.user_id);
      await run('UPDATE sponsor_wallets SET frozen=1 WHERE user_id=?', topup.user_id);
      await resolve(at);
    }
    await run('INSERT INTO webhook_events VALUES(?,?)', eventId, at);
  });
}
export async function closeSponsorDispute(
  paymentIntent: string,
  won: boolean,
  eventId: string,
  at = Date.now(),
) {
  await transaction(async () => {
    if (await get('SELECT id FROM webhook_events WHERE id=?', eventId)) return;
    await run(
      'INSERT INTO sponsor_disputes VALUES(?,?,?,?) ON CONFLICT(payment_intent) DO UPDATE SET status=excluded.status,event_id=excluded.event_id',
      paymentIntent,
      eventId,
      won ? 'won' : 'lost',
      at,
    );
    const topup = await get<{ user_id: string }>(
      'SELECT user_id FROM sponsor_topups WHERE payment_intent=?',
      paymentIntent,
    );
    if (
      topup &&
      won &&
      !(await get(
        "SELECT d.payment_intent FROM sponsor_disputes d JOIN sponsor_topups t ON t.payment_intent=d.payment_intent WHERE t.user_id=? AND d.status IN ('open','lost')",
        topup.user_id,
      ))
    )
      await run('UPDATE sponsor_wallets SET frozen=0 WHERE user_id=?', topup.user_id);
    await resolve(at);
    await run('INSERT INTO webhook_events VALUES(?,?)', eventId, at);
  });
}
