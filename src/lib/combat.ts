import { randomUUID } from 'node:crypto';
import adjacency from '@/data/neighbors.json';
import countries from '@/data/countries.json';
import { all, currentSeason, get, log, publicPlayer, run, territories, transaction } from './db';
import { activeInfluence, type ActiveInfluence } from './influence';
import type { FundingShare } from './season-rewards';

export class CombatError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type AttackOrder = {
  source: string;
  destination: string;
  target: string;
  amount: number;
  mode: 'solo' | 'alliance';
  requestId: string;
};
export function isNeighbor(a: string, b: string): boolean {
  return ((adjacency as Record<string, string[]>)[a] || []).includes(b);
}
export function attackOutcome(sent: number, defender: number) {
  const destroyed = Math.min(sent, defender);
  return {
    destroyed,
    survivors: sent - destroyed,
    defenderRemaining: defender - destroyed,
    totalBurned: destroyed * 2,
  };
}

// Preserve integer funding shares when troops move. Largest remainders avoid
// creating points, and the original commander keeps their original attribution.
export function proportionalFunding(
  funding: FundingShare[],
  originalAmount: number,
  survivors: number,
) {
  const shares = funding
    .map((f) => ({
      user_id: f.user_id,
      amount: Math.floor((f.amount * survivors) / originalAmount),
      remainder: (f.amount * survivors) % originalAmount,
    }))
    .sort((a, b) => b.remainder - a.remainder || a.user_id.localeCompare(b.user_id));
  let left = survivors - shares.reduce((sum, f) => sum + f.amount, 0);
  for (const share of shares)
    if (left > 0) {
      share.amount++;
      left--;
    }
  return shares.filter((f) => f.amount > 0);
}

export async function launchAttack(userId: string, order: AttackOrder, at = Date.now()) {
  return transaction(async () => {
    const previous = await get<{
      source_id: string;
      destination_id: string;
      target_camp: string;
      amount: number;
      mode: string;
      destroyed: number;
      survivors: number;
    }>('SELECT * FROM battle_orders WHERE user_id=? AND request_id=?', userId, order.requestId);
    if (previous) {
      if (
        previous.source_id !== order.source ||
        previous.destination_id !== order.destination ||
        previous.target_camp !== order.target ||
        previous.amount !== order.amount ||
        previous.mode !== order.mode
      )
        throw new CombatError('Cette référence d’attaque a déjà été utilisée.', 409);
      return {
        destroyed: previous.destroyed,
        survivors: previous.survivors,
        defenderRemaining: 0,
        totalBurned: 2 * previous.destroyed,
      };
    }
    if (!Number.isSafeInteger(order.amount) || order.amount < 1 || order.amount > 1000000)
      throw new CombatError('Nombre de troupes invalide.');
    if (!isNeighbor(order.source, order.destination))
      throw new CombatError('Une attaque nécessite une frontière terrestre commune.');
    const season = await currentSeason(at);
    const player = await publicPlayer(userId, at);
    if (!player) throw new CombatError('Connexion requise.', 401);
    let campId = userId;
    if (order.mode === 'alliance') {
      if (!player.alliance_id || !['leader', 'general'].includes(player.alliance_role))
        throw new CombatError(
          'Seuls le chef et les généraux peuvent déplacer les troupes de l’alliance.',
          403,
        );
      const alliance = await get<{ target_ids: string }>(
        'SELECT target_ids FROM alliances WHERE id=? AND active=1',
        player.alliance_id,
      );
      if (!alliance || !(JSON.parse(alliance.target_ids) as string[]).includes(order.destination))
        throw new CombatError('Ce pays est hors des objectifs définis par le chef.', 403);
      campId = player.alliance_id;
    }
    if (order.target === campId)
      throw new CombatError('Vous ne pouvez pas attaquer votre propre camp.');
    const world = await territories(season.id, at);
    const source = world.find((t) => t.id === order.source);
    const destination = world.find((t) => t.id === order.destination);
    if (source?.owner?.id !== campId)
      throw new CombatError('Votre camp doit contrôler le pays de départ.', 403);
    const defender = destination?.scores.find((c) => c.id === order.target);
    if (!defender) throw new CombatError('Ce rival n’a plus d’Influence active dans ce pays.', 409);
    const available = await activeInfluence(season.id, at);
    const lots = available
      .filter((c) => c.camp_id === campId && c.country_id === order.source)
      .sort((a, b) => a.expires_at - b.expires_at || a.id.localeCompare(b.id));
    const total = lots.reduce((sum, c) => sum + c.amount, 0);
    if (total < order.amount)
      throw new CombatError('Les troupes disponibles dans ce pays sont insuffisantes.', 409);
    const outcome = attackOutcome(order.amount, defender.score);
    const attackId = randomUUID();
    await run(
      'INSERT INTO battle_orders(id,user_id,request_id,source_id,destination_id,target_camp,amount,mode,destroyed,survivors,created_at,season_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      attackId,
      userId,
      order.requestId,
      order.source,
      order.destination,
      order.target,
      order.amount,
      order.mode,
      outcome.destroyed,
      outcome.survivors,
      at,
      season.id,
    );
    const withdraw = (lot: ActiveInfluence, amount: number) =>
      run(
        'INSERT INTO influence_burns VALUES(?,?,?,?,?)',
        randomUUID(),
        lot.id,
        attackId,
        amount,
        at,
      );
    let remainingDamage = outcome.destroyed;
    for (const lot of available
      .filter((c) => c.camp_id === order.target && c.country_id === order.destination)
      .sort((a, b) => a.expires_at - b.expires_at || a.id.localeCompare(b.id))) {
      const lost = Math.min(remainingDamage, lot.amount);
      if (lost) await withdraw(lot, lost);
      remainingDamage -= lost;
      if (!remainingDamage) break;
    }
    let toSend = order.amount,
      toLose = outcome.destroyed;
    for (const lot of lots) {
      const sent = Math.min(toSend, lot.amount),
        lost = Math.min(toLose, sent),
        surviving = sent - lost;
      await withdraw(lot, sent);
      if (surviving) {
        const child = randomUUID();
        await run(
          'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
          child,
          lot.user_id,
          campId,
          order.destination,
          surviving,
          at,
          lot.expires_at,
          season.id,
        );
        await run('INSERT INTO influence_transfers VALUES(?,?,?)', child, lot.id, attackId);
        const funding = await all<FundingShare>(
          'SELECT * FROM contribution_funding WHERE contribution_id=?',
          lot.id,
        );
        if (funding.length)
          for (const share of proportionalFunding(funding, lot.original_amount, surviving))
            await run(
              'INSERT INTO contribution_funding VALUES(?,?,?)',
              child,
              share.user_id,
              share.amount,
            );
      }
      toLose -= lost;
      toSend -= sent;
      if (!toSend) break;
    }
    if (order.mode === 'alliance')
      await run(
        'INSERT INTO alliance_ledger VALUES(?,?,?,?,?,?,?,?)',
        randomUUID(),
        campId,
        userId,
        season.id,
        'border-attack',
        order.amount,
        order.destination,
        at,
      );
    const actor =
      order.mode === 'alliance'
        ? String((await get('SELECT name FROM alliances WHERE id=?', campId))!.name)
        : player.username;
    const name = (id: string) => countries.find((c) => c.id === id)?.name || id;
    await log(
      `${actor} attaque ${defender.name} en ${name(order.destination)} depuis ${name(order.source)} : ${outcome.totalBurned} Influence brûlée, ${outcome.survivors} troupes installées.`,
      player.color,
      order.destination,
      season.id,
      at,
    );
    await territories(season.id, at);
    return outcome;
  });
}
