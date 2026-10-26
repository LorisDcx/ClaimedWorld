import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { postgresQuery, withTestDatabase } from '../src/lib/storage';
import { run, currentSeason, snapshot } from '../src/lib/db';
import { launchAttack } from '../src/lib/combat';
import { placeSponsorFunds, moveSponsorFunds } from '../src/lib/sponsoring';
import { resetConquestMap } from '../src/lib/admin';
import { hashPassword } from '../src/lib/password';
Object.assign(process.env, { NODE_ENV: 'test' });

test('PostgreSQL schema protects private tables and the adapter preserves parameters and numeric functions', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      'CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);',
    );
    const migration = readdirSync('supabase/migrations').find((n) =>
      n.endsWith('_initial_game.sql'),
    )!;
    await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
    const adminMigration = readdirSync('supabase/migrations').find((name) =>
      name.endsWith('_admin_map_resets.sql'),
    )!;
    await db.exec(readFileSync(`supabase/migrations/${adminMigration}`, 'utf8'));
    const q = async (sql: string, params: unknown[] = []) =>
      (await db.query(postgresQuery(sql), params)).rows as Record<string, unknown>[];
    await q(
      'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
      ['pg-player', 'PgPlayer', 'not-a-secret', '#111111', 1000, 1000],
    );
    await q('INSERT INTO seasons(id,starts_at,ends_at) VALUES(1,?,?)', [1000, 3000]);
    await q('INSERT OR IGNORE INTO sponsor_wallets(user_id) VALUES(?)', ['pg-player']);
    await q('INSERT OR IGNORE INTO sponsor_wallets(user_id) VALUES(?)', ['pg-player']);
    await q(
      'UPDATE users SET wallet=MIN(wallet,?),collected_slots=MAX(collected_slots,?) WHERE id=?',
      [90, 3, 'pg-player'],
    );
    assert.equal((await q('SELECT wallet FROM users WHERE id=?', ['pg-player']))[0].wallet, 90);
    assert.equal(
      (
        await q(
          "SELECT '?' AS literal,MAX(MAX(0,MIN(CAST(? AS BIGINT),?,?)-CAST(? AS BIGINT))) AS holdHours",
          [30, 20, 40, 5],
        )
      )[0].holdHours,
      15,
    );
    const privateTables = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='game' AND rowsecurity=true",
    );
    assert.equal(privateTables.rows[0].n, 33);
    const bucket = await db.query<{ public: boolean }>(
      "SELECT public FROM storage.buckets WHERE id='sponsor-logos'",
    );
    assert.equal(bucket.rows[0].public, false);
    const driver = {
      unsafe: async (statement: string, params: unknown[] = []) => {
        const result = await db.query(statement, params);
        const rows = result.rows as Record<string, unknown>[];
        for (const field of result.fields)
          if ([20, 1700].includes(field.dataTypeID))
            for (const row of rows)
              if (row[field.name] !== null) row[field.name] = Number(row[field.name]);
        return Object.assign(rows, { count: result.affectedRows || rows.length });
      },
    } as unknown as Parameters<typeof withTestDatabase>[0];
    await withTestDatabase(driver, async () => {
      await run(
        'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
        'pg-enemy',
        'PgEnemy',
        '!',
        '#111111',
        1000,
        1000,
      );
      const season = await currentSeason();
      const at = Date.now();
      for (const [id, user, country, amount] of [
        ['pg-origin', 'pg-player', '012', 50],
        ['pg-defense', 'pg-enemy', '434', 20],
      ] as const)
        await run(
          'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
          id,
          user,
          user,
          country,
          amount,
          at,
          at + 3600000,
          season.id,
        );
      await launchAttack(
        'pg-player',
        {
          source: '012',
          destination: '434',
          target: 'pg-enemy',
          amount: 30,
          mode: 'solo',
          requestId: 'pg-attack',
        },
        at,
      );
      const world = await snapshot('pg-player');
      assert.equal(world.territories.find((t) => t.id === '434')?.owner?.score, 10);
      assert.equal(world.progression?.metrics.spent, 50);
      await run(
        "INSERT INTO sponsors(id,user_id,country_id,season_id,name,description,url,initials,color,amount,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'approved',?)",
        'pg-ad',
        'pg-player',
        '250',
        season.id,
        'PgAdvertiser',
        'Test',
        'https://example.com',
        'PG',
        '#111111',
        0,
        at,
      );
      await run('UPDATE sponsor_wallets SET balance_cents=6000 WHERE user_id=?', 'pg-player');
      await placeSponsorFunds('pg-player', 'pg-ad', '250', 6000, true, at);
      const market = await moveSponsorFunds(
        'pg-player',
        'pg-ad',
        '250',
        'pg-ad',
        '276',
        6000,
        at + 1,
      );
      assert.equal(market.find((b) => b.country_id === '276')?.amount, 6000);
      assert.equal(market.find((b) => b.country_id === '276')?.winning, true);
      await run(
        'UPDATE users SET is_admin=1,password=? WHERE id=?',
        hashPassword('Admin-password-123!'),
        'pg-player',
      );
      const resetAt = Date.now();
      await resetConquestMap(
        'pg-player',
        season.id,
        resetAt,
        'REINITIALISER',
        resetAt,
        'Admin-password-123!',
      );
      const cleared = await snapshot('pg-player');
      assert.equal(cleared.territories.filter((t) => t.owner).length, 0);
      assert.equal(cleared.territories.find((t) => t.id === '276')?.sponsor?.id, 'pg-ad');
    });
    await db.exec('SET ROLE anon');
    await assert.rejects(() => db.query('SELECT * FROM game.users'), /permission denied/);
    await db.exec('RESET ROLE');
  } finally {
    await db.close();
  }
});
