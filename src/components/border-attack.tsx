'use client';
import { useRef, useState } from 'react';
import { Flame, Swords } from 'lucide-react';
import adjacency from '@/data/neighbors.json';
import countries from '@/data/countries.json';
import type { Territory } from '@/lib/types';
import { chooseOwner } from '@/lib/rules';
type Action = (body: Record<string, unknown>, success?: string) => Promise<boolean>;

export default function BorderAttack({
  countryId,
  world,
  campId,
  mode,
  canCommand,
  restriction,
  busy,
  act,
  onSignup,
  reserve = 0,
  alliedCampIds = [],
}: {
  countryId: string;
  world: Territory[];
  campId?: string;
  mode: 'solo' | 'alliance';
  canCommand: boolean;
  restriction: string;
  busy: boolean;
  act: Action;
  onSignup: () => void;
  reserve?: number;
  alliedCampIds?: string[];
}) {
  const [sourceChoice, setSourceChoice] = useState('');
  const [targetChoice, setTargetChoice] = useState('');
  const [amount, setAmount] = useState(1);
  const [useStock, setUseStock] = useState(true);
  const [acknowledgeAlly, setAcknowledgeAlly] = useState(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const neighbors = (adjacency as Record<string, string[]>)[countryId] || [];
  const sources = world.filter((t) => campId && t.owner?.id === campId && neighbors.includes(t.id));
  const source = sources.find((s) => s.id === sourceChoice) || sources[0];
  const destination = world.find((t) => t.id === countryId);
  const enemies = destination?.scores.filter((c) => c.id !== campId) || [];
  const target = enemies.find((e) => e.id === targetChoice) || enemies[0];
  const garrison = source?.scores.find((c) => c.id === campId)?.score || 0;
  const available = garrison + (useStock ? reserve : 0);
  const fromStock = useStock ? Math.min(amount, reserve) : 0;
  const fromCountry = amount - fromStock;
  const friendly = !!target && alliedCampIds.includes(target.id);
  const validAmount = Number.isInteger(amount) && amount > 0 && amount <= available;
  const destroyed = Math.min(Math.max(0, amount), target?.score || 0);
  const survivors = Math.max(0, amount - destroyed);
  const myScore = destination?.scores.find((c) => c.id === campId)?.score || 0;
  const hypothetical = (destination?.scores || [])
    .filter((c) => c.id !== campId)
    .map((c) => ({ ...c, score: c.score - (c.id === target?.id ? destroyed : 0) }));
  if (campId && myScore + survivors > 0)
    hypothetical.push({
      id: campId,
      name: 'Votre camp',
      color: '#111111',
      emblem: '',
      alliance: mode === 'alliance',
      score: myScore + survivors,
    });
  const winnerId = chooseOwner(hypothetical, destination?.owner?.id || null);
  const winner = hypothetical.find((c) => c.id === winnerId);
  const originOwner =
    source &&
    chooseOwner(
      source.scores.map((c) => ({ ...c, score: c.score - (c.id === campId ? fromCountry : 0) })),
      source.owner?.id || null,
    );
  const name = (id: string) => countries.find((c) => c.id === id)?.name || id;
  return (
    <div className="border-attack-panel">
      <div className="attack-intro">
        <Swords size={22} strokeWidth={1.3} />
        <h3>Faites bouger la frontière.</h3>
        <p>
          Attaquez depuis un pays que vous contrôlez vers un voisin terrestre, en utilisant votre
          stock ou les forces sur place. Chaque point envoyé détruit un point du rival choisi. Seuls
          vos survivants s’installent.
        </p>
      </div>
      {!campId ? (
        <button className="primary full" onClick={onSignup}>
          Jouer gratuitement
        </button>
      ) : (
        <>
          {restriction && (
            <p className="attack-warning">{restriction} Vous pouvez toujours jouer en votre nom.</p>
          )}
          {!neighbors.length ? (
            <p className="attack-empty">
              Ce territoire n’a pas de frontière terrestre. Vous pouvez le revendiquer ou le
              renforcer dans Conquête.
            </p>
          ) : !sources.length ? (
            <p className="attack-empty">
              Contrôlez d’abord un pays limitrophe en{' '}
              {mode === 'alliance' ? 'alliance' : 'votre nom'} pour lancer une attaque. La
              revendication classique reste possible dans Conquête.
            </p>
          ) : !enemies.length ? (
            <p className="attack-empty">
              Aucun rival à attaquer dans ce pays. Pour vous y installer, utilisez Conquête.
            </p>
          ) : (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  !source ||
                  !target ||
                  !validAmount ||
                  !canCommand ||
                  (friendly && !acknowledgeAlly)
                )
                  return;
                const body = {
                  action: 'border-attack',
                  source: source.id,
                  destination: countryId,
                  target: target.id,
                  amount,
                  mode,
                  useStock,
                  acknowledgeAlly: friendly && acknowledgeAlly,
                };
                const key = JSON.stringify(body);
                if (pending.current?.key !== key)
                  pending.current = { key, id: crypto.randomUUID() };
                if (
                  await act(
                    { ...body, requestId: pending.current.id },
                    `Attaque exécutée : ${destroyed * 2} Influence brûlée et ${survivors} survivants déployés.`,
                  )
                ) {
                  pending.current = null;
                  setAmount(1);
                }
              }}
            >
              <label>
                Pays de départ
                <select
                  aria-label="Pays de départ"
                  value={source.id}
                  onChange={(e) => {
                    setSourceChoice(e.target.value);
                    setAmount(1);
                  }}
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {name(s.id)} · {s.owner?.score} Influence
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rival ciblé
                <select
                  aria-label="Rival ciblé"
                  value={target.id}
                  onChange={(e) => {
                    setTargetChoice(e.target.value);
                    setAcknowledgeAlly(false);
                  }}
                >
                  {enemies.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.score} Influence
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Origine des forces
                <select
                  aria-label="Origine des forces"
                  value={useStock ? 'stock' : 'country'}
                  onChange={(event) => setUseStock(event.target.value === 'stock')}
                >
                  <option value="stock">
                    {mode === 'alliance' ? 'Trésorerie' : 'Stock'} en priorité · {reserve}{' '}
                    disponibles
                  </option>
                  <option value="country">
                    Troupes du pays uniquement · {garrison} disponibles
                  </option>
                </select>
              </label>
              {friendly && (
                <div className="attack-warning" role="alert">
                  Attention : {target.name} fait partie de votre alliance. Vous n’appartenez qu’à
                  une alliance à la fois.
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={acknowledgeAlly}
                      onChange={(event) => setAcknowledgeAlly(event.target.checked)}
                    />
                    Je confirme l’attaque contre un allié
                  </label>
                </div>
              )}
              <label>
                Troupes à envoyer
                <input
                  aria-label="Troupes à envoyer"
                  type="number"
                  min={1}
                  max={available}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  required
                />
              </label>
              {validAmount && (
                <div className="attack-preview" aria-label="Résultat prévu">
                  <span className="eyebrow">SI LES SCORES RESTENT IDENTIQUES</span>
                  <dl>
                    <div>
                      <dt>{name(source.id)}</dt>
                      <dd>
                        {garrison} → <b>{garrison - fromCountry}</b>
                      </dd>
                    </div>
                    {useStock && (
                      <div>
                        <dt>{mode === 'alliance' ? 'Trésorerie' : 'Stock personnel'}</dt>
                        <dd>
                          {reserve} → <b>{reserve - fromStock}</b>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>{target.name} en défense</dt>
                      <dd>
                        {target.score} → <b>{target.score - destroyed}</b>
                      </dd>
                    </div>
                    <div>
                      <dt>Votre score à l’arrivée</dt>
                      <dd>
                        {myScore} → <b>{myScore + survivors}</b>
                      </dd>
                    </div>
                  </dl>
                  <p>
                    <Flame size={13} />
                    {destroyed * 2} Influence brûlée au total
                  </p>
                  <small>
                    {winner
                      ? `${winner.id === campId ? 'Votre camp' : winner.name} serait en tête avec ${winner.score} Influence.`
                      : 'Le pays deviendrait neutre.'}{' '}
                    Les autres rivaux ne perdent aucun point.
                  </small>
                  {originOwner !== campId && (
                    <p className="attack-warning">
                      Attention : vous pourriez perdre le contrôle de {name(source.id)}.
                    </p>
                  )}
                </div>
              )}
              <button
                className="primary full"
                disabled={busy || !validAmount || !canCommand || (friendly && !acknowledgeAlly)}
              >
                <Swords size={14} />
                Envoyer {Number.isFinite(amount) ? amount : 0} troupes
              </button>
            </form>
          )}
        </>
      )}
      <p className="standings-note">
        Le stock personnel ou la trésorerie peut compléter les troupes du pays de départ. Les
        troupes déjà sur la carte gardent leurs dates d’expiration d’origine ; les forces prises
        dans le stock commencent leur délai de 72 h. En alliance, seuls le chef et les généraux
        attaquent, vers les cibles autorisées.
      </p>
    </div>
  );
}
