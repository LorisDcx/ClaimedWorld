import { all, get, run, transaction } from './db';
import {
  ACHIEVEMENTS,
  CONTROL_OBJECTIVES,
  COSMETICS,
  DEFAULT_APPEARANCE,
  HOUR,
  controlWindow,
  type Appearance,
  type ControlInterval,
  type CosmeticSlot,
  type Progression,
} from './progression-catalog';

export class ProgressionError extends Error {
  status = 400;
}
type Settings = {
  frame: string;
  title: string;
  border: string;
  tutorial_step: number;
  tutorial_dismissed: number;
};

async function settings(userId: string): Promise<Settings> {
  await run('INSERT OR IGNORE INTO player_progress(user_id) VALUES(?)', userId);
  return (await get<Settings>('SELECT * FROM player_progress WHERE user_id=?', userId))!;
}

export async function appearance(userId: string): Promise<Appearance> {
  const selected = await get<Settings>('SELECT * FROM player_progress WHERE user_id=?', userId);
  if (!selected) return { ...DEFAULT_APPEARANCE };
  const result = { ...DEFAULT_APPEARANCE };
  for (const slot of ['frame', 'title', 'border'] as const) {
    const cosmetic = COSMETICS.find((c) => c.id === selected[slot] && c.slot === slot);
    if (
      cosmetic &&
      (!cosmetic.requires ||
        (await get(
          'SELECT id FROM progression_unlocks WHERE user_id=? AND id=?',
          userId,
          cosmetic.requires,
        )))
    )
      result[slot] = cosmetic.style;
  }
  return result;
}

export async function progression(
  userId: string,
  seasonId: number,
  now = Date.now(),
): Promise<Progression> {
  return transaction(async () => {
    const selected = await settings(userId);
    const totals = (await get<{
      spent: number;
      conquered: number;
      holdHours: number;
      funded: number;
    }>(
      `
      SELECT
        COALESCE((SELECT SUM(amount) FROM contributions WHERE user_id=? AND camp_id=? AND created_at<=? AND id NOT IN (SELECT contribution_id FROM influence_transfers)),0) AS spent,
        (SELECT COUNT(DISTINCT country_id) FROM ownership_periods WHERE camp_id=? AND starts_at<=?) AS conquered,
        COALESCE((SELECT MAX(MAX(0,MIN(COALESCE(ends_at,?),?)-starts_at)) FROM ownership_periods WHERE camp_id=? AND starts_at<=?),0)/CAST(? AS DOUBLE PRECISION) AS holdHours,
        COALESCE((SELECT SUM(f.amount) FROM contribution_funding f JOIN contributions c ON c.id=f.contribution_id WHERE f.user_id=? AND c.camp_id<>? AND c.created_at<=? AND c.id NOT IN (SELECT contribution_id FROM influence_transfers)),0) AS funded`,
      userId,
      userId,
      now,
      userId,
      now,
      now,
      now,
      userId,
      now,
      HOUR * 1.0,
      userId,
      userId,
      now,
    ))!;
    for (const success of ACHIEVEMENTS) {
      if (totals[success.metric] >= success.target)
        await run(
          'INSERT OR IGNORE INTO progression_unlocks VALUES(?,?,?)',
          userId,
          success.id,
          now,
        );
    }
    let objective: Progression['objective'] = null;
    const active = await get<{ objective_id: string; season_id: number; started_at: number }>(
      'SELECT * FROM player_objectives WHERE user_id=?',
      userId,
    );
    if (active) {
      const definition = CONTROL_OBJECTIVES.find((o) => o.id === active.objective_id);
      if (definition) {
        const deadline = Number(
          (await get('SELECT ends_at FROM seasons WHERE id=?', active.season_id))?.ends_at ?? now,
        );
        const at = Math.min(now, deadline);
        const periods = await all<ControlInterval>(
          'SELECT country_id,starts_at,ends_at FROM ownership_periods WHERE camp_id=? AND season_id=? AND starts_at<=?',
          userId,
          active.season_id,
          at,
        );
        const window = controlWindow(
          definition.countries,
          periods,
          active.started_at,
          at,
          definition.duration,
        );
        if (window.completedAt !== null)
          await run(
            'INSERT OR IGNORE INTO progression_unlocks VALUES(?,?,?)',
            userId,
            `goal:${definition.id}`,
            window.completedAt,
          );
        if (active.season_id === seasonId)
          objective = {
            id: definition.id,
            startedAt: active.started_at,
            ...window,
            completedAt:
              Number(
                (
                  await get(
                    'SELECT unlocked_at FROM progression_unlocks WHERE user_id=? AND id=?',
                    userId,
                    `goal:${definition.id}`,
                  )
                )?.unlocked_at || 0,
              ) || null,
            controlled: definition.countries.filter((id) =>
              periods.some(
                (p) =>
                  p.country_id === id &&
                  p.starts_at <= now &&
                  (p.ends_at === null || p.ends_at > now),
              ),
            ),
          };
      }
    }
    return {
      unlocks: (
        await all<{ id: string; unlocked_at: number }>(
          'SELECT id,unlocked_at FROM progression_unlocks WHERE user_id=? ORDER BY unlocked_at,id',
          userId,
        )
      ).map((r) => ({ id: r.id, unlockedAt: r.unlocked_at })),
      metrics: totals,
      equipped: { frame: selected.frame, title: selected.title, border: selected.border },
      appearance: await appearance(userId),
      objective,
      tutorial: { step: selected.tutorial_step, dismissed: !!selected.tutorial_dismissed },
    };
  });
}

