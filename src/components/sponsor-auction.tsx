'use client';
import { ArrowUpRight, Megaphone } from 'lucide-react';
import { useRef, useState } from 'react';
import { sponsorMinimum } from '@/lib/sponsor-pricing';
import type { Sponsor, SponsorBid } from '@/lib/types';
const credits = (amount: number) =>
  (amount / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function SponsorAuction({
  bids,
  onSponsor,
  houseAd,
  paymentsMode,
  countryId,
  wallet,
  campaigns,
  act,
  busy = false,
}: {
  bids: SponsorBid[];
  onSponsor: () => void;
  houseAd?: Sponsor | null;
  paymentsMode?: 'disabled' | 'test' | 'live';
  countryId: string;
  wallet?: { balance_cents: number; debt_cents: number; frozen: number } | null;
  campaigns?: Sponsor[];
  act?: (body: Record<string, unknown>, success?: string) => Promise<boolean>;
  busy?: boolean;
}) {
  const minimum = sponsorMinimum(countryId);
  const [campaignChoice, setCampaignChoice] = useState('');
  const [amount, setAmount] = useState('');
  const [accepted, setAccepted] = useState(false);
  const submitting = useRef(false);
  const approved = campaigns?.filter((campaign) => campaign.status === 'approved') || [];
  const campaign = approved.find((item) => item.id === campaignChoice) || approved[0];
  const ranked = [...bids].sort(
    (a, b) =>
      b.amount - a.amount || (a.winning ? -1 : b.winning ? 1 : a.name.localeCompare(b.name)),
  );
  const winner = ranked.find((bid) => bid.winning);
  const personal = bids.find((bid) => bid.id === campaign?.id)?.amount || 0;
  const needed = Math.max(1, Math.max(minimum, (winner?.amount || 0) + 1) - personal);
  const amountCents = Math.round(Number(amount || needed / 100) * 100);
  return (
    <div className="country-sponsor-auction">
      {paymentsMode === 'test' && (
        <p className="payment-test-note">Sponsoring en mode test : aucun paiement réel.</p>
      )}
      <p className="sponsor-auction-intro">
        Le logo et le contrôle du pays ont deux enchères indépendantes.
      </p>
      <div className="sponsor-country-price">
        <span>ENCHÈRE MINIMUM POUR CE PAYS</span>
        <strong>{minimum / 100} €</strong>
        <small>Barème selon la surface et la visibilité du pays.</small>
      </div>
      {!winner && houseAd && (
        <div className="house-ad">
          <span className="eyebrow">CAMPAGNE MAISON · EMPLACEMENT DISPONIBLE</span>
          <h3>{houseAd.name}</h3>
          <p>{houseAd.description}</p>
          <a href={houseAd.url} target="_blank" rel="noopener noreferrer">
            Découvrir {houseAd.name} <ArrowUpRight size={13} />
          </a>
          <small>
            Autopromotion du créateur, sans enchère payante. Un sponsor éligible remplace cette
            annonce.
          </small>
        </div>
      )}
      <div className="standings-label">
        <span>SPONSORS</span>
        <span>CRÉDITS ACTIFS</span>
      </div>
      {ranked.length ? (
        <ol className="contender-list sponsor-ranking">
          {ranked.map((bid, index) => (
            <li className={`contender ${bid.winning ? 'is-owner' : ''}`} key={bid.id}>
              <span className="contender-rank">{String(index + 1).padStart(2, '0')}</span>
              <div className="contender-detail">
                <div className="contender-title">
                  <strong>{bid.name}</strong>
                  <b>{credits(bid.amount)}</b>
                </div>
                <div className="contender-meter">
                  <i
                    style={{
                      width: `${Math.min(100, (bid.amount / ranked[0].amount) * 100)}%`,
                      background: bid.color,
                    }}
                  />
                </div>
                <p>
                  {bid.winning
                    ? 'Logo affiché'
                    : bid.amount < minimum
                      ? `Minimum de ${minimum / 100} crédits à atteindre`
                      : `+${credits(Math.max(minimum, (winner?.amount || 0) + 1) - bid.amount)} pour passer devant`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="standings-empty">
          <Megaphone size={22} strokeWidth={1.3} />
          <strong>Votre place sur la carte.</strong>
          <p>
            La première enchère publicitaire commence à {minimum / 100} crédits, soit{' '}
            {minimum / 100} €.
          </p>
        </div>
      )}
      {winner && (
        <a
          className="sponsor-winner-link"
          href={winner.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Découvrir {winner.name} <ArrowUpRight size={13} />
        </a>
      )}
      {wallet && campaign && act && (
        <form
          className="country-sponsor-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              submitting.current ||
              busy ||
              !accepted ||
              !Number.isSafeInteger(amountCents) ||
              personal + amountCents < minimum ||
              amountCents < 1 ||
              amountCents > wallet.balance_cents
            )
              return;
            submitting.current = true;
            try {
              if (
                await act(
                  {
                    action: 'sponsor-place',
                    countryId,
                    campaignId: campaign.id,
                    amountCents,
                    accepted,
                  },
                  'Enchère sponsor enregistrée pour 30 jours.',
                )
              ) {
                setAmount('');
                setAccepted(false);
              }
            } finally {
              submitting.current = false;
            }
          }}
        >
          <label>
            Visuel à afficher
            <select
              aria-label="Visuel sponsor du pays"
              value={campaign.id}
              onChange={(event) => {
                setCampaignChoice(event.target.value);
                setAmount('');
              }}
            >
              {approved.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Montant à ajouter (€)
            <input
              aria-label="Enchère sponsor du pays"
              type="number"
              step="0.01"
              min={Math.max(1, minimum - personal) / 100}
              max={wallet.balance_cents / 100}
              value={amount || needed / 100}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          <p className="muted">
            Solde : {credits(wallet.balance_cents)} crédits · Déjà placés : {credits(personal)}.
            Total après ajout : {credits(personal + amountCents)}.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              required
            />
            Ces fonds seront engagés pendant 30 jours, déplaçables et sans retour au portefeuille.
          </label>
          <button
            className="primary standings-bid"
            disabled={
              busy ||
              !accepted ||
              !!wallet.frozen ||
              !!wallet.debt_cents ||
              amountCents < 1 ||
              personal + amountCents < minimum ||
              amountCents > wallet.balance_cents
            }
          >
            Enchérir {credits(amountCents)} € <ArrowUpRight size={15} />
          </button>
        </form>
      )}
      <button
        className={wallet && campaign ? 'text-button' : 'primary standings-bid'}
        onClick={onSponsor}
      >
        Gérer mes crédits sponsor <ArrowUpRight size={15} />
      </button>
      <p className="standings-note sponsor-expiry-note">
        Un placement dure 30 jours. Les déplacements conservent sa date d’expiration ; les fonds
        engagés ne reviennent jamais au portefeuille. Le solde non engagé est conservé.
      </p>
    </div>
  );
}
