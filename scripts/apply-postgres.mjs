import nextEnv from '@next/env';
import postgres from 'postgres';
import { readdirSync, readFileSync } from 'node:fs';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url || url.includes('[YOUR-PASSWORD]'))
  throw new Error('Configurez DATABASE_URL dans .env.local.');
const sql = postgres(url, { prepare: false, max: 1, ssl: 'require' });
try {
  await sql.begin(async (tx) => {
    await tx.unsafe('SELECT pg_advisory_xact_lock(48923101)');
    await tx.unsafe(
      'CREATE SCHEMA IF NOT EXISTS game; CREATE TABLE IF NOT EXISTS game.deployment_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const name of readdirSync('supabase/migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      const applied = await tx`SELECT name FROM game.deployment_migrations WHERE name=${name}`;
      if (applied.length) continue;
      await tx.unsafe(readFileSync(`supabase/migrations/${name}`, 'utf8'));
      await tx`INSERT INTO game.deployment_migrations(name) VALUES(${name})`;
      console.log(`Migration appliquée : ${name}`);
    }
  });
  const tables =
    await sql`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='game'`;
  console.log(`Schéma vérifié : ${tables[0].n} tables privées.`);
} catch (error) {
  console.error(`Migration interrompue (${error.code || error.name}). Aucun secret affiché.`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
