import countries from '@/data/countries.json';
import {
  chooseOwner,
  generatedStock,
  generationSlots,
  nextGeneration,
  SEASON_LENGTH,
  STOCK_CAP,
  GENERATION_RATE,
  ALLIANCE_LIMIT,
  TREASURY_CAP,
} from './rules';
import {
  calculateRewards,
  type ControlPeriod,
  type RewardContribution,
  type FundingShare,
  type MembershipPeriod,
} from './season-rewards';
import type { Alliance, Camp, Player, Season, Snapshot, Territory } from './types';
import { sponsorMarket, sponsorWallet } from './sponsoring';
import { appearance, progression } from './progression';
import { activeInfluence } from './influence';
import { houseSponsor } from './house-ads';
import { usesPostgres } from './storage';
import { paymentStatus } from './payments-config';

import { all, get, run, transaction } from './storage';
export { all, get, run, transaction } from './storage';
export { removeDemoFixtures } from './sqlite-store';
export async function log(
  text: string,
  color: string,
  country: string | null,
  season: number,
  now = Date.now(),
) {
  await run(
    'INSERT INTO activity(text,color,created_at,country_id,season_id) VALUES(?,?,?,?,?)',
    text,
    color,
    now,
    country,
    season,
  );
}
export async function camp(id: string, score = 0): Promise<Camp | null> {
  const alliance = await get('SELECT * FROM alliances WHERE id=?', id);
  if (alliance)
    return {
      id,
      name: String(alliance.name),
      color: String(alliance.color),
      emblem: String(alliance.emblem),
      score,
      alliance: true,
    };
  const player = await get('SELECT * FROM users WHERE id=?', id);
  return player
    ? {
        id,
        name: String(player.username),
        color: String(player.color),
        emblem: '◉',
        score,
        alliance: false,
        appearance: await appearance(id),
      }
    : null;
}
export async function territories(
  season: number,
  at = Date.now(),
  record = true,
  processExpirations = true,
  includeSponsors = true,
): Promise<Territory[]> {
  if (record && processExpirations) {
    const checkpoint = Number(
      (await get('SELECT processed_at FROM seasons WHERE id=?', season))?.processed_at || 0,
    );
    // Apply missed expirations in chronological order so incumbent ties remain correct offline.
    const expirations = await all<{ expires_at: number }>(
      'SELECT DISTINCT expires_at FROM contributions WHERE season_id=? AND expires_at>? AND expires_at<=? ORDER BY expires_at',
      season,
      checkpoint,
      at,
    );
    for (const { expires_at } of expirations)
      await territories(season, expires_at, true, false, false);
    await run('UPDATE seasons SET processed_at=MAX(processed_at,?) WHERE id=?', at, season);
  }
  const grouped = new Map<
    string,
    { country_id: string; camp_id: string; score: number; next_expiry: number }
  >();
  for (const contribution of await activeInfluence(season, at)) {
    const key = `${contribution.country_id}:${contribution.camp_id}`;
    const entry = grouped.get(key) || {
      country_id: contribution.country_id,
      camp_id: contribution.camp_id,
      score: 0,
      next_expiry: Infinity,
    };
    entry.score += contribution.amount;
    entry.next_expiry = Math.min(entry.next_expiry, contribution.expires_at);
    grouped.set(key, entry);
  }
  const scores = [...grouped.values()].sort((a, b) => b.score - a.score);
  const prior = new Map(
    (
      await all<{ country_id: string; camp_id: string; changes: number }>(
        'SELECT * FROM ownership WHERE season_id=?',
        season,
      )
    ).map((o) => [o.country_id, o]),
  );
  const sponsors = new Map(
    (includeSponsors ? await sponsorMarket(at) : [])
      .filter((s) => s.winning)
      .map((s) => [s.country_id, s]),
  );
  const camps = new Map<string, Camp | null>();
  for (const score of scores)
    if (!camps.has(score.camp_id)) camps.set(score.camp_id, await camp(score.camp_id));
  const result: Territory[] = [];
  for (const country of countries) {
    const countryScores: Camp[] = scores
      .filter((s) => s.country_id === country.id)
      .flatMap((s) => {
        const c = camps.get(s.camp_id);
        return c ? [{ ...c, score: s.score, nextExpiryAt: s.next_expiry }] : [];
      });
    const old = prior.get(country.id);
    const ownerId = chooseOwner(countryScores, old?.camp_id ?? null);
    countryScores.sort(
      (a, b) =>
        b.score - a.score ||
        (a.id === ownerId ? -1 : b.id === ownerId ? 1 : a.id.localeCompare(b.id)),
    );
    let changes = old?.changes ?? 0;
    if (record && ownerId !== (old?.camp_id ?? null)) {
      changes++;
      await run(
        'UPDATE ownership_periods SET ends_at=MAX(starts_at,?) WHERE country_id=? AND season_id=? AND ends_at IS NULL',
        at,
        country.id,
        season,
      );
      if (ownerId)
        await run(
          'INSERT INTO ownership_periods(country_id,season_id,camp_id,starts_at) VALUES(?,?,?,?)',
          country.id,
          season,
          ownerId,
          at,
        );
      await run(
        'INSERT INTO ownership VALUES(?,?,?,?) ON CONFLICT(country_id,season_id) DO UPDATE SET camp_id=excluded.camp_id, changes=excluded.changes',
        country.id,
        season,
        ownerId,
        changes,
      );
      const owner = ownerId ? camps.get(ownerId) : null;
      await log(
        owner ? `${owner.name} revendique ${country.name}.` : `${country.name} redevient neutre.`,
        owner?.color || '#999',
        country.id,
        season,
        at,
      );
    }
    result.push({
      id: country.id,
      owner: countryScores.find((s) => s.id === ownerId) || null,
      scores: countryScores,
      sponsor: sponsors.get(country.id) || (includeSponsors ? houseSponsor(country.id) : null),
      changes,
      sponsorReserved: sponsors.has(country.id),
    });
  }
  return result;
}
export async function currentSeason(now = Date.now()): Promise<Season> {
  let season = await get<Season>(
    'SELECT id,starts_at,ends_at,archived_at FROM seasons ORDER BY id DESC LIMIT 1',
  );
  if (!season) {
    await transaction(async () => {
      if (await get('SELECT id FROM seasons LIMIT 1')) return;
      await run(
        'INSERT INTO seasons(id,starts_at,ends_at) VALUES(1,?,?)',
        now,
        now + SEASON_LENGTH,
      );
      await log('La saison 01 est ouverte. Le monde vous attend.', '#111111', null, 1, now);
    });
    season = (await get<Season>(
      'SELECT id,starts_at,ends_at,archived_at FROM seasons ORDER BY id DESC LIMIT 1',
    ))!;
  }
  if (season.ends_at > now) return season;
  // A single transaction archives the exact boundary, clears balances, and advances missed seasons.
  await transaction(async () => {
    const live = (await get<Season>(
      'SELECT id,starts_at,ends_at,archived_at FROM seasons ORDER BY id DESC LIMIT 1',
    ))!;
    if (live.ends_at > now) return;
    const season = live;
    const finalMap = await territories(season.id, season.ends_at - 1, true, true, false);
    const totals = new Map<
      string,
      { id: string; name: string; territories: number; alliance: boolean }
    >();
    for (const t of finalMap)
      if (t.owner) {
        const entry = totals.get(t.owner.id) || {
          id: t.owner.id,
          name: t.owner.name,
          territories: 0,
          alliance: t.owner.alliance,
        };
        entry.territories++;
        totals.set(t.owner.id, entry);
      }
    const champions = [...totals.values()].sort((a, b) => b.territories - a.territories);
    const eligibleUsers = new Set(
      (await all<{ id: string }>('SELECT id FROM users WHERE banned=0')).map((u) => u.id),
    );
    const rewards = calculateRewards(
      season.starts_at,
      season.ends_at,
      await all<ControlPeriod>('SELECT * FROM ownership_periods WHERE season_id=?', season.id),
      await all<RewardContribution>('SELECT * FROM contributions WHERE season_id=?', season.id),
      await all<FundingShare>(
        'SELECT f.* FROM contribution_funding f JOIN contributions c ON c.id=f.contribution_id WHERE c.season_id=?',
        season.id,
      ),
      await all<MembershipPeriod>(
        'SELECT * FROM alliance_memberships WHERE joined_at<? AND (left_at IS NULL OR left_at>?)',
        season.ends_at,
        season.starts_at,
      ),
      await all<{ contribution_id: string; amount: number; created_at: number }>(
        'SELECT b.* FROM influence_burns b JOIN contributions c ON c.id=b.contribution_id WHERE c.season_id=?',
        season.id,
      ),
    ).filter((r) => eligibleUsers.has(r.userId));
    for (const reward of rewards)
      await run(
        'INSERT OR IGNORE INTO season_rewards VALUES(?,?,?,?,?,?,?)',
        season.id,
        reward.userId,
        season.id + 1,
        reward.capacityBonus,
        reward.rateBonus,
        reward.startingInfluence,
        JSON.stringify(reward),
      );
    await run(
      'UPDATE ownership_periods SET ends_at=? WHERE season_id=? AND ends_at IS NULL',
      season.ends_at,
      season.id,
    );
    await run(
      'UPDATE seasons SET archived_at=?,snapshot=? WHERE id=?',
      now,
      JSON.stringify({
        territories: finalMap,
        ranking: champions,
        allianceChampion: champions.find((c) => c.alliance) || null,
        independentChampion: champions.find((c) => !c.alliance) || null,
        rewards,
        mostContested: finalMap
          .filter((t) => t.changes > 1)
          .sort((a, b) => b.changes - a.changes)
          .slice(0, 10)
          .map((t) => ({
            id: t.id,
            name: countries.find((c) => c.id === t.id)?.name,
            changes: t.changes,
          })),
        summary: champions[0]
          ? `${champions[0].name} · ${champions[0].territories} territoires`
          : 'Une saison sans conquête',
      }),
      season.id,
    );
    let starts = season.ends_at;
    let id = season.id + 1;
    while (starts + SEASON_LENGTH <= now) {
      await run(
        'INSERT INTO seasons(id,starts_at,ends_at,archived_at,snapshot) VALUES(?,?,?,?,?)',
        id,
        starts,
        starts + SEASON_LENGTH,
        now,
        JSON.stringify({ territories: [], ranking: [], summary: 'Aucune activité' }),
      );
      starts += SEASON_LENGTH;
      id++;
    }
    await run(
      'INSERT INTO seasons(id,starts_at,ends_at) VALUES(?,?,?)',
      id,
      starts,
      starts + SEASON_LENGTH,
    );
    await run(
      'UPDATE users SET wallet=0,collected_slots=0,generation_anchor=?,capacity_bonus=0,rate_bonus=0,reward_season=?',
      starts,
      id,
    );
    if (id === season.id + 1)
      for (const reward of rewards)
        await run(
          'UPDATE users SET wallet=?,capacity_bonus=?,rate_bonus=? WHERE id=?',
          reward.startingInfluence,
          reward.capacityBonus,
          reward.rateBonus,
          reward.userId,
        );
    await run('UPDATE alliances SET treasury=0');
    await run('UPDATE treasury_lots SET remaining=0 WHERE season_id<=?', season.id);
    await log(
      `La saison ${String(id).padStart(2, '0')} commence. À vous de jouer.`,
      '#ff5d35',
      null,
      id,
      now,
    );
  });
  return (await get<Season>(
    'SELECT id,starts_at,ends_at,archived_at FROM seasons ORDER BY id DESC LIMIT 1',
  ))!;
}
export async function publicPlayer(id: string, now = Date.now()): Promise<Player | null> {
  return transaction(async () => {
    const u = await get('SELECT * FROM users WHERE id=? AND banned=0', id);
    if (!u) return null;
    const anchor = Number(u.generation_anchor);
    const currentId = Number((await get('SELECT MAX(id) AS id FROM seasons'))?.id || 1);
    const rewarded = Number(u.reward_season) === currentId;
    const stockCap = STOCK_CAP + (rewarded ? Number(u.capacity_bonus) : 0);
    const rate = GENERATION_RATE + (rewarded ? Number(u.rate_bonus) : 0);
    const slots = generationSlots(anchor, now);
    const wallet = generatedStock(
      Number(u.wallet),
      slots - Number(u.collected_slots),
      stockCap,
      rate,
    );
    if (slots > Number(u.collected_slots) || wallet !== Number(u.wallet))
      await run(
        'UPDATE users SET wallet=?,collected_slots=MAX(collected_slots,?) WHERE id=?',
        wallet,
        slots,
        id,
      );
    const reward = await get<{ season_id: number; metrics: string }>(
      'SELECT season_id,metrics FROM season_rewards WHERE user_id=? AND target_season=?',
      id,
      currentId,
    );
    return {
      id,
      username: String(u.username),
      color: String(u.color),
      wallet,
      reserve: 0,
      stockCap,
      generationRate: rate,
      seasonBonus: reward
        ? { ...JSON.parse(reward.metrics), sourceSeason: reward.season_id }
        : null,
      nextGenerationAt: nextGeneration(anchor, now),
      alliance_id: u.alliance_id as string | null,
      alliance_role: String(u.alliance_role) as Player['alliance_role'],
      alliance_joined_at: Number(u.alliance_joined_at),
      cooldown_until: Number(u.cooldown_until),
      created_at: Number(u.created_at),
      isAdmin: Number(u.is_admin) === 1,
      appearance: await appearance(id),
    };
  });
}
export async function snapshot(userId: string | null): Promise<Snapshot> {
  return transaction(async () => {
    const now = Date.now();
    const season = await currentSeason(now);
    const map = await territories(season.id, now);
    const playerProgression = userId ? await progression(userId, season.id, now) : null;
    const alliances = await all<Alliance & { created_at: number; target_ids: string }>(
      'SELECT a.*,u.username AS leader,(SELECT COUNT(*) FROM users m WHERE m.alliance_id=a.id AND m.banned=0) AS members FROM alliances a JOIN users u ON u.id=a.leader_id WHERE a.active=1 ORDER BY a.created_at',
    );
    for (const a of alliances) {
      a.targets = JSON.parse(a.target_ids);
      a.memberLimit = ALLIANCE_LIMIT;
      a.treasuryCap = TREASURY_CAP;
      a.territories = map.filter((t) => t.owner?.id === a.id).length;
      a.influence = map.reduce(
        (sum, t) => sum + (t.scores.find((c) => c.id === a.id)?.score || 0),
        0,
      );
    }
    const leaders = new Map<string, Camp>();
    for (const t of map)
      if (t.owner) {
        const old = leaders.get(t.owner.id);
        leaders.set(t.owner.id, { ...t.owner, score: (old?.score || 0) + 1 });
      }
    return {
      player: userId ? await publicPlayer(userId, now) : null,
      account: userId
        ? await get<{ email: string | null; emailVerified: number }>(
            'SELECT email,CASE WHEN email_verified_at IS NULL THEN 0 ELSE 1 END AS emailVerified FROM users WHERE id=?',
            userId,
          ).then((a) => (a ? { email: a.email, emailVerified: !!a.emailVerified } : null))
        : null,
      realtime:
        usesPostgres() &&
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
          ? {
              url: process.env.NEXT_PUBLIC_SUPABASE_URL,
              key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
            }
          : null,
      paymentsMode: paymentStatus().mode,
      progression: playerProgression,
      territories: map,
      alliances,
      activity: (await all(
        'SELECT * FROM activity WHERE season_id=? ORDER BY id DESC LIMIT 25',
        season.id,
      )) as unknown as Snapshot['activity'],
      season,
      players: Number(
        (await get('SELECT COUNT(*) AS n FROM users WHERE demo=0 AND banned=0'))?.n || 0,
      ),
      contributions: map.reduce(
        (total, t) => total + t.scores.reduce((sum, c) => sum + c.score, 0),
        0,
      ),
      paymentsEnabled: paymentStatus().enabled,
      leaderboard: [...leaders.values()].sort(
        (a, b) => b.score - a.score || a.name.localeCompare(b.name),
      ),
      sponsorAuctions: await sponsorMarket(now),
      sponsorWallet: userId ? await sponsorWallet(userId) : null,
      sponsorCampaigns: userId
        ? ((await all(
            "SELECT * FROM sponsors WHERE user_id=? AND status='approved' ORDER BY created_at",
            userId,
          )) as unknown as Snapshot['sponsorCampaigns'])
        : [],
      alliedCampIds: userId
        ? (
            await all<{ id: string }>(
              'SELECT id FROM users WHERE alliance_id=(SELECT alliance_id FROM users WHERE id=?) AND banned=0',
              userId,
            )
          )
            .map((member) => member.id)
            .concat(
              String(
                (await get('SELECT alliance_id FROM users WHERE id=?', userId))?.alliance_id || '',
              ),
            )
            .filter(Boolean)
        : [],
      archived: (
        await all<{ id: number; starts_at: number; ends_at: number; snapshot: string }>(
          'SELECT * FROM seasons WHERE archived_at IS NOT NULL ORDER BY id DESC',
        )
      ).map((s) => ({
        id: s.id,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        summary: JSON.parse(s.snapshot).summary,
      })),
      serverTime: now,
    };
  });
}
