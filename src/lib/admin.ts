import { currentSeason, get, log, run, territories, transaction } from './db';
import { GameError } from './auth';

export async function resetConquestMap(
  userId: string,
  seasonId: number,
  resetBefore: number,
  confirmation: string,
  at = Date.now(),
) {
  return transaction(async () => {
    const admin = await get<{ is_admin: number; username: string }>(
      'SELECT is_admin,username FROM users WHERE id=? AND banned=0',
      userId,
    );
    if (Number(admin?.is_admin) !== 1) throw new GameError('Accès administrateur requis.', 403);
    if (confirmation !== 'REINITIALISER')
      throw new GameError('Saisissez REINITIALISER pour confirmer.');
    const season = await currentSeason(at);
    if (season.id !== seasonId)
      throw new GameError('La saison a changé. Rouvrez le panneau administrateur.', 409);
    if (!Number.isSafeInteger(resetBefore) || resetBefore > at || resetBefore < at - 5 * 60000)
      throw new GameError('La confirmation a expiré. Rouvrez le panneau administrateur.', 409);
    const resetId = `${userId}:${resetBefore}`;
    if (await get('SELECT id FROM admin_resets WHERE id=?', resetId)) return;
    // Record the confirmation atomically so a retry cannot erase new conquests.
    await run('INSERT INTO admin_resets VALUES(?,?,?,?)', resetId, userId, season.id, at);
    await territories(season.id, at);
    const result = await run(
      'UPDATE contributions SET expires_at=? WHERE season_id=? AND expires_at>?',
      at,
      season.id,
      at,
    );
    await territories(season.id, at);
    await run('UPDATE ownership SET changes=0 WHERE season_id=? AND camp_id IS NULL', season.id);
    if (Number(result.changes))
      await log(
        `${admin!.username} a remis la conquête de la carte à zéro.`,
        '#111111',
        null,
        season.id,
        at,
      );
  });
}
