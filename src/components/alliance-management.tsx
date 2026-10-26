'use client';
import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Crosshair, Wallet } from 'lucide-react';
import countries from '@/data/countries.json';
import type { Alliance, Player } from '@/lib/types';

type Act = (body: Record<string, unknown>, success?: string) => Promise<boolean>;
type Ledger = {
  id: string;
  username: string;
  kind: string;
  amount: number;
  country_id: string | null;
};
const number = (value: number) => new Intl.NumberFormat('fr-FR').format(value);
const pacific = new Set([
  'AU',
  'NZ',
  'FJ',
  'VU',
  'SB',
  'PG',
  'FM',
  'MH',
  'PW',
  'NR',
  'TV',
  'KI',
  'WS',
  'TO',
  'NC',
  'PF',
  'WF',
  'GU',
  'MP',
  'AS',
  'CK',
  'NU',
  'TK',
]);

function ObjectiveEditor({ alliance, busy, act }: { alliance: Alliance; busy: boolean; act: Act }) {
  const [targets, setTargets] = useState(alliance.targets);
  const [query, setQuery] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await act(
      { action: 'alliance-objective', objective: data.get('objective'), targets },
      'Objectifs de l’alliance enregistrés.',
    );
  }
  const matches = countries.filter((c) =>
    c.name.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')),
  );
  return (
    <form className="objective-editor" onSubmit={(event) => void save(event)}>
      <label>
        But de l’alliance
        <textarea
          name="objective"
          rows={2}
          maxLength={180}
          defaultValue={alliance.objective}
          placeholder="Contrôler le Pacifique, défendre nos îles…"
        />
      </label>
      <div className="objective-toolbar">
        <strong>
          Cibles autorisées · {targets.length}/{countries.length}
        </strong>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            setTargets(
              countries.filter((c) => pacific.has(c.code) || c.id === 'us-hi').map((c) => c.id),
            )
          }
        >
          Sélection Pacifique
        </button>
      </div>
      <input
        aria-label="Filtrer les cibles de l’alliance"
        placeholder="Rechercher un pays cible…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="objective-targets">
        {matches.map((country) => (
          <label key={country.id}>
            <input
              type="checkbox"
              checked={targets.includes(country.id)}
              disabled={!targets.includes(country.id) && targets.length >= countries.length}
              onChange={(event) =>
                setTargets(
                  event.target.checked
                    ? [...targets, country.id]
                    : targets.filter((id) => id !== country.id),
                )
              }
            />
            <span>{country.name}</span>
          </label>
        ))}
      </div>
      <p className="muted">
        Les attaques d’alliance sont limitées à cette liste. Sans cible, aucune attaque collective
        n’est possible. Vos attaques personnelles restent libres.
      </p>
      <button className="secondary full" disabled={busy}>
        Enregistrer la stratégie <Crosshair size={14} />
      </button>
    </form>
  );
}

export default function AllianceManagement({
  alliance,
  player,
  act,
  busy,
  ledger,
}: {
  alliance: Alliance;
  player: Player;
  act: Act;
  busy: boolean;
  ledger: Ledger[];
}) {
  const [amount, setAmount] = useState(20);
  const max = Math.min(player.wallet, alliance.treasuryCap - alliance.treasury);
  return (
    <section className="alliance-management">
      <div className="treasury-overview">
        <span>
          <Wallet size={17} /> TRÉSORERIE COMMUNE
        </span>
        <strong>
          {number(alliance.treasury)} <small>/ {number(alliance.treasuryCap)} Influence</small>
        </strong>
      </div>
      <form
        className="treasury-deposit"
        onSubmit={(event) => {
          event.preventDefault();
          void act({ action: 'alliance-deposit', amount }, 'Contribution versée à la trésorerie.');
        }}
      >
        <label>
          Votre contribution
          <input
            type="number"
            aria-label="Influence à verser à la trésorerie"
            min={1}
            max={max}
            step={1}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
          />
        </label>
        <button
          className="primary"
          disabled={busy || amount < 1 || !Number.isInteger(amount) || amount > max}
        >
          Verser à l’alliance <ArrowUpRight size={14} />
        </button>
      </form>
      <p className="muted">
        Les dons sont définitifs. Seuls le chef et les généraux peuvent engager ces fonds sur les
        cibles autorisées. La trésorerie repart à zéro à chaque saison.
      </p>
      <div className="alliance-objective">
        <span className="eyebrow">OBJECTIF COMMUN</span>
        <p>{alliance.objective || 'Le chef doit définir la stratégie et les pays cibles.'}</p>
        <small>
          {alliance.targets.length} cibles ·{' '}
          {alliance.targets.filter((id) => countries.some((c) => c.id === id)).length
            ? 'Attaques limitées à la stratégie'
            : 'Attaques collectives suspendues'}
        </small>
      </div>
      {player.id === alliance.leader_id ? (
        <details className="strategy-settings" open={!alliance.targets.length}>
          <summary>Définir les objectifs</summary>
          <ObjectiveEditor
            key={`${alliance.objective}-${alliance.targets.join(',')}`}
            alliance={alliance}
            busy={busy}
            act={act}
          />
        </details>
      ) : (
        alliance.targets.length > 0 && (
          <details className="strategy-settings">
            <summary>Voir les pays cibles</summary>
            <p className="target-names">
              {alliance.targets.map((id) => countries.find((c) => c.id === id)?.name).join(' · ')}
            </p>
          </details>
        )
      )}
      <details className="strategy-settings">
        <summary>Journal de la trésorerie</summary>
        <div className="treasury-ledger">
          {ledger.length ? (
            ledger.map((entry) => (
              <div key={entry.id}>
                <span>
                  {entry.username}
                  <small>
                    {entry.kind === 'deposit'
                      ? 'Don à la trésorerie'
                      : entry.kind === 'border-attack'
                        ? `Offensive frontalière · ${countries.find((c) => c.id === entry.country_id)?.name || 'Territoire'}`
                        : entry.kind === 'attack'
                          ? `Attaque · ${countries.find((c) => c.id === entry.country_id)?.name || 'Territoire'}`
                          : 'Stratégie mise à jour'}
                  </small>
                </span>
                <strong>
                  {entry.kind === 'objective'
                    ? '—'
                    : entry.kind === 'border-attack'
                      ? `${number(entry.amount)} troupes`
                      : `${entry.kind === 'deposit' ? '+' : '−'}${number(entry.amount)}`}
                </strong>
              </div>
            ))
          ) : (
            <p className="muted">Les premières opérations apparaîtront ici.</p>
          )}
        </div>
      </details>
      <p className="alliance-reward-note">
        Les récompenses individuelles dépendent des fonds réellement engagés, du contrôle soutenu et
        de votre temps de participation. Un don inutilisé ne rapporte pas de bonus. Les petites
        alliances partagent leur contrôle entre moins de joueurs.
      </p>
    </section>
  );
}
