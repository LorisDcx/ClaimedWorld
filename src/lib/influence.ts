import { all } from './db';
import type { RewardContribution } from './season-rewards';

export interface ActiveInfluence extends RewardContribution {
  original_amount: number;
  season_id: number;
}
export function activeInfluence(season: number, at: number): ActiveInfluence[] {
  return all<ActiveInfluence & { remaining: number }>(
    `
    SELECT * FROM (
      SELECT c.*,c.amount AS original_amount,c.amount-COALESCE((SELECT SUM(b.amount) FROM influence_burns b WHERE b.contribution_id=c.id AND b.created_at<=?),0) AS remaining
      FROM contributions c WHERE c.season_id=? AND c.expires_at>? AND c.created_at<=?
    ) WHERE remaining>0`,
    at,
    season,
    at,
    at,
  ).map((c) => ({ ...c, amount: c.remaining }));
}
