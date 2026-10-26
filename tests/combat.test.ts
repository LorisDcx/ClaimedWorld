import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import adjacency from '../src/data/neighbors.json';
import { all, currentSeason, get, publicPlayer, run, territories } from '../src/lib/db';
import { attackOutcome, isNeighbor, launchAttack, proportionalFunding } from '../src/lib/combat';
import { activeInfluence } from '../src/lib/influence';
import { progression } from '../src/lib/progression';
import { calculateRewards } from '../src/lib/season-rewards';
import { CONTRIBUTION_LIFETIME, DAY } from '../src/lib/rules';
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
  amount: number,
  at: number,
  season: number,
  camp = user,
) {
  const id = randomUUID();
  await run(
    'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
    id,
    user,
    camp,
    country,
    amount,
    at,
    at + CONTRIBUTION_LIFETIME,
    season,
  );
  return id;
}
const score = (world: Awaited<ReturnType<typeof territories>>, country: string, camp: string) =>
  world.find((t) => t.id === country)?.scores.find((c) => c.id === camp)?.score || 0;

test('land adjacency is symmetric and uses real borders, without ocean or overseas shortcuts', () => {
  assert.ok(isNeighbor('012', '434'));
  assert.ok(isNeighbor('250', '276'));
  assert.ok(!isNeighbor('250', '638'));
  assert.ok(!isNeighbor('250', '826'));
  assert.deepEqual(adjacency['638'], []);
  for (const [id, neighbors] of Object.entries(adjacency))
    for (const neighbor of neighbors) assert.ok(isNeighbor(neighbor, id), `${id} / ${neighbor}`);
  assert.deepEqual(attackOutcome(30, 20), {
    destroyed: 20,
    survivors: 10,
    defenderRemaining: 0,
    totalBurned: 40,
  });
  assert.deepEqual(attackOutcome(10, 20), {
    destroyed: 10,
    survivors: 0,
    defenderRemaining: 10,
    totalBurned: 20,
  });
});

test('Algeria sends 30 of its 50, destroys the chosen 20 and remains behind the untouched third camp at 15', async () => {
  const season = await currentSeason(),
    now = season.starts_at + 1000;
  for (const id of ['algeria-player', 'libya-player', 'third-player']) await player(id, now);
  await bid('algeria-player', '012', 50, now, season.id);
  await bid('libya-player', '434', 20, now, season.id);
  await bid('third-player', '434', 15, now, season.id);
  await territories(season.id, now);
  const before = (await activeInfluence(season.id, now)).reduce((sum, c) => sum + c.amount, 0);
  const order = {
    source: '012',
    destination: '434',
    target: 'libya-player',
    amount: 30,
    mode: 'solo' as const,
    requestId: randomUUID(),
  };
  const result = await launchAttack('algeria-player', order, now + 1000);
  assert.equal(result.totalBurned, 40);
  const after = await territories(season.id, now + 1000);
  assert.equal(score(after, '012', 'algeria-player'), 20);
  assert.equal(score(after, '434', 'libya-player'), 0);
  assert.equal(score(after, '434', 'algeria-player'), 10);
  assert.equal(score(after, '434', 'third-player'), 15);
  assert.equal(after.find((t) => t.id === '434')!.owner!.id, 'third-player');
  assert.equal((await publicPlayer('algeria-player', now + 1000))!.wallet, 100);
  assert.equal(
    (await activeInfluence(season.id, now + 1000)).reduce((sum, c) => sum + c.amount, 0),
    before - 40,
  );
  assert.equal((await progression('algeria-player', season.id, now + 1000)).metrics.spent, 50);
  await launchAttack('algeria-player', order, now + 2000);
  assert.equal(score(await territories(season.id, now + 2000), '012', 'algeria-player'), 20);
  await assert.rejects(
    () => launchAttack('algeria-player', { ...order, amount: 1 }, now + 2000),
    /référence/,
  );
  assert.equal(
    (await activeInfluence(season.id, now + 1000)).find(
      (c) => c.camp_id === 'algeria-player' && c.country_id === '434',
    )!.expires_at,
    now + CONTRIBUTION_LIFETIME,
  );
  assert.equal(
    score(await territories(season.id, now + CONTRIBUTION_LIFETIME), '434', 'algeria-player'),
    0,
  );
  assert.equal(
    score(await territories(season.id, now), '434', 'libya-player'),
    20,
    'historical scores precede damage',
  );
});

