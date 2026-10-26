'use client';
import { ArrowUpRight, Megaphone } from 'lucide-react';
import type { Sponsor, SponsorBid } from '@/lib/types';
const credits = (amount: number) =>
  (amount / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function SponsorAuction({
  bids,
  onSponsor,
  houseAd,
  paymentsMode,
}: {
  bids: SponsorBid[];
  onSponsor: () => void;
  houseAd?: Sponsor | null;
  paymentsMode?: 'disabled' | 'test' | 'live';
}) {
  const ranked = [...bids].sort(
    (a, b) =>
      b.amount - a.amount || (a.winning ? -1 : b.winning ? 1 : a.name.localeCompare(b.name)),
  );
  const winner = ranked.find((bid) => bid.winning);
  return (
    <div className="country-sponsor-auction">
      {paymentsMode === 'test' && (
        <p className="payment-test-note">Sponsoring en mode test : aucun paiement réel.</p>
      )}
      <p className="sponsor-auction-intro">
        Le logo et le contrôle du pays ont deux enchères indépendantes.
      </p>
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
                    : bid.amount < 500
                      ? 'Minimum de 5 crédits à atteindre'
                      : `+${credits(Math.max(500, (winner?.amount || 0) + 1) - bid.amount)} pour passer devant`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="standings-empty">
          <Megaphone size={22} strokeWidth={1.3} />
          <strong>Votre place sur la carte.</strong>
          <p>La première enchère publicitaire commence à 5 crédits, soit 5 €.</p>
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
      <button className="primary standings-bid" onClick={onSponsor}>
        Gérer mes crédits sponsor <ArrowUpRight size={15} />
      </button>
      <p className="standings-note sponsor-expiry-note">
        Un placement dure 30 jours. Les déplacements conservent sa date d’expiration ; les fonds
        engagés ne reviennent jamais au portefeuille. Le solde non engagé est conservé.
      </p>
    </div>
  );
}
