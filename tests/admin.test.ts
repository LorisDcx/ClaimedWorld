import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSeason, run, get, territories } from '../src/lib/db';
import { resetConquestMap } from '../src/lib/admin';
import { placeSponsorFunds, sponsorWallet } from '../src/lib/sponsoring';
process.env.DATABASE_PATH = ':memory:';

test('map reset requires admin, typed confirmation and a recent cutoff; it preserves funds, accounts and later conquests', async () => {
  const now = Date.now(),
    season = await currentSeason(now);
  for (const id of ['reset-admin', 'reset-player'])
    await run(
      'INSERT INTO users(id,username,password,color,created_at,generation_anchor,is_admin) VALUES(?,?,?,?,?,?,?)',
      id,
      id,
      '!',
      '#111111',
      now,
      now,
      id === 'reset-admin' ? 1 : 0,
    );
  await run(
    'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
    'reset-old',
    'reset-player',
    'reset-player',
    '250',
    20,
    now,
    now + 3600000,
    season.id,
  );
  await run(
    'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
    'reset-new',
    'reset-player',
    'reset-player',
    '392',
    1,
    now + 2,
    now + 3600000,
    season.id,
  );
  await run(
    "INSERT INTO sponsors(id,user_id,country_id,season_id,name,description,url,initials,color,amount,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'approved',?)",
    'reset-ad',
    'reset-player',
    '470',
    season.id,
    'Advertiser',
    'Test',
    'https://example.com',
    'AD',
    '#111111',
    0,
    now,
  );
  await run('INSERT INTO sponsor_wallets(user_id,balance_cents) VALUES(?,?)', 'reset-player', 1000);
  await placeSponsorFunds('reset-player', 'reset-ad', '470', 200, true, now);
  await assert.rejects(
    () => resetConquestMap('reset-player', season.id, now, 'REINITIALISER', now + 3),
    /administrateur/,
  );
  await assert.rejects(
    () => resetConquestMap('reset-admin', season.id, now, 'oui', now + 3),
    /REINITIALISER/,
  );
  await assert.rejects(
    () => resetConquestMap('reset-admin', season.id, now - 600000, 'REINITIALISER', now + 3),
    /expiré/,
  );
  await resetConquestMap('reset-admin', season.id, now, 'REINITIALISER', now + 3);
  let world = await territories(season.id, now + 3);
  assert.equal(world.find((t) => t.id === '250')?.owner, null);
  assert.equal(world.find((t) => t.id === '392')?.owner, null);
  assert.equal(world.find((t) => t.id === '470')?.sponsor?.id, 'reset-ad');
  assert.equal((await sponsorWallet('reset-player')).balance_cents, 800);
  assert.equal((await get('SELECT wallet FROM users WHERE id=?', 'reset-player'))?.wallet, 100);
  await run(
    'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
    'after-reset',
    'reset-player',
    'reset-player',
    '392',
    1,
    now + 4,
    now + 3600000,
    season.id,
  );
  await resetConquestMap('reset-admin', season.id, now, 'REINITIALISER', now + 5);
  world = await territories(season.id, now + 5);
  assert.equal(
    world.find((t) => t.id === '392')?.owner?.id,
    'reset-player',
    'retry does not erase later conquests',
  );
});
