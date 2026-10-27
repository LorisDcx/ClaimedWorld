import nextEnv from '@next/env';
import Stripe from 'stripe';
import postgres from 'postgres';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
// Pending credentials are checked only on explicit request. They never alter
// the running app, Vercel configuration, or the launch approval flag.
if (process.argv.includes('--pending')) {
  process.loadEnvFile('.env.live.local');
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_LIVE_SECRET_KEY || '';
  process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_LIVE_WEBHOOK_SECRET || '';
}
const mode = process.env.STRIPE_SECRET_KEY?.match(/^(?:sk|rk)_(test|live)_/)?.[1] || 'missing';
const report = {
  mode,
  accountCanCharge: false,
  accountCanPayOut: false,
  accountDetailsSubmitted: false,
  liveFinancialTablesProtected: false,
  liveWebhookRegistered: false,
  webhookSecretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
  launchApproved: process.env.LIVE_PAYMENT_LAUNCH_APPROVED === 'true',
};
let sql;
try {
  sql = postgres(process.env.DATABASE_URL || process.env.POSTGRES_URL, {
    prepare: false,
    max: 1,
    ssl: 'require',
  });
  const names = [
    'sponsor_wallets',
    'sponsor_topups',
    'sponsor_stakes',
    'sponsor_ownership',
    'sponsor_clock',
    'sponsor_disputes',
    'sponsor_ledger',
    'webhook_events',
  ].map((name) => `live_${name}`);
  const tables =
    await sql`SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='game' AND tablename IN ${sql(names)}`;
  const permissions = (
    await sql`SELECT has_schema_privilege('anon','game','USAGE') AS anonymous_access`
  )[0];
  report.liveFinancialTablesProtected =
    tables.length === names.length &&
    tables.every((t) => t.rowsecurity) &&
    !permissions.anonymous_access;
  if (mode !== 'missing') {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const account = await stripe.accounts.retrieve();
    report.accountCanCharge = !!account.charges_enabled;
    report.accountCanPayOut = !!account.payouts_enabled;
    report.accountDetailsSubmitted = !!account.details_submitted;
    if (mode === 'live') {
      const expected = new URL('/api/webhooks/stripe', process.env.NEXT_PUBLIC_APP_URL).href;
      const events = [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'charge.refunded',
        'charge.dispute.created',
        'charge.dispute.closed',
      ];
      for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
        if (
          endpoint.url === expected &&
          endpoint.status === 'enabled' &&
          endpoint.livemode &&
          (endpoint.enabled_events.includes('*') ||
            events.every((event) => endpoint.enabled_events.includes(event)))
        )
          report.liveWebhookRegistered = true;
      }
    }
  }
  report.configurationChecksPassed =
    mode === 'live' &&
    report.accountCanCharge &&
    report.accountCanPayOut &&
    report.accountDetailsSubmitted &&
    report.liveFinancialTablesProtected &&
    report.liveWebhookRegistered &&
    report.webhookSecretConfigured;
  console.log(JSON.stringify(report));
  if (!report.configurationChecksPassed) process.exitCode = 1;
} catch (error) {
  console.error(
    `Vérification interrompue (${error.code || error.type || error.name}). Aucun secret affiché.`,
  );
  process.exitCode = 1;
} finally {
  if (sql) await sql.end();
}