test('attacking a non-leading rival only damages that camp, and insufficient or foreign sources cannot spend troops', async () => {
  const season = await currentSeason(),
    now = season.starts_at + 2000;
  for (const id of ['france-attacker', 'germany-leader', 'germany-rival']) await player(id, now);
  await bid('france-attacker', '250', 50, now, season.id);
  await bid('germany-leader', '276', 20, now, season.id);
  await bid('germany-rival', '276', 15, now, season.id);
  const order = {
    source: '250',
    destination: '276',
    target: 'germany-rival',
    amount: 10,
    mode: 'solo' as const,
    requestId: randomUUID(),
  };
  await launchAttack('france-attacker', order, now);
  const world = await territories(season.id, now);
  assert.equal(score(world, '276', 'germany-leader'), 20);
  assert.equal(score(world, '276', 'germany-rival'), 5);
  assert.equal(score(world, '276', 'france-attacker'), 0);
  await assert.rejects(
    () => launchAttack('france-attacker', { ...order, requestId: randomUUID(), amount: 41 }, now),
    /insuffisantes/,
  );
  await assert.rejects(
    () =>
      launchAttack(
        'germany-rival',
        { ...order, requestId: randomUUID(), target: 'germany-leader' },
        now,
      ),
    /départ/,
  );
  await assert.rejects(
    () =>
      launchAttack(
        'france-attacker',
        { ...order, requestId: randomUUID(), target: 'france-attacker' },
        now,
      ),
    /propre camp/,
  );
  await assert.rejects(
    () =>
      launchAttack(
        'france-attacker',
        { ...order, requestId: randomUUID(), destination: '392' },
        now,
      ),
    /frontière/,
  );
  assert.equal(score(await territories(season.id, now), '250', 'france-attacker'), 40);
});

test('alliance attacks enforce rank and strategy while preserving treasury, funding and original expiry', async () => {
  const season = await currentSeason(),
    now = season.starts_at + 3000;
  for (const id of ['combat-chief', 'combat-general', 'combat-member', 'china-defender'])
    await player(id, now);
  await run(
    'INSERT INTO alliances(id,name,color,emblem,description,leader_id,invite,created_at,target_ids,treasury) VALUES(?,?,?,?,?,?,?,?,?,?)',
    'combat-team',
    'Combat Team',
    '#111111',
    'x',
    '',
    'combat-chief',
    'combat-invite',
    now,
    '["156"]',
    500,
  );
  for (const [id, role] of [
    ['combat-chief', 'leader'],
    ['combat-general', 'general'],
    ['combat-member', 'member'],
  ])
    await run('UPDATE users SET alliance_id=?,alliance_role=? WHERE id=?', 'combat-team', role, id);
  const original = await bid('combat-chief', '643', 40, now, season.id, 'combat-team');
  await run('INSERT INTO contribution_funding VALUES(?,?,?)', original, 'combat-member', 31);
  await run('INSERT INTO contribution_funding VALUES(?,?,?)', original, 'combat-chief', 9);
  await bid('china-defender', '156', 20, now, season.id);
  const order = {
    source: '643',
    destination: '156',
    target: 'china-defender',
    amount: 30,
    mode: 'alliance' as const,
    requestId: randomUUID(),
  };
  await assert.rejects(() => launchAttack('combat-member', order, now), /généraux/);
  await assert.rejects(
    () => launchAttack('combat-general', { ...order, destination: '496' }, now),
    /objectifs/,
  );
  await launchAttack('combat-general', order, now);
  assert.equal(
    (await get('SELECT treasury FROM alliances WHERE id=?', 'combat-team'))!.treasury,
    500,
  );
  const moved = (await activeInfluence(season.id, now)).find(
    (c) => c.camp_id === 'combat-team' && c.country_id === '156',
  )!;
  assert.equal(moved.amount, 10);
  assert.equal(moved.expires_at, now + CONTRIBUTION_LIFETIME);
  assert.equal(
    (
      await all<{ amount: number }>(
        'SELECT amount FROM contribution_funding WHERE contribution_id=?',
        moved.id,
      )
    ).reduce((sum, c) => sum + c.amount, 0),
    10,
  );
  assert.equal(
    (await progression('combat-member', season.id, now)).metrics.funded,
    31,
    'movement does not count as a second donation',
  );
  assert.equal(
    (
      await all<{ amount: number }>(
        'SELECT amount FROM influence_burns WHERE contribution_id=?',
        original,
      )
    ).reduce((sum, c) => sum + c.amount, 0),
    30,
  );
  assert.deepEqual(
    proportionalFunding(
      [
        { contribution_id: 'x', user_id: 'a', amount: 31 },
        { contribution_id: 'x', user_id: 'b', amount: 9 },
      ],
      40,
      10,
    )
      .map((c) => c.amount)
      .sort(),
    [2, 8],
  );
});

test('season rewards stop counting destroyed or transferred source points at the exact attack time', () => {
  const results = calculateRewards(
    0,
    3 * DAY,
    [
      { country_id: 'a', camp_id: 'solo', starts_at: 0, ends_at: 3 * DAY },
      { country_id: 'b', camp_id: 'solo', starts_at: DAY, ends_at: 3 * DAY },
    ],
    [
      {
        id: 'source',
        user_id: 'solo',
        camp_id: 'solo',
        country_id: 'a',
        amount: 50,
        created_at: 0,
        expires_at: 3 * DAY,
      },
      {
        id: 'child',
        user_id: 'solo',
        camp_id: 'solo',
        country_id: 'b',
        amount: 10,
        created_at: DAY,
        expires_at: 3 * DAY,
      },
    ],
    [],
    [],
    [{ contribution_id: 'source', amount: 30, created_at: DAY }],
  );
  assert.ok(Math.abs(results[0].usefulInfluence - 110 / 3) < 0.00001);
  assert.equal(results[0].activeDays, 3);
});
