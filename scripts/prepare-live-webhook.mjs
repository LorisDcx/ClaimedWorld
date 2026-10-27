import nextEnv from '@next/env';
import Stripe from 'stripe';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
process.loadEnvFile('.env.live.local');
const position = process.argv.indexOf('--app-url');
const base = position >= 0 ? process.argv[position + 1] : process.env.NEXT_PUBLIC_APP_URL;
const events = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
];
try {
  if (!base || new URL(base).protocol !== 'https:') throw new Error('HTTPS_APP_URL_REQUIRED');
  if (!/^(?:sk|rk)_live_/.test(process.env.STRIPE_LIVE_SECRET_KEY || ''))
    throw new Error('LIVE_KEY_REQUIRED');
  const stripe = new Stripe(process.env.STRIPE_LIVE_SECRET_KEY);
  const account = await stripe.accounts.retrieve();
  if (!account.charges_enabled || !account.payouts_enabled || !account.details_submitted)
    throw new Error('ACCOUNT_NOT_READY');
  const url = new URL('/api/webhooks/stripe', base).href;
  let existing;
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 }))
    if (endpoint.url === url && endpoint.livemode) existing = endpoint;
  if (existing) {
    if (!process.env.STRIPE_LIVE_WEBHOOK_SECRET)
      throw new Error('EXISTING_ENDPOINT_SECRET_REQUIRED');
    console.log(JSON.stringify({ webhookId: existing.id, reused: true, live: true }));
  } else {
    const endpoint = await stripe.webhookEndpoints.create(
      {
        url,
        enabled_events: events,
        api_version: Stripe.API_VERSION,
        description: 'CLAIMED.WORLD — sponsoring réel',
        metadata: { project: 'claimed-world', environment: 'live' },
      },
      { idempotencyKey: `claimed-world-live-webhook-${Stripe.API_VERSION}` },
    );
    const privateFile = '.env.live.local';
    let contents = readFileSync(privateFile, 'utf8');
    const line = `STRIPE_LIVE_WEBHOOK_SECRET=${endpoint.secret}`;
    contents = /^STRIPE_LIVE_WEBHOOK_SECRET=.*$/m.test(contents)
      ? contents.replace(/^STRIPE_LIVE_WEBHOOK_SECRET=.*$/m, line)
      : `${contents.trimEnd()}\n${line}\n`;
    writeFileSync(`${privateFile}.tmp`, contents, { mode: 0o600 });
    renameSync(`${privateFile}.tmp`, privateFile);
    console.log(
      JSON.stringify({
        webhookId: endpoint.id,
        live: endpoint.livemode,
        secretSavedPrivately: true,
        eventCount: events.length,
        apiVersion: endpoint.api_version,
      }),
    );
  }
} catch (error) {
  const known = [
    'HTTPS_APP_URL_REQUIRED',
    'LIVE_KEY_REQUIRED',
    'ACCOUNT_NOT_READY',
    'EXISTING_ENDPOINT_SECRET_REQUIRED',
  ];
  console.error(
    `Configuration interrompue (${known.includes(error.message) ? error.message : error.code || error.type || error.name}). Aucun secret affiché.`,
  );
  process.exitCode = 1;
}
