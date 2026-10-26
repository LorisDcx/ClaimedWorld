import { randomUUID } from 'node:crypto';
import { all, get, run, transaction } from './db';
import type { Sponsor, SponsorBid, SponsorStake } from './types';
import countries from '@/data/countries.json';
const countryIds = new Set(countries.map((country) => country.id));

export const SPONSOR_MINIMUM = 500; // All monetary values are integer euro cents.
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
function journal(
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
  run(
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
export function sponsorWallet(user: string) {
  run('INSERT OR IGNORE INTO sponsor_wallets(user_id) VALUES(?)', user);
  return get<{ balance_cents: number; debt_cents: number; frozen: number }>(
    'SELECT * FROM sponsor_wallets WHERE user_id=?',
    user,
  )!;
}
function approved(user: string, campaign: string) {
  const wallet = sponsorWallet(user);
  ensure(
    !wallet.frozen && !wallet.debt_cents,
    'Le compte de sponsoring nécessite une vérification.',
    403,
  );
  ensure(
    get("SELECT id FROM sponsors WHERE id=? AND user_id=? AND status='approved'", campaign, user),
    'Un visuel approuvé vous appartenant est requis.',
    403,
  );
  return wallet;
}
function ranked(at: number, record: boolean): SponsorBid[] {
  const bids = all<SponsorBid & { priority: number }>(
    `SELECT s.id,s.name,s.description,s.url,s.initials,s.color,s.status,s.logo_id,b.country_id,b.user_id,
    SUM(b.amount_cents) AS amount,MIN(b.expires_at) AS nextExpiryAt,MAX(b.changed_at) AS priority
    FROM sponsor_stakes b JOIN sponsors s ON s.id=b.campaign_id JOIN users u ON u.id=b.user_id
    LEFT JOIN sponsor_wallets w ON w.user_id=b.user_id
    WHERE b.status='active' AND b.amount_cents>0 AND b.placed_at<=? AND b.expires_at>? AND s.status='approved' AND u.banned=0 AND COALESCE(w.frozen,0)=0 AND COALESCE(w.debt_cents,0)=0
    GROUP BY b.country_id,b.campaign_id ORDER BY amount DESC,priority,s.id`,
    at,
    at,
  );
  const incumbents = new Map(
    all<{ country_id: string; campaign_id: string }>('SELECT * FROM sponsor_ownership').map((r) => [
      r.country_id,
      r.campaign_id,
    ]),
  );
  const winners = new Map<string, string>();
  for (const country of new Set(bids.map((bid) => bid.country_id))) {
    const eligible = bids.filter(
      (bid) => bid.country_id === country && bid.amount >= SPONSOR_MINIMUM,
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
        run(
          'INSERT INTO sponsor_ownership VALUES(?,?,?) ON CONFLICT(country_id) DO UPDATE SET campaign_id=excluded.campaign_id,changed_at=excluded.changed_at',
          country,
          id,
          at,
        );
    for (const country of incumbents.keys())
      if (!winners.has(country)) run('DELETE FROM sponsor_ownership WHERE country_id=?', country);
  }
  return bids.map((bid) => ({ ...bid, winning: winners.get(bid.country_id) === bid.id }));
}
function resolve(at: number) {
  const checkpoint = Number(
    get('SELECT processed_at FROM sponsor_clock WHERE id=1')?.processed_at || 0,
  );
  if (at < checkpoint) return ranked(at, false);
  for (const { expires_at } of all<{ expires_at: number }>(
    "SELECT DISTINCT expires_at FROM sponsor_stakes WHERE status='active' AND expires_at<=? ORDER BY expires_at",
    at,
  )) {
    for (const stake of all<SponsorStake>(
      "SELECT * FROM sponsor_stakes WHERE status='active' AND expires_at=?",
      expires_at,
    )) {
      run("UPDATE sponsor_stakes SET status='expired' WHERE id=?", stake.id);
      journal(
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
    ranked(expires_at, true);
  }
  const bids = ranked(at, true);
  run(
    'INSERT INTO sponsor_clock VALUES(1,?) ON CONFLICT(id) DO UPDATE SET processed_at=excluded.processed_at',
    at,
  );
  return bids;
}
// Transactions are synchronous; the db helper uses savepoints when called from
// a game transaction. No Stripe/network call takes place under a database lock.
export function sponsorMarket(at = Date.now()) {
  return transaction(() => resolve(at));
}

export function placeSponsorFunds(
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
  return transaction(() => {
    resolve(at);
    const wallet = approved(user, campaign);
    const existing = Number(
      get(
        "SELECT COALESCE(SUM(amount_cents),0) AS n FROM sponsor_stakes WHERE user_id=? AND campaign_id=? AND country_id=? AND status='active' AND expires_at>?",
        user,
        campaign,
        country,
        at,
      )?.n || 0,
    );
    ensure(
      existing + amount >= SPONSOR_MINIMUM,
      'Une enchère sur un pays commence à 5 crédits (5 €).',
    );
    ensure(wallet.balance_cents >= amount, 'Solde de crédits sponsor insuffisant.');
    run('UPDATE sponsor_wallets SET balance_cents=balance_cents-? WHERE user_id=?', amount, user);
    const id = randomUUID();
    run(
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
    run("UPDATE sponsors SET payment_status='paid' WHERE id=?", campaign);
    journal(user, 'place', amount, -amount, null, country, id, null, at);
    return resolve(at);
  });
}

export function moveSponsorFunds(
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
  return transaction(() => {
    resolve(at);
    approved(user, campaign);
    const lots = all<SponsorStake>(
      "SELECT * FROM sponsor_stakes WHERE user_id=? AND campaign_id=? AND country_id=? AND status='active' AND expires_at>? AND amount_cents>0 ORDER BY expires_at,id",
      user,
      sourceCampaign,
      source,
      at,
    );
    const available = lots.reduce((sum, lot) => sum + lot.amount_cents, 0);
    ensure(available >= amount, 'Ces fonds ne sont pas disponibles ou ont expiré.');
    ensure(
      available === amount || available - amount >= SPONSOR_MINIMUM,
      'Laissez zéro ou au moins 5 crédits sur le pays de départ.',
    );
    const existing = Number(
      get(
        "SELECT COALESCE(SUM(amount_cents),0) AS n FROM sponsor_stakes WHERE user_id=? AND campaign_id=? AND country_id=? AND status='active' AND expires_at>?",
        user,
        campaign,
        destination,
        at,
      )?.n || 0,
    );
    ensure(
      existing + amount >= SPONSOR_MINIMUM,
      'La destination doit atteindre au moins 5 crédits.',
    );
    let remaining = amount;
    for (const lot of lots) {
      const moved = Math.min(remaining, lot.amount_cents);
      if (moved === lot.amount_cents)
        run(
          'UPDATE sponsor_stakes SET country_id=?,campaign_id=?,changed_at=? WHERE id=?',
          destination,
          campaign,
          at,
          lot.id,
        );
      else {
        run(
          'UPDATE sponsor_stakes SET amount_cents=amount_cents-?,changed_at=? WHERE id=?',
          moved,
          at,
          lot.id,
        );
        run(
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
      journal(user, 'move', moved, 0, source, destination, lot.id, null, at);
      remaining -= moved;
      if (!remaining) break;
    }
    run("UPDATE sponsors SET payment_status='paid' WHERE id=?", campaign);
    return resolve(at);
  });
}

export function ownSponsoring(user: string, at = Date.now()) {
  return transaction(() => {
    const market = resolve(at);
    return {
      wallet: sponsorWallet(user),
      minimumBidCents: SPONSOR_MINIMUM,
      campaigns: all<Sponsor>(
        'SELECT * FROM sponsors WHERE user_id=? ORDER BY created_at DESC',
        user,
      ),
      stakes: all<SponsorStake>(
        "SELECT * FROM sponsor_stakes WHERE user_id=? AND status='active' AND amount_cents>0 AND expires_at>? ORDER BY expires_at,id",
        user,
        at,
      ),
      bids: market,
      ledger: all(
        'SELECT * FROM sponsor_ledger WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100',
        user,
      ),
    };
  });
}

export function creditSponsorTopup(
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
  return transaction(() => {
    if (get('SELECT id FROM webhook_events WHERE id=?', payment.eventId)) return;
    const topup = get<{
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
      const wallet = sponsorWallet(topup.user_id);
      const net = Math.max(0, topup.amount_cents - topup.refunded_cents);
      const debtPaid = Math.min(net, wallet.debt_cents);
      run(
        'UPDATE sponsor_wallets SET balance_cents=balance_cents+?,debt_cents=debt_cents-? WHERE user_id=?',
        net - debtPaid,
        debtPaid,
        topup.user_id,
      );
      run(
        'UPDATE sponsor_topups SET status=?,credited_at=?,payment_intent=? WHERE id=?',
        net === topup.amount_cents ? 'credited' : net ? 'partially_refunded' : 'refunded',
        at,
        payment.paymentIntent,
        payment.topupId,
      );
      journal(topup.user_id, 'credit', net, net - debtPaid, null, null, null, payment.topupId, at);
      if (
        get(
          "SELECT payment_intent FROM sponsor_disputes WHERE payment_intent=? AND status IN ('open','lost')",
          payment.paymentIntent,
        )
      )
        run('UPDATE sponsor_wallets SET frozen=1 WHERE user_id=?', topup.user_id);
    }
    run('INSERT INTO webhook_events VALUES(?,?)', payment.eventId, at);
  });
}

export function refundSponsorTopup(
  paymentIntent: string,
  topupId: string | undefined,
  refunded: number,
  charged: number,
  eventId: string,
  at = Date.now(),
) {
  return transaction(() => {
    if (get('SELECT id FROM webhook_events WHERE id=?', eventId)) return;
    const byIntent = get<{
      id: string;
      user_id: string;
      amount_cents: number;
      refunded_cents: number;
      credited_at: number | null;
    }>('SELECT * FROM sponsor_topups WHERE payment_intent=?', paymentIntent);
    const topup =
      byIntent ||
      get<NonNullable<typeof byIntent>>(
        'SELECT * FROM sponsor_topups WHERE id=? AND payment_intent IS NULL',
        topupId || '',
      );
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
      resolve(at);
      const wallet = sponsorWallet(topup.user_id);
      const fromWallet = Math.min(delta, wallet.balance_cents);
      run(
        'UPDATE sponsor_wallets SET balance_cents=balance_cents-? WHERE user_id=?',
        fromWallet,
        topup.user_id,
      );
      let remaining = delta - fromWallet;
      for (const stake of all<SponsorStake>(
        "SELECT * FROM sponsor_stakes WHERE user_id=? AND status='active' AND amount_cents>0 ORDER BY expires_at,id",
        topup.user_id,
      )) {
        const removed = Math.min(remaining, stake.amount_cents);
        run('UPDATE sponsor_stakes SET amount_cents=amount_cents-? WHERE id=?', removed, stake.id);
        remaining -= removed;
        if (!remaining) break;
      }
      if (remaining)
        run(
          'UPDATE sponsor_wallets SET debt_cents=debt_cents+? WHERE user_id=?',
          remaining,
          topup.user_id,
        );
      journal(topup.user_id, 'refund', delta, -fromWallet, null, null, null, topup.id, at);
      resolve(at);
    }
    run(
      "UPDATE sponsor_topups SET refunded_cents=MAX(refunded_cents,?),payment_intent=COALESCE(payment_intent,?),status=CASE WHEN credited_at IS NULL THEN status WHEN ?>=amount_cents THEN 'refunded' WHEN ?>0 THEN 'partially_refunded' ELSE status END WHERE id=?",
      refunded,
      paymentIntent,
      refunded,
      refunded,
      topup.id,
    );
    run('INSERT INTO webhook_events VALUES(?,?)', eventId, at);
  });
}

export function freezeSponsorAccount(paymentIntent: string, eventId: string, at = Date.now()) {
  transaction(() => {
    if (get('SELECT id FROM webhook_events WHERE id=?', eventId)) return;
    run(
      'INSERT OR IGNORE INTO sponsor_disputes(payment_intent,event_id,created_at) VALUES(?,?,?)',
      paymentIntent,
      eventId,
      at,
    );
    const topup = get<{ user_id: string }>(
      'SELECT user_id FROM sponsor_topups WHERE payment_intent=?',
      paymentIntent,
    );
    if (
      topup &&
      get(
        "SELECT payment_intent FROM sponsor_disputes WHERE payment_intent=? AND status IN ('open','lost')",
        paymentIntent,
      )
    ) {
      sponsorWallet(topup.user_id);
      run('UPDATE sponsor_wallets SET frozen=1 WHERE user_id=?', topup.user_id);
      resolve(at);
    }
    run('INSERT INTO webhook_events VALUES(?,?)', eventId, at);
  });
}
export function closeSponsorDispute(
  paymentIntent: string,
  won: boolean,
  eventId: string,
  at = Date.now(),
) {
  transaction(() => {
    if (get('SELECT id FROM webhook_events WHERE id=?', eventId)) return;
    run(
      'INSERT INTO sponsor_disputes VALUES(?,?,?,?) ON CONFLICT(payment_intent) DO UPDATE SET status=excluded.status,event_id=excluded.event_id',
      paymentIntent,
      eventId,
      won ? 'won' : 'lost',
      at,
    );
    const topup = get<{ user_id: string }>(
      'SELECT user_id FROM sponsor_topups WHERE payment_intent=?',
      paymentIntent,
    );
    if (
      topup &&
      won &&
      !get(
        "SELECT d.payment_intent FROM sponsor_disputes d JOIN sponsor_topups t ON t.payment_intent=d.payment_intent WHERE t.user_id=? AND d.status IN ('open','lost')",
        topup.user_id,
      )
    )
      run('UPDATE sponsor_wallets SET frozen=0 WHERE user_id=?', topup.user_id);
    resolve(at);
    run('INSERT INTO webhook_events VALUES(?,?)', eventId, at);
  });
}
