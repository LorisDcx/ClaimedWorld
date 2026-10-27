'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Clock3, Plus, Wallet } from 'lucide-react';
import countries from '@/data/countries.json';
import type { SponsorConsoleData } from '@/lib/types';
import SupportCreator from './support-creator';
import { sponsorMinimum } from '@/lib/sponsor-pricing';
import { OPERATOR } from '@/lib/operator';

const credits = (amount: number) =>
  (amount / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (at: number) =>
  new Date(at).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
type Act = (body: Record<string, unknown>, success?: string) => Promise<boolean>;
export default function SponsorConsole({
  countryId,
  paymentsEnabled,
  paymentsMode,
  version,
  act,
  onCreate,
}: {
  countryId?: string;
  paymentsEnabled: boolean;
  paymentsMode?: 'disabled' | 'test' | 'live';
  version?: number;
  act: Act;
  onCreate: (country: string) => void;
}) {
  const [data, setData] = useState<SponsorConsoleData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [country, setCountry] = useState(countryId || '250');
  const [campaign, setCampaign] = useState('');
  const [amount, setAmount] = useState(String(sponsorMinimum(countryId || '250') / 100));
  const [accepted, setAccepted] = useState(false);
  const [topup, setTopup] = useState('20');
  const [terms, setTerms] = useState(false);
  const [sourceKey, setSourceKey] = useState('');
  const [destination, setDestination] = useState('276');
  const [moveCampaign, setMoveCampaign] = useState('');
  const [moving, setMoving] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/sponsoring', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load, version]);
  const approved = data?.campaigns.filter((c) => c.status === 'approved') || [];
  const campaignId = campaign || approved[0]?.id || '';
  const grouped = new Map<
    string,
    { key: string; campaign: string; country: string; amount: number; expires: number }
  >();
  for (const stake of data?.stakes || []) {
    const key = `${stake.campaign_id}:${stake.country_id}`;
    const entry = grouped.get(key) || {
      key,
      campaign: stake.campaign_id,
      country: stake.country_id,
      amount: 0,
      expires: stake.expires_at,
    };
    entry.amount += stake.amount_cents;
    entry.expires = Math.min(entry.expires, stake.expires_at);
    grouped.set(key, entry);
  }
  const groups = [...grouped.values()];
  const source = grouped.get(sourceKey) || groups[0];
  const moveTargetCampaign =
    moveCampaign ||
    (approved.some((c) => c.id === source?.campaign) ? source!.campaign : approved[0]?.id || '');
  const moveCents = Math.round(Number(moving === '' ? (source?.amount || 0) / 100 : moving) * 100);
  const amountCents = Math.round(Number(amount) * 100);
  const personal =
    groups.find((group) => group.campaign === campaignId && group.country === country)?.amount || 0;
  const leader = data?.bids.find((bid) => bid.country_id === country && bid.winning);
  const locked = !!data?.wallet.frozen || !!data?.wallet.debt_cents;
  const minimum = data?.minimumBids?.[country] ?? sponsorMinimum(country);
  async function submit(action: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      if (await act(action, success)) {
        await load();
        setAccepted(false);
      }
    } finally {
      setBusy(false);
    }
  }
  async function checkout() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: Math.round(Number(topup) * 100),
          requestId: crypto.randomUUID(),
          termsAccepted: terms,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (typeof result.url !== 'string' || !result.url.startsWith('https://checkout.stripe.com/'))
        throw new Error('Lien de paiement invalide.');
      window.location.assign(result.url);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <p className={error ? 'notice' : 'muted'}>{error || 'Chargement du portefeuille sponsor…'}</p>
    );
  return (
    <div className="sponsor-console">
      {paymentsMode === 'test' && (
        <div className="payment-test-note">
          <strong>Stripe en mode test.</strong> Aucun paiement réel n’est effectué. Les crédits de
          test servent uniquement à vérifier le fonctionnement.
        </div>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {locked && (
        <p className="notice">
          Ce compte nécessite une vérification après un remboursement ou une contestation. Les
          enchères sont suspendues.
          {data.wallet.debt_cents > 0 &&
            ` Régularisation restante : ${credits(data.wallet.debt_cents)} €.`}
        </p>
      )}
      <div className="sponsor-wallet">
        <div>
          <span>
            <Wallet size={14} /> PORTEFEUILLE CONSERVÉ
          </span>
          <strong>
            {credits(data.wallet.balance_cents)} <small>crédits</small>
          </strong>
        </div>
        <div>
          <span>ENGAGÉS SUR LA CARTE</span>
          <strong>
            {credits(groups.reduce((sum, group) => sum + group.amount, 0))} <small>crédits</small>
          </strong>
        </div>
      </div>
      <p className="sponsor-money-rule">
        1 crédit = 1 €. Le portefeuille n’est pas remis à zéro. Les fonds engagés restent
        déplaçables entre pays, sans retour au portefeuille, et expirent 30 jours après leur premier
        placement. Un déplacement ne prolonge jamais ce délai. Les enchères commencent dès 2 € selon
        le pays ; une recharge du portefeuille commence à 5 €.
      </p>
      <details className="sponsor-section">
        <summary>Recharger avec Stripe</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void checkout();
          }}
        >
          <label>
            Montant de la recharge (€)
            <input
              type="number"
              min="5"
              max="10000"
              step="0.01"
              value={topup}
              onChange={(event) => setTopup(event.target.value)}
              required
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              required
            />
            <span>
              J’ai lu les{' '}
              <a href="/sponsoring" target="_blank" rel="noopener noreferrer">
                informations sur le sponsoring
              </a>
              . Les crédits ne donnent aucune Influence ; les fonds placés expirent après 30 jours.
            </span>
          </label>
          <button
            className="primary full"
            disabled={busy || !paymentsEnabled || locked || !approved.length}
          >
            {paymentsMode === 'test' ? 'Tester une recharge de' : 'Recharger'} {topup || '0'} €{' '}
            <ArrowUpRight size={14} />
          </button>
          <p className="muted">
            {!paymentsEnabled
              ? 'Les paiements sont actuellement désactivés.'
              : !approved.length
                ? 'Faites d’abord valider un visuel.'
                : 'Le portefeuille est crédité après confirmation du paiement par Stripe.'}
          </p>
        </form>
      </details>
      <div className="sponsor-section">
        <div className="sponsor-section-title">
          <h3>Vos visuels</h3>
          <button className="text-button" onClick={() => onCreate(country)}>
            <Plus size={13} /> Créer un visuel
          </button>
        </div>
        {data.campaigns.length ? (
          data.campaigns.map((item) => (
            <div className="sponsor-asset" key={item.id}>
              <strong>{item.name}</strong>
              <span>
                {item.status === 'approved'
                  ? 'Approuvé · utilisable sur tous les pays'
                  : item.status === 'rejected'
                    ? 'Refusé ou suspendu'
                    : 'En modération'}
              </span>
            </div>
          ))
        ) : (
          <p className="muted">
            Créez un visuel, faites-le valider, puis engagez vos crédits où vous le souhaitez.
          </p>
        )}
      </div>
      <form
        className="sponsor-section"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(
            { action: 'sponsor-place', campaignId, countryId: country, amountCents, accepted },
            'Crédits engagés pour 30 jours.',
          );
        }}
      >
        <h3>Engager des crédits</h3>
        <label>
          Visuel à afficher
          <select
            aria-label="Visuel de l’enchère sponsor"
            value={campaignId}
            onChange={(event) => setCampaign(event.target.value)}
            required
          >
            <option value="" disabled>
              Choisir un visuel approuvé
            </option>
            {approved.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pays de l’enchère
          <select
            aria-label="Pays de l’enchère sponsor"
            value={country}
            onChange={(event) => {
              const next = event.target.value;
              setCountry(next);
              const placed =
                groups.find((group) => group.campaign === campaignId && group.country === next)
                  ?.amount || 0;
              setAmount(String(Math.max(1, sponsorMinimum(next) - placed) / 100));
            }}
          >
            {countries.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · dès {sponsorMinimum(item.id) / 100} €
              </option>
            ))}
          </select>
        </label>
        <div className="sponsor-bid-context">
          <span>
            Minimum pour ce pays :{' '}
            <b>
              {credits(minimum)} crédits ({credits(minimum)} €)
            </b>
          </span>
          <span>
            Déjà engagés avec ce visuel : <b>{credits(personal)}</b>
          </span>
          <span>
            {leader ? (
              <>
                En tête : {leader.name} · <b>{credits(leader.amount)}</b>
              </>
            ) : (
              `Emplacement libre · première enchère à ${credits(minimum)} crédits`
            )}
          </span>
        </div>
        <label>
          Crédits supplémentaires à engager
          <input
            aria-label="Crédits sponsor à engager"
            type="number"
            min={Math.max(1, minimum - personal) / 100}
            step="0.01"
            max={data.wallet.balance_cents / 100}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </label>
        <p className="muted">
          Total après ajout : {credits(personal + (Number.isFinite(amountCents) ? amountCents : 0))}{' '}
          crédits. Les nouvelles sommes auront leur propre échéance à 30 jours.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            required
          />
          Je confirme l’engagement : ces crédits ne reviendront pas dans mon portefeuille et
          expireront après 30 jours, même déplacés.
        </label>
        <button
          className="primary full"
          disabled={
            busy ||
            locked ||
            !campaignId ||
            amountCents < 1 ||
            personal + amountCents < minimum ||
            amountCents > data.wallet.balance_cents
          }
        >
          Engager {amount || '0'} crédits <ArrowUpRight size={14} />
        </button>
      </form>
      {groups.length > 0 && (
        <>
          <div className="sponsor-section">
            <h3>Vos positions</h3>
            {groups.map((group) => {
              const winner = data.bids.some(
                (bid) =>
                  bid.id === group.campaign && bid.country_id === group.country && bid.winning,
              );
              return (
                <div className="sponsor-position" key={group.key}>
                  <div>
                    <strong>{countries.find((item) => item.id === group.country)?.name}</strong>
                    <small>
                      {data.campaigns.find((item) => item.id === group.campaign)?.name} ·{' '}
                      {winner
                        ? 'En tête'
                        : group.amount < sponsorMinimum(group.country)
                          ? `Sous le minimum de ${sponsorMinimum(group.country) / 100}`
                          : 'Dépassé ou visuel suspendu'}
                    </small>
                    <span>
                      <Clock3 size={11} /> Prochaine expiration : {date(group.expires)}
                    </span>
                  </div>
                  <b>{credits(group.amount)}</b>
                </div>
              );
            })}
          </div>
          <form
            className="sponsor-section"
            onSubmit={(event) => {
              event.preventDefault();
              if (source)
                void submit(
                  {
                    action: 'sponsor-move',
                    fromCampaignId: source.campaign,
                    fromCountryId: source.country,
                    campaignId: moveTargetCampaign,
                    countryId: destination,
                    amountCents: moveCents,
                  },
                  'Fonds déplacés. Leurs dates d’expiration sont conservées.',
                );
            }}
          >
            <h3>Déplacer des fonds engagés</h3>
            <label>
              Position de départ
              <select
                aria-label="Position sponsor à déplacer"
                value={source?.key || ''}
                onChange={(event) => {
                  setSourceKey(event.target.value);
                  setMoving('');
                  setMoveCampaign('');
                }}
              >
                {groups.map((group) => (
                  <option key={group.key} value={group.key}>
                    {countries.find((item) => item.id === group.country)?.name} ·{' '}
                    {credits(group.amount)} crédits
                  </option>
                ))}
              </select>
            </label>
            <label>
              Visuel de destination
              <select
                aria-label="Visuel de destination sponsor"
                value={moveTargetCampaign}
                onChange={(event) => setMoveCampaign(event.target.value)}
              >
                <option value="" disabled>
                  Choisir un visuel approuvé
                </option>
                {approved.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · dès {sponsorMinimum(item.id) / 100} €
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pays de destination
              <select
                aria-label="Destination des fonds sponsor"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              >
                {countries.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Crédits à déplacer
              <input
                aria-label="Crédits sponsor à déplacer"
                type="number"
                min="0.01"
                step="0.01"
                max={(source?.amount || 0) / 100}
                value={moving === '' ? (source?.amount || 0) / 100 : moving}
                onChange={(event) => setMoving(event.target.value)}
                required
              />
            </label>
            <p className="muted">
              Les fonds les plus anciens sont déplacés d’abord. Laissez zéro ou au moins{' '}
              {sponsorMinimum(source?.country || '') / 100} crédits au départ ; la destination doit
              atteindre {sponsorMinimum(destination) / 100} crédits. Aucun retour au portefeuille.
            </p>
            <button
              className="secondary full"
              disabled={
                busy ||
                locked ||
                !moveTargetCampaign ||
                moveCents < 1 ||
                moveCents > (source?.amount || 0)
              }
            >
              Déplacer {credits(moveCents || 0)} crédits <ArrowRight size={14} />
            </button>
          </form>
          <details className="sponsor-section">
            <summary>Dates d’expiration de vos fonds</summary>
            {data.stakes.map((stake) => (
              <div className="sponsor-fund-lot" key={stake.id}>
                <span>
                  {countries.find((item) => item.id === stake.country_id)?.name}
                  <small>Premier placement : {date(stake.placed_at)}</small>
                </span>
                <span>
                  {credits(stake.amount_cents)} crédits
                  <small>Expire le {date(stake.expires_at)}</small>
                </span>
              </div>
            ))}
          </details>
        </>
      )}
      <details className="sponsor-section">
        <summary>Journal des crédits</summary>
        {data.ledger.map((entry) => (
          <div className="sponsor-fund-lot" key={entry.id}>
            <span>
              {(
                {
                  credit: 'Recharge confirmée',
                  place: 'Fonds engagés',
                  move: 'Déplacement',
                  expire: 'Fonds expirés',
                  refund: 'Remboursement Stripe',
                } as Record<string, string>
              )[entry.kind] || entry.kind}
              <small>{date(entry.created_at)}</small>
            </span>
            <b>{credits(entry.amount_cents)}</b>
          </div>
        ))}
      </details>
      <p className="muted">
        Service édité par {OPERATOR.name} — {OPERATOR.status}, {OPERATOR.country}. Assistance
        sponsoring : <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>
      <SupportCreator />
    </div>
  );
}
