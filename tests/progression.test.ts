import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSeason, get, publicPlayer, run, snapshot, territories } from '../src/lib/db';
import { equipCosmetic, progression, saveTutorial, selectObjective } from '../src/lib/progression';
import { controlWindow, HOUR } from '../src/lib/progression-catalog';
import { CONTRIBUTION_LIFETIME, SEASON_LENGTH } from '../src/lib/rules';
process.env.DATABASE_PATH = ':memory:';

async function player(id: string, now: number) {
  await run(
    'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
    id,
    id,
    '!',
    '#39a5c5',
    now,
    now,
  );
}
async function bid(
  user: string,
  country: string,
  now: number,
  season: number,
  amount = 1,
  camp = user,
) {
  const id = `${user}-${country}-${now}`;
  await run(
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

test('real conquests unlock permanent cosmetics; locked and unknown cosmetics cannot be equipped', async () => {
  const season = await currentSeason();
  const now = season.starts_at + 1000;
  await player('achiever', now);
  const wallet = (await publicPlayer('achiever', now))!.wallet;
  await assert.rejects(
    () => equipCosmetic('achiever', 'border-double', season.id, now),
    /Débloquez/,
  );
  await assert.rejects(() => equipCosmetic('achiever', 'made-up', season.id, now), /inconnue/);
  assert.equal((await progression('achiever', season.id, now)).unlocks.length, 0);
  for (const id of ['250', '276', '380', '242', '548']) await bid('achiever', id, now, season.id);
  await territories(season.id, now);
  const earned = await progression('achiever', season.id, now);
  assert.ok(earned.unlocks.some((u) => u.id === 'five-flags'));
  assert.equal(earned.metrics.conquered, 5);
  await equipCosmetic('achiever', 'frame-orbit', season.id, now);
  await equipCosmetic('achiever', 'title-pioneer', season.id, now);
  assert.equal((await publicPlayer('achiever', now))!.appearance!.frame, 'orbit');
  assert.equal((await publicPlayer('achiever', now))!.wallet, wallet);
  assert.equal((await publicPlayer('achiever', now))!.stockCap, 160);
  assert.equal(
    (await progression('achiever', season.id, now)).unlocks.length,
    earned.unlocks.length,
  );
  await territories(season.id, now + 24 * HOUR);
  await equipCosmetic('achiever', 'border-double', season.id, now + 24 * HOUR);
  assert.equal((await publicPlayer('achiever', now + 24 * HOUR))!.appearance!.border, 'double');
});

test('objectives start on selection, persist after offline completion and never credit mere alliance membership', async () => {
  const season = await currentSeason();
  const now = season.starts_at + 1000;
  await player('objective-player', now);
  await player('passenger', now);
  for (const id of ['638', '480']) await bid('objective-player', id, now, season.id);
  await territories(season.id, now);
  await selectObjective('objective-player', 'mascarene', season.id, now + HOUR);
  await selectObjective('passenger', 'mascarene', season.id, now + HOUR);
  assert.equal((await progression('objective-player', season.id, now + HOUR)).objective!.heldMs, 0);
  await selectObjective('objective-player', 'mascarene', season.id, now + HOUR + 10);
  assert.equal(
    (await progression('objective-player', season.id, now + HOUR + 10)).objective!.startedAt,
    now + HOUR,
  );
  await territories(season.id, now + 73 * HOUR);
  const offline = await progression('objective-player', season.id, now + 73 * HOUR);
  assert.equal(offline.objective!.heldMs, 0);
  assert.equal(offline.objective!.completedAt, now + 2 * HOUR);
  assert.ok(offline.unlocks.some((u) => u.id === 'goal:mascarene'));
  assert.equal((await progression('passenger', season.id, now + 73 * HOUR)).unlocks.length, 0);
  await equipCosmetic('objective-player', 'frame-compass', season.id, now + 73 * HOUR);
  await assert.rejects(
    () => selectObjective('objective-player', 'mascarene', season.id, now + 73 * HOUR),
    /déjà/,
  );
  await assert.rejects(
    () => selectObjective('objective-player', 'unknown', season.id, now + 73 * HOUR),
    /inconnu/,
  );
});

test('collective success counts funds actually spent, and tutorial progress cannot unlock cosmetics', async () => {
  const season = await currentSeason();
  const now = season.starts_at + 1000;
  await player('donor', now);
  await player('commander-progress', now);
  await run(
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
  await run('UPDATE users SET alliance_id=? WHERE id=?', 'progress-team', 'donor');
  await run(
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
  assert.equal((await progression('donor', season.id, now)).metrics.funded, 0);
  const contribution = await bid('commander-progress', '474', now, season.id, 200, 'progress-team');
  await run('INSERT INTO contribution_funding VALUES(?,?,?)', contribution, 'donor', 200);
  await territories(season.id, now);
  const result = await progression('donor', season.id, now);
  assert.ok(result.unlocks.some((u) => u.id === 'team-player'));
  assert.equal(result.metrics.conquered, 0);
  await saveTutorial('donor', 4, true);
  assert.deepEqual((await progression('donor', season.id, now)).tutorial, {
    step: 4,
    dismissed: true,
  });
  await assert.rejects(() => equipCosmetic('donor', 'frame-orbit', season.id, now), /Débloquez/);
});

test('season rollover keeps accomplishments and appearance but ends unfinished objective timers', async () => {
  const old = await currentSeason();
  const now = old.ends_at - 30 * 60 * 1000;
  await player('season-achiever', now);
  for (const id of ['250', '276', '380']) await bid('season-achiever', id, now, old.id);
  await territories(old.id, now);
  await selectObjective('season-achiever', 'europe', old.id, now);
  await equipCosmetic('season-achiever', 'title-pioneer', old.id, now);
  const next = await currentSeason(old.ends_at + 1);
  assert.equal(next.starts_at, old.starts_at + SEASON_LENGTH);
  const result = await progression('season-achiever', next.id, old.ends_at + 1);
  assert.equal(result.objective, null);
  assert.equal(result.appearance.title, 'Pionnier');
  assert.ok(result.unlocks.some((u) => u.id === 'first-bid'));
  assert.ok(!result.unlocks.some((u) => u.id === 'goal:europe'));
  assert.equal(
    (await get(
      'SELECT COUNT(*) AS n FROM progression_unlocks WHERE user_id=? AND id=?',
      'season-achiever',
      'first-bid',
    ))!.n,
    1,
  );
  assert.equal((await snapshot(null)).progression, null);
});
