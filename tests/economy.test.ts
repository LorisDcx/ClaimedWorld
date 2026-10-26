import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSeason, get, publicPlayer, run } from '../src/lib/db';
import { DAY, HALF_HOUR, SEASON_LENGTH } from '../src/lib/rules';
import {
  calculateRewards,
  rewardFor,
  type RewardContribution,
  type FundingShare,
} from '../src/lib/season-rewards';
process.env.DATABASE_PATH = ':memory:';

test('offline generation caps at 160 and spending cannot recover discarded ticks', async () => {
  const start = (await currentSeason()).starts_at;
  await run(
    'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
    'stock',
    'StockPlayer',
    '!',
    '#111111',
    start,
    start,
  );
  assert.equal((await publicPlayer('stock', start + HALF_HOUR))!.wallet, 120);
  assert.equal((await publicPlayer('stock', start + DAY))!.wallet, 160);
  await run('UPDATE users SET wallet=60 WHERE id=?', 'stock');
  assert.equal((await publicPlayer('stock', start + DAY))!.wallet, 60);
  assert.equal((await publicPlayer('stock', start + DAY + HALF_HOUR))!.wallet, 80);
  assert.equal((await publicPlayer('stock', start + 20 * DAY))!.wallet, 160);
  assert.equal((await publicPlayer('stock', start + 20 * DAY))!.reserve, 0);
});

test('late and token participation yield tiny or zero season bonuses, with hard caps', () => {
  assert.deepEqual(rewardFor({ activeDays: 30, usefulInfluence: 20, territoryDays: 1000 }), {
    strength: 0.02,
    capacityBonus: 0,
    rateBonus: 0,
    startingInfluence: 0,
  });
  const late = rewardFor({ activeDays: 2, usefulInfluence: 100000, territoryDays: 100000 });
  assert.ok(late.capacityBonus <= 2 && late.rateBonus === 0 && late.startingInfluence <= 2);
  assert.deepEqual(rewardFor({ activeDays: 300, usefulInfluence: 100000, territoryDays: 100000 }), {
    strength: 1,
    capacityBonus: 20,
    rateBonus: 2,
    startingInfluence: 20,
  });
});

test('useful control time credits funders and commanders, not unused donations or days outside the alliance', () => {
  const bids: RewardContribution[] = [],
    funding: FundingShare[] = [];
  for (let day = 0; day < 30; day += 2) {
    const id = `bid-${day}`;
    bids.push({
      id,
      user_id: 'commander',
      camp_id: 'team',
      country_id: '548',
      amount: 1000,
      created_at: day * DAY,
      expires_at: (day + 3) * DAY,
    });
    funding.push({ contribution_id: id, user_id: day === 28 ? 'late' : 'regular', amount: 980 });
    funding.push({ contribution_id: id, user_id: 'small', amount: 20 });
  }
  const rewards = calculateRewards(
    0,
    SEASON_LENGTH,
    [{ country_id: '548', camp_id: 'team', starts_at: 0, ends_at: null }],
    bids,
    funding,
    ['regular', 'small', 'commander', 'unused', 'late'].map((user_id) => ({
      user_id,
      alliance_id: 'team',
      joined_at: user_id === 'late' ? 28 * DAY : 0,
      left_at: user_id === 'small' ? DAY : null,
    })),
  );
  const regular = rewards.find((r) => r.userId === 'regular')!;
  assert.ok(regular.activeDays > 20 && regular.usefulInfluence > 1000 && regular.capacityBonus > 0);
  assert.equal(
    rewards.some((r) => r.userId === 'unused'),
    false,
  );
  assert.ok(rewards.find((r) => r.userId === 'small')!.activeDays <= 1);
  assert.equal(rewards.find((r) => r.userId === 'small')!.rateBonus, 0);
  assert.ok(rewards.find((r) => r.userId === 'late')!.capacityBonus <= 2);
  assert.ok(rewards.find((r) => r.userId === 'commander')!.usefulInfluence > 0);
  assert.ok(
    rewards.reduce((sum, r) => sum + r.territoryDays, 0) <= 30.00001,
    'a territory-day cannot be awarded multiple times',
  );
});

test('season bonuses are applied exactly once and disappear after the following season', async () => {
  const season = await currentSeason();
  await run(
    'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
    'reward',
    'RewardPlayer',
    '!',
    '#111111',
    season.starts_at,
    season.starts_at,
  );
  for (let day = 0; day < 30; day += 2)
    await run(
      'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
      `reward-${day}`,
      'reward',
      'reward',
      '250',
      1000,
      season.starts_at + day * DAY,
      season.starts_at + (day + 3) * DAY,
      season.id,
    );
  await run(
    'INSERT INTO ownership_periods(country_id,season_id,camp_id,starts_at) VALUES(?,?,?,?)',
    '250',
    season.id,
    'reward',
    season.starts_at,
  );
  const next = await currentSeason(season.ends_at);
  const player = (await publicPlayer('reward', next.starts_at))!;
  assert.equal(player.stockCap, 180);
  assert.equal(player.generationRate, 22);
  assert.equal(player.wallet, 20);
  assert.equal(player.seasonBonus?.sourceSeason, season.id);
  await currentSeason(season.ends_at);
  assert.equal(
    (await get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM season_rewards WHERE user_id=?',
      'reward',
    ))!.n,
    1,
  );
  assert.equal((await publicPlayer('reward', next.starts_at))!.wallet, 20);
  const third = await currentSeason(next.ends_at);
  const reset = (await publicPlayer('reward', third.starts_at))!;
  assert.equal(reset.stockCap, 160);
  assert.equal(reset.generationRate, 20);
  assert.equal(reset.wallet, 0);
  assert.equal(reset.seasonBonus, null);
});
