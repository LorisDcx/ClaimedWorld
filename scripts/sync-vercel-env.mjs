import nextEnv from '@next/env';
import { execFileSync } from 'node:child_process';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const values = {
  DATABASE_URL: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  ENABLE_PAYMENTS: 'true',
  NEXT_PUBLIC_APP_URL: 'https://claimed-world.vercel.app',
};
if (!values.STRIPE_SECRET_KEY?.startsWith('sk_test_'))
  throw new Error('Cette configuration de lancement autorise uniquement Stripe test.');
for (const [name, value] of Object.entries(values)) {
  if (!value) throw new Error(`${name} doit être configuré.`);
  const kind =
    name.startsWith('NEXT_PUBLIC_') || name === 'ENABLE_PAYMENTS'
      ? '--no-sensitive'
      : '--sensitive';
  const command = `npx --yes vercel@65.3.1 env add ${name} --environment production --force ${kind} --yes --project claimed-world --scope lorisds-projects-ad5036e6`;
  try {
    // Values go through stdin, never into shell commands or process arguments.
    execFileSync('cmd.exe', ['/d', '/s', '/c', command], {
      input: value + '\n',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    console.log(`${name} configuré sur Vercel.`);
  } catch {
    throw new Error(`Configuration de ${name} interrompue. Aucune valeur affichée.`);
  }
}
