import { CONTRIBUTION_LIFETIME, DAY } from './rules';

export interface RewardMetrics {
  userId: string;
  activeDays: number;
  usefulInfluence: number;
  territoryDays: number;
  strength: number;
  capacityBonus: number;
  rateBonus: number;
  startingInfluence: number;
}
export interface ControlPeriod {
  country_id: string;
  camp_id: string;
  starts_at: number;
  ends_at: number | null;
}
export interface RewardContribution {
  id: string;
  user_id: string;
  camp_id: string;
  country_id: string;
  amount: number;
  created_at: number;
  expires_at: number;
}
export interface MembershipPeriod {
  user_id: string;
  alliance_id: string;
  joined_at: number;
  left_at: number | null;
}
export interface FundingShare {
  contribution_id: string;
  user_id: string;
  amount: number;
}

export function rewardFor(metrics: {
  activeDays: number;
  usefulInfluence: number;
  territoryDays: number;
}) {
  // The weakest requirement limits the reward. Buying many countries at the last
  // moment or donating unused funds cannot substitute for sustained useful play.
  const strength = Math.max(
    0,
    Math.min(
      1,
      metrics.activeDays / 14,
      metrics.usefulInfluence / 1000,
      Math.sqrt(Math.max(0, metrics.territoryDays) / 30),
    ),
  );
  return {
    strength,
    capacityBonus: Math.floor(20 * strength),
    rateBonus: Math.floor(2 * strength),
    startingInfluence: Math.floor(20 * strength),
  };
}

export function calculateRewards(
  start: number,
  end: number,
  periods: ControlPeriod[],
  contributions: RewardContribution[],
  funding: FundingShare[],
  memberships: MembershipPeriod[],
  burns: { contribution_id: string; amount: number; created_at: number }[] = [],
): RewardMetrics[] {
  const shares = new Map<string, FundingShare[]>();
  const burnsByContribution = new Map<string, typeof burns>();
  for (const burn of burns)
    burnsByContribution.set(burn.contribution_id, [
      ...(burnsByContribution.get(burn.contribution_id) || []),
      burn,
    ]);
  for (const share of funding)
    shares.set(share.contribution_id, [...(shares.get(share.contribution_id) || []), share]);
  const credits = new Map<
    string,
    { usefulInfluence: number; territoryDays: number; ranges: [number, number][] }
  >();
  const byCountryCamp = new Map<string, RewardContribution[]>();
  for (const contribution of contributions) {
    const key = `${contribution.country_id}:${contribution.camp_id}`;
    const group = byCountryCamp.get(key) || [];
    group.push(contribution);
    byCountryCamp.set(key, group);
  }
  for (const period of periods) {
    const left = Math.max(start, period.starts_at),
      right = Math.min(end, period.ends_at ?? end);
    if (right <= left) continue;
    const bids = (byCountryCamp.get(`${period.country_id}:${period.camp_id}`) || []).filter(
      (c) =>
        c.camp_id === period.camp_id &&
        c.country_id === period.country_id &&
        c.created_at < right &&
        c.expires_at > left,
    );
    const history = memberships.filter((m) => m.alliance_id === period.camp_id);
    const boundaries = [
      ...new Set(
        [
          left,
          right,
          ...bids.flatMap((c) => [c.created_at, c.expires_at]),
          ...bids.flatMap((c) => (burnsByContribution.get(c.id) || []).map((b) => b.created_at)),
          ...history.flatMap((m) => [m.joined_at, m.left_at ?? end]),
        ].filter((time) => time >= left && time <= right),
      ),
    ].sort((a, b) => a - b);
    for (let i = 1; i < boundaries.length; i++) {
      const from = boundaries[i - 1],
        to = boundaries[i];
      const active = bids
        .filter((c) => c.created_at <= from && c.expires_at >= to)
        .map((c) => ({
          ...c,
          originalAmount: c.amount,
          amount: Math.max(
            0,
            c.amount -
              (burnsByContribution.get(c.id) || [])
                .filter((b) => b.created_at <= from)
                .reduce((sum, b) => sum + b.amount, 0),
          ),
        }))
        .filter((c) => c.amount > 0);
      const total = active.reduce((sum, c) => sum + c.amount, 0);
      if (!total) continue;
      for (const bid of active) {
        const funded = shares.get(bid.id);
        const recipients = new Map<string, number>();
        if (funded?.length) {
          for (const donor of funded)
            recipients.set(
              donor.user_id,
              (recipients.get(donor.user_id) || 0) + (0.9 * donor.amount) / bid.originalAmount,
            );
          recipients.set(bid.user_id, (recipients.get(bid.user_id) || 0) + 0.1);
        } else recipients.set(bid.user_id, 1);
        for (const [userId, fraction] of recipients) {
          if (
            bid.camp_id !== userId &&
            !history.some(
              (m) => m.user_id === userId && m.joined_at <= from && (m.left_at ?? end) >= to,
            )
          )
            continue;
          const credit = credits.get(userId) || {
            usefulInfluence: 0,
            territoryDays: 0,
            ranges: [],
          };
          credit.usefulInfluence += (bid.amount * fraction * (to - from)) / CONTRIBUTION_LIFETIME;
          credit.territoryDays += ((bid.amount / total) * fraction * (to - from)) / DAY;
          credit.ranges.push([from, to]);
          credits.set(userId, credit);
        }
      }
    }
  }
  return [...credits].map(([userId, credit]) => {
    let duration = 0,
      lastEnd = start;
    for (const [from, to] of credit.ranges.sort((a, b) => a[0] - b[0])) {
      duration += Math.max(0, to - Math.max(from, lastEnd));
      lastEnd = Math.max(lastEnd, to);
    }
    const metrics = {
      activeDays: duration / DAY,
      usefulInfluence: credit.usefulInfluence,
      territoryDays: credit.territoryDays,
    };
    return { userId, ...metrics, ...rewardFor(metrics) };
  });
}