export async function equipCosmetic(
  userId: string,
  cosmeticId: string,
  seasonId: number,
  now = Date.now(),
) {
  await transaction(async () => {
    await progression(userId, seasonId, now);
    const cosmetic = COSMETICS.find((c) => c.id === cosmeticId);
    if (!cosmetic) throw new ProgressionError('Apparence inconnue.');
    if (
      cosmetic.requires &&
      !(await get(
        'SELECT id FROM progression_unlocks WHERE user_id=? AND id=?',
        userId,
        cosmetic.requires,
      ))
    )
      throw new ProgressionError('Débloquez d’abord le succès ou l’objectif associé.');
    const columns: Record<CosmeticSlot, string> = {
      frame: 'frame',
      title: 'title',
      border: 'border',
    };
    await run(
      `UPDATE player_progress SET ${columns[cosmetic.slot]}=? WHERE user_id=?`,
      cosmetic.id,
      userId,
    );
  });
}

export async function selectObjective(
  userId: string,
  objectiveId: string,
  seasonId: number,
  now = Date.now(),
) {
  await transaction(async () => {
    await progression(userId, seasonId, now);
    if (!CONTROL_OBJECTIVES.some((o) => o.id === objectiveId))
      throw new ProgressionError('Objectif inconnu.');
    if (
      await get(
        'SELECT id FROM progression_unlocks WHERE user_id=? AND id=?',
        userId,
        `goal:${objectiveId}`,
      )
    )
      throw new ProgressionError('Cet objectif est déjà accompli.');
    const current = await get<{ objective_id: string; season_id: number }>(
      'SELECT * FROM player_objectives WHERE user_id=?',
      userId,
    );
    if (current?.objective_id === objectiveId && current.season_id === seasonId) return;
    await run(
      'INSERT INTO player_objectives VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET objective_id=excluded.objective_id,season_id=excluded.season_id,started_at=excluded.started_at',
      userId,
      objectiveId,
      seasonId,
      now,
    );
  });
}

export async function saveTutorial(userId: string, step: number, dismissed: boolean) {
  await settings(userId);
  await run(
    'UPDATE player_progress SET tutorial_step=?,tutorial_dismissed=? WHERE user_id=?',
    step,
    Number(dismissed),
    userId,
  );
}
