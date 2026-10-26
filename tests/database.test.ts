import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentSeason,
  get,
  run,
  snapshot,
  territories,
  transaction,
  removeDemoFixtures,
} from '../src/lib/db';
import { CONTRIBUTION_LIFETIME, SEASON_LENGTH } from '../src/lib/rules';
process.env.DATABASE_PATH = ':memory:';
test('a fresh world starts without demo users, alliances or conquests', () => {
  const world = snapshot(null);
  assert.equal(world.players, 0);
  assert.equal(world.alliances.length, 0);
  assert.equal(world.contributions, 0);
  assert.ok(world.territories.every((t) => t.owner === null && t.scores.length === 0));
});
test('persistent game rules: expiration, rollback, and exact season archival', () => {
  const season = currentSeason();
  const at = season.starts_at + 1000;
  run(
    'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
    'test-user',
    'Tester',
    '!',
    '#ff5d35',
    at,
    at,
  );
  run(
    'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
    'c1',
    'test-user',
    'test-user',
    '352',
    100,
    at,
    at + CONTRIBUTION_LIFETIME,
    season.id,
  );
  assert.equal(territories(season.id, at).find((t) => t.id === '352')?.owner?.id, 'test-user');
  assert.equal(
    territories(season.id, at + CONTRIBUTION_LIFETIME - 1).find((t) => t.id === '352')?.owner?.id,
    'test-user',
  );
  assert.equal(
    territories(season.id, at + CONTRIBUTION_LIFETIME).find((t) => t.id === '352')?.owner,
    null,
  );
  assert.throws(() =>
    transaction(() => {
      run('UPDATE users SET wallet=0 WHERE id=?', 'test-user');
      throw new Error('rollback');
    }),
  );
  assert.equal(
    get<{ wallet: number }>('SELECT wallet FROM users WHERE id=?', 'test-user')?.wallet,
    100,
  );
  // A late contribution is active at the season boundary and must be frozen in archives.
  run(
    'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
    'c2',
    'test-user',
    'test-user',
    '352',
    80,
    season.ends_at - 1000,
    season.ends_at + CONTRIBUTION_LIFETIME,
    season.id,
  );
  const next = currentSeason(season.ends_at);
  assert.equal(next.id, season.id + 1);
  assert.equal(next.starts_at, season.ends_at);
  assert.equal(next.ends_at - next.starts_at, SEASON_LENGTH);
  assert.equal(
    get<{ wallet: number }>('SELECT wallet FROM users WHERE id=?', 'test-user')?.wallet,
    2,
  );
  const archive = JSON.parse(
    get<{ snapshot: string }>('SELECT snapshot FROM seasons WHERE id=?', season.id)!.snapshot,
  );
  assert.equal(
    archive.territories.find((t: { id: string }) => t.id === '352').owner.id,
    'test-user',
  );
  assert.equal(territories(next.id, season.ends_at).find((t) => t.id === '352')?.owner, null);
  assert.equal(snapshot(null).archived.length, 1);
});
test('missed expirations preserve the correct incumbent through an offline tie', () => {
  const s = currentSeason();
  const base = s.starts_at + 5000;
  for (const id of ['x-owner', 'z-successor', 'a-challenger'])
    run(
      'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
      id,
      id,
      '!',
      '#7972e8',
      base,
      base,
    );
  for (const [id, uid, amount, expiry] of [
    ['offline-1', 'x-owner', 200, 1000],
    ['offline-2', 'z-successor', 100, 10000],
    ['offline-3', 'z-successor', 50, 2000],
    ['offline-4', 'a-challenger', 100, 10000],
  ] as const)
    run(
      'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
      id,
      uid,
      uid,
      '008',
      amount,
      base,
      base + expiry,
      s.id,
    );
  assert.equal(territories(s.id, base).find((t) => t.id === '008')?.owner?.id, 'x-owner');
  assert.equal(
    territories(s.id, base + 3000).find((t) => t.id === '008')?.owner?.id,
    'z-successor',
  );
});

test('legacy demo cleanup removes invented camps while preserving real accounts', () => {
  const season = currentSeason(),
    now = season.starts_at;
  const wallet = get<{ wallet: number }>(
    'SELECT wallet FROM users WHERE id=?',
    'test-user',
  )!.wallet;
  run(
    'INSERT INTO users(id,username,password,color,created_at,generation_anchor,demo) VALUES(?,?,?,?,?,?,1)',
    'legacy-demo',
    'LegacyDemo',
    '!',
    '#111111',
    now,
    now,
  );
  run(
    'INSERT INTO alliances(id,name,color,emblem,description,leader_id,invite,created_at) VALUES(?,?,?,?,?,?,?,?)',
    'legacy-alliance',
    'Legacy Demo',
    '#111111',
    '✳',
    'Demo',
    'legacy-demo',
    'legacy-invite',
    now,
  );
  run(
    'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
    'legacy-points',
    'legacy-demo',
    'legacy-alliance',
    '250',
    160,
    now,
    now + CONTRIBUTION_LIFETIME,
    season.id,
  );
  run('INSERT INTO ownership VALUES(?,?,?,?)', '250', season.id, 'legacy-alliance', 1);
  run(
    'INSERT INTO activity(text,color,created_at,country_id,season_id) VALUES(?,?,?,?,?)',
    'Legacy Demo revendique France.',
    '#111111',
    now,
    '250',
    season.id,
  );
  removeDemoFixtures();
  removeDemoFixtures();
  assert.equal(get('SELECT id FROM users WHERE demo=1'), undefined);
  assert.equal(get('SELECT id FROM alliances WHERE id=?', 'legacy-alliance'), undefined);
  assert.equal(get('SELECT id FROM contributions WHERE id=?', 'legacy-points'), undefined);
  assert.equal(
    get('SELECT country_id FROM ownership WHERE camp_id=?', 'legacy-alliance'),
    undefined,
  );
  assert.equal(get('SELECT id FROM activity WHERE text LIKE ?', 'Legacy Demo %'), undefined);
  assert.equal(
    get<{ wallet: number }>('SELECT wallet FROM users WHERE id=?', 'test-user')!.wallet,
    wallet,
  );
});
