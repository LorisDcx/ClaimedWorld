import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSeason, get, publicPlayer, run, snapshot, territories } from '../src/lib/db';
import { equipCosmetic, progression, saveTutorial, selectObjective } from '../src/lib/progression';
import { controlWindow, HOUR } from '../src/lib/progression-catalog';
import { CONTRIBUTION_LIFETIME, SEASON_LENGTH } from '../src/lib/rules';
process.env.DATABASE_PATH = ':memory:';

function player(id: string, now: number) {
  run(
    'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
    id,
    id,
    '!',
    '#39a5c5',
    now,
    now,
  );
}
function bid(user: string, country: string, now: number, season: number, amount = 1, camp = user) {
  const id = `${user}-${country}-${now}`;
  run(
    'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
    id,
    user,
    camp,
    country,
    amount,
    now,
    now + CONTRIBUTION_LIFETIME,
    season,
  );
  return id;
}

test('control objectives require overlapping ownership and restart after a loss, including offline', () => {
  const periods = [
    { country_id: 'a', starts_at: 0, ends_at: null },
    { country_id: 'b', starts_at: 10, ends_at: 40 },
    { country_id: 'b', starts_at: 60, ends_at: null },
  ];
  assert.deepEqual(controlWindow(['a', 'b'], periods, 0, 70, 50), {
    heldMs: 10,
    completedAt: null,
  });
  assert.deepEqual(controlWindow(['a', 'b'], periods, 0, 120, 50), {
    heldMs: 60,
    completedAt: 110,
  });
  assert.deepEqual(controlWindow(['a', 'b'], periods, 95, 120, 50), {
    heldMs: 25,
    completedAt: null,
  });
  assert.deepEqual(controlWindow(['a', 'b'], periods, 0, 40, 50), { heldMs: 0, completedAt: null });
  assert.deepEqual(controlWindow(['a', 'missing'], periods, 0, 120, 50), {
    heldMs: 0,
    completedAt: null,
  });
});

test('real conquests unlock permanent cosmetics; locked and unknown cosmetics cannot be equipped', () => {
  const season = currentSeason();
  const now = season.starts_at + 1000;
  player('achiever', now);
  const wallet = publicPlayer('achiever', now)!.wallet;
  assert.throws(() => equipCosmetic('achiever', 'border-double', season.id, now), /Débloquez/);
  assert.throws(() => equipCosmetic('achiever', 'made-up', season.id, now), /inconnue/);
  assert.equal(progression('achiever', season.id, now).unlocks.length, 0);
  for (const id of ['250', '276', '380', '242', '548']) bid('achiever', id, now, season.id);
  territories(season.id, now);
  const earned = progression('achiever', season.id, now);
  assert.ok(earned.unlocks.some((u) => u.id === 'five-flags'));
  assert.equal(earned.metrics.conquered, 5);
  equipCosmetic('achiever', 'frame-orbit', season.id, now);
  equipCosmetic('achiever', 'title-pioneer', season.id, now);
  assert.equal(publicPlayer('achiever', now)!.appearance!.frame, 'orbit');
  assert.equal(publicPlayer('achiever', now)!.wallet, wallet);
  assert.equal(publicPlayer('achiever', now)!.stockCap, 160);
  assert.equal(progression('achiever', season.id, now).unlocks.length, earned.unlocks.length);
  territories(season.id, now + 24 * HOUR);
  equipCosmetic('achiever', 'border-double', season.id, now + 24 * HOUR);
  assert.equal(publicPlayer('achiever', now + 24 * HOUR)!.appearance!.border, 'double');
});

