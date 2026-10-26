import nextEnv from '@next/env';
import postgres from 'postgres';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url || !url.includes('tdlontsoduvmsaxeweam'))
  throw new Error('Cette importation est limitée au nouveau projet CLAIMED.WORLD.');
const original = new DatabaseSync('data/claimed.sqlite', { readOnly: true });
mkdirSync('data/backups', { recursive: true });
const backup = `data/backups/before-cloud-import-${Date.now()}.sqlite`;
original.prepare('VACUUM INTO ?').run(backup);
original.close();
const source = new DatabaseSync(backup, { readOnly: true });
const tables = source
  .prepare(
    "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid",
  )
  .all();
const ordered = [],
  pending = [...tables],
  ready = new Set();
while (pending.length) {
  const index = pending.findIndex((t) =>
    [...t.sql.matchAll(/REFERENCES\s+["`]?([a-z_]+)/gi)].every(
      (m) => ready.has(m[1]) || m[1] === t.name,
    ),
  );
  if (index < 0) throw new Error('Dépendances à vérifier avant importation.');
  const [table] = pending.splice(index, 1);
  ordered.push(table);
  ready.add(table.name);
}
const identifier = (name) => {
  if (!/^[a-z_]+$/.test(name)) throw new Error('Identifiant de table inattendu.');
  return `"${name}"`;
};
const sql = postgres(url, { prepare: false, max: 1, ssl: 'require' });
try {
  await sql.begin(async (tx) => {
    await tx.unsafe('SELECT pg_advisory_xact_lock(48923101)');
    const done = await tx`SELECT id FROM game.schema_migrations WHERE id='cloud-import-v1'`;
    if (done.length) {
      console.log('Les données locales sont déjà importées.');
      return;
    }
    const existing = await tx`SELECT COUNT(*)::int AS n FROM game.users`;
    if (existing[0].n !== 0)
      throw new Error(
        'La destination contient déjà des joueurs : importation arrêtée pour les préserver.',
      );
    for (const { name } of ordered) {
      const columns = source.prepare(`PRAGMA table_info(${identifier(name)})`).all();
      const keys = columns
        .filter((c) => c.pk)
        .sort((a, b) => a.pk - b.pk)
        .map((c) => c.name);
      const changes = columns
        .filter((c) => !keys.includes(c.name))
        .map((c) => `${identifier(c.name)}=EXCLUDED.${identifier(c.name)}`)
        .join(',');
      const rows = source.prepare(`SELECT * FROM ${identifier(name)}`).all();
      for (const row of rows) {
        const values = columns.map((c) => row[c.name]);
        const statement = `INSERT INTO game.${identifier(name)}(${columns.map((c) => identifier(c.name)).join(',')}) VALUES(${values.map((_, i) => '$' + (i + 1)).join(',')}) ON CONFLICT(${keys.map(identifier).join(',')}) DO ${changes ? 'UPDATE SET ' + changes : 'NOTHING'}`;
        await tx.unsafe(statement, values);
      }
    }
    const identities =
      await tx`SELECT table_name FROM information_schema.columns WHERE table_schema='game' AND column_name='id' AND is_identity='YES'`;
    for (const { table_name } of identities) {
      const table = `game.${identifier(table_name)}`;
      await tx.unsafe(
        `SELECT setval(pg_get_serial_sequence($1,'id'),COALESCE((SELECT MAX(id) FROM ${table}),1),(SELECT COUNT(*)>0 FROM ${table}))`,
        [`game.${table_name}`],
      );
    }
    await tx`INSERT INTO game.schema_migrations(id,applied_at) VALUES('cloud-import-v1',${Date.now()})`;
    console.log('Comptes, sessions, mises et historiques importés sans remise à zéro.');
  });
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from('sponsor-logos');
  let logos = 0;
  for (const { id } of source.prepare('SELECT id FROM uploads').all()) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Identifiant de logo inattendu.');
    const { error } = await storage.upload(`${id}.webp`, readFileSync(`data/logos/${id}.webp`), {
      contentType: 'image/webp',
      upsert: false,
    });
    if (error && error.statusCode !== '409') throw new Error('Migration d’un logo à reprendre.');
    logos++;
  }
  console.log(`${logos} logos privés vérifiés. Sauvegarde locale conservée.`);
} catch (error) {
  console.error(`Importation interrompue : ${error.code || error.message || error.name}`);
  process.exitCode = 1;
} finally {
  source.close();
  await sql.end();
}
