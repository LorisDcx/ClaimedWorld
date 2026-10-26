import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSeason, run, territories } from '../src/lib/db';
import { CONTRIBUTION_LIFETIME, DAY } from '../src/lib/rules';
process.env.DATABASE_PATH = ':memory:';

test('one-point claims and later challengers expire by server dates without any intervening visits', () => {
  const season = currentSeason();
  const start = season.starts_at + 1000;
  for (const id of ['first', 'challenger'])
    run(
      'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
      id,
      id,
      '!',
      '#111111',
      start,
      start,
    );
  run(
    'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
    'first-bid',
    'first',
    'first',
    '064',
    1,
    start,
    start + CONTRIBUTION_LIFETIME,
    season.id,
  );
  run(
    'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
    'challenge',
    'challenger',
    'challenger',
    '064',
    2,
    start + DAY,
    start + DAY + CONTRIBUTION_LIFETIME,
    season.id,
  );
  const country = (at: number) => territories(season.id, at).find((t) => t.id === '064')!;
  assert.equal(country(start).owner?.id, 'first');
  const challenged = country(start + DAY);
  assert.equal(challenged.owner?.id, 'challenger');
  assert.equal(challenged.scores[0].nextExpiryAt, start + DAY + CONTRIBUTION_LIFETIME);
  // No snapshots, requests or timer ticks during the following three days.
  const returned = country(start + CONTRIBUTION_LIFETIME);
  assert.equal(returned.owner?.score, 2);
  assert.equal(
    returned.scores.some((c) => c.id === 'first'),
    false,
  );
  const expired = country(start + DAY + CONTRIBUTION_LIFETIME);
  assert.equal(expired.owner, null);
  assert.equal(expired.scores.length, 0);
});