test('objectives start on selection, persist after offline completion and never credit mere alliance membership', () => {
  const season = currentSeason();
  const now = season.starts_at + 1000;
  player('objective-player', now);
  player('passenger', now);
  for (const id of ['638', '480']) bid('objective-player', id, now, season.id);
  territories(season.id, now);
  selectObjective('objective-player', 'mascarene', season.id, now + HOUR);
  selectObjective('passenger', 'mascarene', season.id, now + HOUR);
  assert.equal(progression('objective-player', season.id, now + HOUR).objective!.heldMs, 0);
  selectObjective('objective-player', 'mascarene', season.id, now + HOUR + 10);
  assert.equal(
    progression('objective-player', season.id, now + HOUR + 10).objective!.startedAt,
    now + HOUR,
  );
  territories(season.id, now + 73 * HOUR);
  const offline = progression('objective-player', season.id, now + 73 * HOUR);
  assert.equal(offline.objective!.heldMs, 0);
  assert.equal(offline.objective!.completedAt, now + 2 * HOUR);
  assert.ok(offline.unlocks.some((u) => u.id === 'goal:mascarene'));
  assert.equal(progression('passenger', season.id, now + 73 * HOUR).unlocks.length, 0);
  equipCosmetic('objective-player', 'frame-compass', season.id, now + 73 * HOUR);
  assert.throws(
    () => selectObjective('objective-player', 'mascarene', season.id, now + 73 * HOUR),
    /déjà/,
  );
  assert.throws(
    () => selectObjective('objective-player', 'unknown', season.id, now + 73 * HOUR),
    /inconnu/,
  );
});

test('collective success counts funds actually spent, and tutorial progress cannot unlock cosmetics', () => {
  const season = currentSeason();
  const now = season.starts_at + 1000;
  player('donor', now);
  player('commander-progress', now);
  run(
    'INSERT INTO alliances(id,name,color,emblem,description,leader_id,invite,created_at) VALUES(?,?,?,?,?,?,?,?)',
    'progress-team',
    'Progress Team',
    '#111111',
    'x',
    '',
    'commander-progress',
    'progress-invite',
    now,
  );
  run('UPDATE users SET alliance_id=? WHERE id=?', 'progress-team', 'donor');
  run(
    'INSERT INTO alliance_ledger VALUES(?,?,?,?,?,?,?,?)',
    'donation-only',
    'progress-team',
    'donor',
    season.id,
    'deposit',
    500,
    null,
    now,
  );
  assert.equal(progression('donor', season.id, now).metrics.funded, 0);
  const contribution = bid('commander-progress', '474', now, season.id, 200, 'progress-team');
  run('INSERT INTO contribution_funding VALUES(?,?,?)', contribution, 'donor', 200);
  territories(season.id, now);
  const result = progression('donor', season.id, now);
  assert.ok(result.unlocks.some((u) => u.id === 'team-player'));
  assert.equal(result.metrics.conquered, 0);
  saveTutorial('donor', 4, true);
  assert.deepEqual(progression('donor', season.id, now).tutorial, { step: 4, dismissed: true });
  assert.throws(() => equipCosmetic('donor', 'frame-orbit', season.id, now), /Débloquez/);
});

test('season rollover keeps accomplishments and appearance but ends unfinished objective timers', () => {
  const old = currentSeason();
  const now = old.ends_at - 30 * 60 * 1000;
  player('season-achiever', now);
  for (const id of ['250', '276', '380']) bid('season-achiever', id, now, old.id);
  territories(old.id, now);
  selectObjective('season-achiever', 'europe', old.id, now);
  equipCosmetic('season-achiever', 'title-pioneer', old.id, now);
  const next = currentSeason(old.ends_at + 1);
  assert.equal(next.starts_at, old.starts_at + SEASON_LENGTH);
  const result = progression('season-achiever', next.id, old.ends_at + 1);
  assert.equal(result.objective, null);
  assert.equal(result.appearance.title, 'Pionnier');
  assert.ok(result.unlocks.some((u) => u.id === 'first-bid'));
  assert.ok(!result.unlocks.some((u) => u.id === 'goal:europe'));
  assert.equal(
    get(
      'SELECT COUNT(*) AS n FROM progression_unlocks WHERE user_id=? AND id=?',
      'season-achiever',
      'first-bid',
    )!.n,
    1,
  );
  assert.equal(snapshot(null).progression, null);
});
