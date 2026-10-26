import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import countries from '@/data/countries.json';
import {
  all,
  currentSeason,
  get,
  log,
  publicPlayer,
  run,
  snapshot,
  territories,
  transaction,
} from '@/lib/db';
import {
  checkPassword,
  createSession,
  endSession,
  GameError,
  hashPassword,
  rateLimit,
  sessionUser,
  assertSameOrigin,
} from '@/lib/auth';
import { CONTRIBUTION_LIFETIME, DAY, ALLIANCE_LIMIT, TREASURY_CAP } from '@/lib/rules';
import type { Alliance } from '@/lib/types';
import { moveSponsorFunds, placeSponsorFunds, SponsorError, sponsorMarket } from '@/lib/sponsoring';
import {
  appearance,
  equipCosmetic,
  progression,
  ProgressionError,
  saveTutorial,
  selectObjective,
} from '@/lib/progression';
import { CombatError, launchAttack } from '@/lib/combat';
import { activeInfluence } from '@/lib/influence';
import { notifyWorld } from '@/lib/world-events';
import { resetConquestMap } from '@/lib/admin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const username = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[\p{L}\p{N}_ .-]+$/u, 'Utilisez des lettres, chiffres, espaces ou tirets.');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().min(1).max(100);
function requireThat(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new GameError(message, status);
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = await sessionUser();
  await currentSeason();
  if (url.searchParams.has('profile')) {
    const profile = await get<{
      id: string;
      username: string;
      color: string;
      created_at: number;
      alliance_id: string | null;
    }>(
      'SELECT id,username,color,created_at,alliance_id FROM users WHERE id=? AND banned=0',
      url.searchParams.get('profile')!,
    );
    if (!profile) return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    const season = await currentSeason();
    const world = await territories(season.id);
    const badges = (
      await all<{ id: number; snapshot: string }>(
        'SELECT id,snapshot FROM seasons WHERE archived_at IS NOT NULL',
      )
    ).flatMap((s) => {
      const a = JSON.parse(s.snapshot);
      return a.independentChampion?.id === profile.id
        ? [{ season: s.id, title: 'Champion indépendant' }]
        : [];
    });
    return NextResponse.json(
      {
        profile,
        appearance: await appearance(profile.id),
        achievements: (await progression(profile.id, season.id)).unlocks,
        territories: world.filter((t) => t.owner?.id === profile.id).map((t) => t.id),
        badges,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (url.searchParams.has('mine')) {
    if (!userId) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
    return NextResponse.json({
      sponsors: await all(
        'SELECT * FROM sponsors WHERE user_id=? ORDER BY created_at DESC',
        userId,
      ),
      contributions: (await activeInfluence((await currentSeason()).id, Date.now()))
        .filter((c) => c.user_id === userId)
        .sort((a, b) => a.expires_at - b.expires_at),
    });
  }
  if (url.searchParams.has('alliance')) {
    const alliance = id.parse(url.searchParams.get('alliance'));
    return NextResponse.json({
      members: await all(
        `SELECT u.id,u.username,u.color,u.alliance_role,u.created_at,u.alliance_joined_at,
          COALESCE((SELECT SUM(amount) FROM alliance_ledger l WHERE l.user_id=u.id AND l.alliance_id=u.alliance_id AND l.kind='deposit' AND l.season_id=(SELECT MAX(id) FROM seasons)),0) AS donated,
          COALESCE((SELECT SUM(f.amount) FROM contribution_funding f JOIN contributions c ON c.id=f.contribution_id WHERE f.user_id=u.id AND c.camp_id=u.alliance_id AND c.season_id=(SELECT MAX(id) FROM seasons) AND c.id NOT IN (SELECT contribution_id FROM influence_transfers)),0) AS engaged
          FROM users u WHERE alliance_id=? AND banned=0 ORDER BY alliance_joined_at,id`,
        alliance,
      ),
      ledger: await all(
        'SELECT l.*,u.username FROM alliance_ledger l JOIN users u ON u.id=l.user_id WHERE l.alliance_id=? AND l.season_id=(SELECT MAX(id) FROM seasons) ORDER BY l.created_at DESC,l.id DESC LIMIT 80',
        alliance,
      ),
    });
  }
  if (url.searchParams.has('archive')) {
    const season = await get<{ snapshot: string }>(
      'SELECT snapshot FROM seasons WHERE id=? AND archived_at IS NOT NULL',
      Number(url.searchParams.get('archive')),
    );
    return NextResponse.json(
      season ? JSON.parse(season.snapshot) : { error: 'Saison introuvable.' },
      { status: season ? 200 : 404 },
    );
  }
  if (url.searchParams.has('admin')) {
    if (!userId || !(await publicPlayer(userId))?.isAdmin)
      return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
    return NextResponse.json({
      resetCutoff: Date.now(),
      sponsors: await all(
        'SELECT s.*,u.username FROM sponsors s LEFT JOIN users u ON s.user_id=u.id ORDER BY s.created_at DESC',
      ),
      reports: await all(
        'SELECT r.*,u.username FROM reports r JOIN users u ON r.user_id=u.id WHERE resolved=0 ORDER BY r.created_at DESC',
      ),
    });
  }
  return NextResponse.json(await snapshot(userId), { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    requireThat(
      request.headers.get('content-type')?.includes('application/json'),
      'Format non autorisé.',
      415,
    );
    const raw = await request.text();
    requireThat(raw.length < 12000, 'Requête trop volumineuse.', 413);
    const body = JSON.parse(raw);
    const action = z.string().parse(body.action);
    const now = Date.now();
    const season = await currentSeason(now);
    // Proxy headers are only trusted when the operator explicitly opts in.
    const ip =
      process.env.VERCEL === '1' || process.env.TRUST_PROXY === 'true'
        ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
        : 'local';
    await rateLimit(`request:${ip}`, 300, 60000);
    if (action === 'signup' || action === 'login') {
      await rateLimit(`auth:${ip}`, 20, 15 * 60000);
      const name = username.parse(body.username);
      const password = z.string().min(8).max(128).parse(body.password);
      if (action === 'signup') {
        requireThat(
          !(await get('SELECT id FROM users WHERE lower(username)=lower(?)', name)),
          'Ce pseudonyme est déjà utilisé.',
          409,
        );
        const chosen = color.parse(body.color || '#ff5d35');
        const uid = randomUUID();
        await run(
          'INSERT INTO users(id,username,password,color,created_at,generation_anchor) VALUES(?,?,?,?,?,?)',
          uid,
          name,
          hashPassword(password),
          chosen,
          now,
          now,
        );
        await createSession(uid);
        await notifyWorld();
        return NextResponse.json(await snapshot(uid));
      }
      const user = await get<{ id: string; password: string; banned: number }>(
        'SELECT * FROM users WHERE lower(username)=lower(?)',
        name,
      );
      const valid = checkPassword(
        password,
        user?.password || '00000000000000000000000000000000:' + '0'.repeat(128),
      );
      requireThat(user && valid && !user.banned, 'Pseudonyme ou mot de passe incorrect.', 401);
      await createSession(user.id);
      return NextResponse.json(await snapshot(user.id));
    }
    if (action === 'logout') {
      await endSession();
      return NextResponse.json(await snapshot(null));
    }
    const userId = await sessionUser();
    requireThat(userId, 'Connectez-vous pour participer.', 401);
    const user = await publicPlayer(userId, now);
    requireThat(user, 'Compte introuvable.', 401);
    await rateLimit(`action:${userId}`, 60, 60000);
    if (action === 'border-attack') {
      await launchAttack(
        userId,
        {
          source: id.parse(body.source),
          destination: id.parse(body.destination),
          target: id.parse(body.target),
          amount: z.number().int().min(1).max(1000000).parse(body.amount),
          mode: z.enum(['solo', 'alliance']).parse(body.mode ?? 'solo'),
          requestId: z.string().uuid().parse(body.requestId),
          useStock: z.boolean().parse(body.useStock ?? false),
          acknowledgeAlly: z.boolean().parse(body.acknowledgeAlly ?? false),
        },
        now,
      );
    } else if (action === 'equip-cosmetic') {
      await territories(season.id, now);
      await equipCosmetic(userId, id.parse(body.cosmeticId), season.id, now);
    } else if (action === 'select-objective') {
      await territories(season.id, now);
      await selectObjective(userId, id.parse(body.objectiveId), season.id, now);
    } else if (action === 'tutorial') {
      await saveTutorial(
        userId,
        z.number().int().min(0).max(4).parse(body.step),
        z.boolean().parse(body.dismissed),
      );
    } else if (action === 'collect') {
      throw new GameError(
        'La recharge est automatique. Le stock ne peut pas dépasser son plafond.',
      );
    } else if (action === 'contribute') {
      const country = id.parse(body.countryId);
      const amount = z.number().int().min(1).max(1000000).parse(body.amount);
      const mode = z.enum(['solo', 'alliance']).parse(body.mode ?? 'solo');
      requireThat(
        countries.some((c) => c.id === country),
        'Territoire inconnu.',
      );
      await transaction(async () => {
        const live = (await publicPlayer(userId, now))!;
        let campId = userId;
        if (mode === 'alliance') {
          requireThat(live.alliance_id, 'Alliance requise.', 403);
          requireThat(
            live.alliance_role === 'leader' || live.alliance_role === 'general',
            'Seuls le chef et les généraux peuvent attaquer pour l’alliance.',
            403,
          );
          const alliance = await get<Alliance & { target_ids: string }>(
            'SELECT * FROM alliances WHERE id=? AND active=1',
            live.alliance_id,
          );
          requireThat(alliance, 'Alliance introuvable.');
          requireThat(
            (JSON.parse(alliance.target_ids) as string[]).includes(country),
            'Ce pays ne fait pas partie des objectifs définis par le chef.',
            403,
          );
          requireThat(
            Number(
              (
                await run(
                  'UPDATE alliances SET treasury=treasury-? WHERE id=? AND treasury>=?',
                  amount,
                  alliance.id,
                  amount,
                )
              ).changes,
            ) === 1,
            'Trésorerie insuffisante.',
          );
          campId = alliance.id;
        } else {
          requireThat(live.wallet >= amount, 'Votre solde d’Influence est insuffisant.');
          await run('UPDATE users SET wallet=wallet-? WHERE id=?', amount, userId);
        }
        const contributionId = randomUUID();
        await run(
          'INSERT INTO contributions VALUES(?,?,?,?,?,?,?,?)',
          contributionId,
          userId,
          campId,
          country,
          amount,
          now,
          now + CONTRIBUTION_LIFETIME,
          season.id,
        );
        if (mode === 'alliance') {
          let remaining = amount;
          const funding = new Map<string, number>();
          for (const lot of await all<{ id: string; user_id: string; remaining: number }>(
            'SELECT id,user_id,remaining FROM treasury_lots WHERE alliance_id=? AND season_id=? AND remaining>0 ORDER BY created_at,id',
            campId,
            season.id,
          )) {
            const used = Math.min(remaining, lot.remaining);
            await run('UPDATE treasury_lots SET remaining=remaining-? WHERE id=?', used, lot.id);
            funding.set(lot.user_id, (funding.get(lot.user_id) || 0) + used);
            remaining -= used;
            if (!remaining) break;
          }
          requireThat(remaining === 0, 'Les fonds de trésorerie ne sont pas disponibles.', 409);
          for (const [donor, used] of funding)
            await run(
              'INSERT INTO contribution_funding VALUES(?,?,?)',
              contributionId,
              donor,
              used,
            );
          await run(
            'INSERT INTO alliance_ledger VALUES(?,?,?,?,?,?,?,?)',
            randomUUID(),
            campId,
            userId,
            season.id,
            'attack',
            amount,
            country,
            now,
          );
        }
        await territories(season.id, now);
      });
    } else if (action === 'alliance-deposit') {
      const amount = z.number().int().min(1).max(TREASURY_CAP).parse(body.amount);
      await transaction(async () => {
        const live = (await publicPlayer(userId, now))!;
        requireThat(live.alliance_id, 'Alliance requise.');
        requireThat(live.wallet >= amount, 'Votre solde d’Influence est insuffisant.');
        requireThat(
          Number(
            (
              await run(
                'UPDATE alliances SET treasury=treasury+? WHERE id=? AND active=1 AND treasury+?<=?',
                amount,
                live.alliance_id,
                amount,
                TREASURY_CAP,
              )
            ).changes,
          ) === 1,
          `La trésorerie est plafonnée à ${TREASURY_CAP} Influence.`,
        );
        await run('UPDATE users SET wallet=wallet-? WHERE id=?', amount, userId);
        await run(
          'INSERT INTO treasury_lots VALUES(?,?,?,?,?,?,?)',
          randomUUID(),
          live.alliance_id,
          userId,
          season.id,
          amount,
          amount,
          now,
        );
        await run(
          'INSERT INTO alliance_ledger VALUES(?,?,?,?,?,?,?,?)',
          randomUUID(),
          live.alliance_id,
          userId,
          season.id,
          'deposit',
          amount,
          null,
          now,
        );
      });
    } else if (action === 'alliance-objective') {
      const objective = z.string().trim().max(180).parse(body.objective);
      const targets = [...new Set(z.array(id).max(countries.length).parse(body.targets))];
      requireThat(
        targets.every((target) => countries.some((c) => c.id === target)),
        'Cible inconnue.',
      );
      await transaction(async () => {
        const live = (await publicPlayer(userId, now))!;
        requireThat(
          live.alliance_id && live.alliance_role === 'leader',
          'Seul le chef définit les objectifs.',
          403,
        );
        await run(
          'UPDATE alliances SET objective=?,target_ids=? WHERE id=? AND leader_id=?',
          objective,
          JSON.stringify(targets),
          live.alliance_id,
          userId,
        );
        await run(
          'INSERT INTO alliance_ledger VALUES(?,?,?,?,?,?,?,?)',
          randomUUID(),
          live.alliance_id,
          userId,
          season.id,
          'objective',
          0,
          null,
          now,
        );
      });
    } else if (action === 'profile') {
      const name = username.parse(body.username);
      const chosen = color.parse(body.color);
      requireThat(
        !(await get('SELECT id FROM users WHERE lower(username)=lower(?) AND id<>?', name, userId)),
        'Ce pseudonyme est déjà utilisé.',
        409,
      );
      await run('UPDATE users SET username=?,color=? WHERE id=?', name, chosen, userId);
    } else if (action === 'create-alliance') {
      requireThat(!user.alliance_id, 'Quittez votre alliance actuelle.');
      requireThat(user.cooldown_until <= now, 'Vous devez attendre 24 heures après votre départ.');
      const name = z.string().trim().min(3).max(30).parse(body.name);
      const chosen = color.parse(body.color);
      const description = z
        .string()
        .trim()
        .max(180)
        .parse(body.description || '');
      const emblem = z.enum(['✳', '◈', '✦', '⚑', '◎', '⌘']).parse(body.emblem || '✳');
      requireThat(
        !(await get('SELECT id FROM alliances WHERE lower(name)=lower(?)', name)),
        'Ce nom d’alliance est déjà utilisé.',
        409,
      );
      await transaction(async () => {
        const live = (await publicPlayer(userId, now))!;
        requireThat(
          !live.alliance_id && live.cooldown_until <= now,
          'Vous ne pouvez pas créer une alliance maintenant.',
        );
        const aid = randomUUID();
        await run(
          'INSERT INTO alliances(id,name,color,emblem,description,leader_id,invite,created_at) VALUES(?,?,?,?,?,?,?,?)',
          aid,
          name,
          chosen,
          emblem,
          description,
          userId,
          randomBytes(8).toString('hex'),
          now,
        );
        await run(
          "UPDATE users SET alliance_id=?,alliance_role='leader',alliance_joined_at=? WHERE id=?",
          aid,
          now,
          userId,
        );
        await run(
          'INSERT INTO alliance_memberships(user_id,alliance_id,joined_at) VALUES(?,?,?)',
          userId,
          aid,
          now,
        );
        await log(`${name} entre dans la partie.`, chosen, null, season.id, now);
      });
    } else if (action === 'join-alliance') {
      requireThat(!user.alliance_id, 'Quittez votre alliance actuelle.');
      requireThat(user.cooldown_until <= now, 'Vous devez attendre 24 heures après votre départ.');
      const alliance = await get<Alliance>(
        'SELECT * FROM alliances WHERE (id=? OR invite=?) AND active=1',
        id.parse(body.allianceId),
        id.parse(body.allianceId),
      );
      requireThat(alliance, 'Alliance introuvable.');
      await transaction(async () => {
        const live = (await publicPlayer(userId, now))!;
        requireThat(
          !live.alliance_id && live.cooldown_until <= now,
          'Vous ne pouvez pas rejoindre une alliance maintenant.',
        );
        requireThat(
          Number(
            (
              await get(
                'SELECT COUNT(*) AS n FROM users WHERE alliance_id=? AND banned=0',
                alliance.id,
              )
            )?.n || 0,
          ) < ALLIANCE_LIMIT,
          `Une alliance peut accueillir ${ALLIANCE_LIMIT} membres maximum.`,
        );
        await run(
          "UPDATE users SET alliance_id=?,alliance_role='member',alliance_joined_at=? WHERE id=?",
          alliance.id,
          now,
          userId,
        );
        await run(
          'INSERT INTO alliance_memberships(user_id,alliance_id,joined_at) VALUES(?,?,?)',
          userId,
          alliance.id,
          now,
        );
      });
    } else if (action === 'leave-alliance') {
      requireThat(user.alliance_id, 'Vous jouez déjà en solo.');
      await transaction(async () => {
        const live = (await publicPlayer(userId, now))!;
        requireThat(live.alliance_id, 'Vous jouez déjà en solo.');
        const alliance = (await get<Alliance>(
          'SELECT * FROM alliances WHERE id=?',
          live.alliance_id,
        ))!;
        if (alliance.leader_id === userId) {
          const members = await all<{ id: string }>(
            "SELECT id FROM users WHERE alliance_id=? AND id<>? AND banned=0 ORDER BY CASE WHEN alliance_role='general' THEN 0 ELSE 1 END,alliance_joined_at,id",
            alliance.id,
            userId,
          );
          const successor = body.successorId
            ? members.find((m) => m.id === body.successorId)
            : members[0];
          requireThat(!body.successorId || successor, 'Successeur invalide.');
          if (successor) {
            await run('UPDATE alliances SET leader_id=? WHERE id=?', successor.id, alliance.id);
            await run("UPDATE users SET alliance_role='leader' WHERE id=?", successor.id);
          } else await run('UPDATE alliances SET active=0 WHERE id=?', alliance.id);
        }
        await run(
          "UPDATE users SET alliance_id=NULL,alliance_role='member',cooldown_until=? WHERE id=?",
          now + DAY,
          userId,
        );
        await run(
          'UPDATE alliance_memberships SET left_at=? WHERE user_id=? AND alliance_id=? AND left_at IS NULL',
          now,
          userId,
          alliance.id,
        );
      });
    } else if (action === 'kick-member' || action === 'set-general' || action === 'set-coleader') {
      await transaction(async () => {
        const live = (await publicPlayer(userId, now))!;
        requireThat(live.alliance_id, 'Alliance requise.');
        const alliance = (await get<Alliance>(
          'SELECT * FROM alliances WHERE id=?',
          live.alliance_id,
        ))!;
        requireThat(alliance.leader_id === userId, 'Seul le chef peut gérer les membres.', 403);
        const target = id.parse(body.userId);
        requireThat(
          target !== userId &&
            (await get('SELECT id FROM users WHERE id=? AND alliance_id=?', target, alliance.id)),
          'Membre invalide.',
        );
        if (action === 'kick-member') {
          await run(
            "UPDATE users SET alliance_id=NULL,alliance_role='member',cooldown_until=0 WHERE id=?",
            target,
          );
          await run(
            'UPDATE alliance_memberships SET left_at=? WHERE user_id=? AND alliance_id=? AND left_at IS NULL',
            now,
            target,
            alliance.id,
          );
        } else
          await run(
            'UPDATE users SET alliance_role=? WHERE id=?',
            z.boolean().default(true).parse(body.enabled) ? 'general' : 'member',
            target,
          );
      });
    } else if (action === 'sponsor-place' || action === 'sponsor-move') {
      const campaign = id.parse(body.campaignId);
      const country = id.parse(body.countryId);
      const amount = z.number().int().min(1).max(100000000).parse(body.amountCents);
      requireThat(
        countries.some((c) => c.id === country),
        'Territoire inconnu.',
      );
      if (action === 'sponsor-place')
        await placeSponsorFunds(userId, campaign, country, amount, body.accepted === true, now);
      else {
        const from = id.parse(body.fromCountryId);
        requireThat(
          countries.some((c) => c.id === from),
          'Territoire inconnu.',
        );
        await moveSponsorFunds(
          userId,
          id.parse(body.fromCampaignId),
          from,
          campaign,
          country,
          amount,
          now,
        );
      }
    } else if (action === 'sponsor-proposal') {
      const country = body.countryId ? id.parse(body.countryId) : '';
      requireThat(!country || countries.some((c) => c.id === country), 'Territoire inconnu.');
      const name = z.string().trim().min(2).max(40).parse(body.name);
      const description = z.string().trim().min(5).max(180).parse(body.description);
      const url = z.url().max(400).parse(body.url);
      requireThat(new URL(url).protocol === 'https:', 'Utilisez un lien HTTPS.');
      const host = new URL(url).hostname;
      requireThat(
        !/^(localhost|.*\.local|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(host),
        'Adresse publique requise.',
      );
      requireThat(
        Number(
          (
            await get(
              "SELECT COUNT(*) AS n FROM sponsors WHERE user_id=? AND status='pending'",
              userId,
            )
          )?.n,
        ) < 3,
        'Trois propositions en attente maximum.',
      );
      const logoId = body.logoId ? z.string().uuid().parse(body.logoId) : null;
      requireThat(
        !logoId || (await get('SELECT id FROM uploads WHERE id=? AND user_id=?', logoId, userId)),
        'Logo invalide.',
      );
      await run(
        'INSERT INTO sponsors(id,user_id,country_id,season_id,name,description,url,initials,color,amount,created_at,logo_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        randomUUID(),
        userId,
        country,
        season.id,
        name,
        description,
        url,
        name.slice(0, 2).toUpperCase(),
        color.parse(body.color || '#ff5d35'),
        0,
        now,
        logoId,
      );
    } else if (action === 'report') {
      await rateLimit(`report:${userId}`, 5, 60 * 60000);
      await run(
        'INSERT INTO reports(id,user_id,target,reason,created_at) VALUES(?,?,?,?,?)',
        randomUUID(),
        userId,
        z.string().max(100).parse(body.target),
        z.string().trim().min(10).max(500).parse(body.reason),
        now,
      );
    } else if (action === 'admin-reset-map') {
      await resetConquestMap(
        userId,
        z.number().int().parse(body.seasonId),
        z.number().int().parse(body.resetBefore),
        z.string().parse(body.confirmation),
        now,
      );
    } else if (action === 'moderate') {
      requireThat(user.isAdmin, 'Accès refusé.', 403);
      const target = id.parse(body.id);
      const decision = z.enum(['approve', 'reject', 'resolve', 'ban']).parse(body.decision);
      if (decision === 'resolve') await run('UPDATE reports SET resolved=1 WHERE id=?', target);
      else if (decision === 'ban') {
        requireThat(target !== userId, 'Vous ne pouvez pas vous suspendre.');
        await transaction(async () => {
          await run('UPDATE users SET banned=1 WHERE id=?', target);
          await run('DELETE FROM sessions WHERE user_id=?', target);
        });
      } else {
        const sponsor = await get<{ payment_status: string }>(
          'SELECT payment_status FROM sponsors WHERE id=?',
          target,
        );
        requireThat(sponsor, 'Proposition introuvable.');
        await transaction(async () => {
          await sponsorMarket(now);
          await run(
            'UPDATE sponsors SET status=? WHERE id=?',
            decision === 'approve' ? 'approved' : 'rejected',
            target,
          );
          await sponsorMarket(now);
        });
      }
    } else throw new GameError('Action inconnue.');
    if (action !== 'tutorial') await notifyWorld();
    return NextResponse.json(await snapshot(userId));
  } catch (error) {
    if (
      error instanceof GameError ||
      error instanceof SponsorError ||
      error instanceof ProgressionError ||
      error instanceof CombatError
    )
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: 'Vérifiez les champs du formulaire.',
          details: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    console.error('Game action failed', error);
    return NextResponse.json({ error: 'Une erreur est survenue. Réessayez.' }, { status: 500 });
  }
}
