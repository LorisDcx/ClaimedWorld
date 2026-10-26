import nextEnv from '@next/env';
import Stripe from 'stripe';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const key = process.env.STRIPE_SECRET_KEY;
if (!key?.startsWith('sk_test_'))
  throw new Error('Cette commande accepte uniquement une clé Stripe de test.');
const stripe = new Stripe(key);
const url = 'https://claimed-world.vercel.app/api/webhooks/stripe';
try {
  const matching = (await stripe.webhookEndpoints.list({ limit: 100 })).data.filter(
    (e) => e.url === url && !e.disabled,
  );
  let endpoint;
  if (matching.length) {
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      throw new Error(
        'Un webhook existe déjà pour ce site ; son secret doit être renseigné avant de continuer.',
      );
    endpoint = matching[0];
  } else {
    endpoint = await stripe.webhookEndpoints.create({
      url,
      description: 'CLAIMED.WORLD — confirmations sponsor en mode test',
      enabled_events: [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'charge.refunded',
        'charge.dispute.created',
        'charge.dispute.closed',
      ],
    });
    if (!endpoint.secret || endpoint.livemode)
      throw new Error('Configuration de test non confirmée.');
    let file = readFileSync('.env.local', 'utf8');
    const setting = `STRIPE_WEBHOOK_SECRET=${endpoint.secret}`;
    file = /^STRIPE_WEBHOOK_SECRET=.*$/m.test(file)
      ? file.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, setting)
      : `${file}\n${setting}\n`;
    writeFileSync('.env.local', file);
  }
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    'artifacts/stripe-test-setup.json',
    JSON.stringify(
      { id: endpoint.id, url, livemode: endpoint.livemode, events: endpoint.enabled_events },
      null,
      2,
    ),
  );
  console.log(
    'Webhook Stripe test configuré. Secret enregistré uniquement dans .env.local. Aucun paiement créé.',
  );
} catch (error) {
  console.error(`Configuration Stripe interrompue (${error.code || error.type || error.name}).`);
  process.exitCode = 1;
}
