'use client';
import { ArrowUpRight, Clock3, Flag, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Country, Territory, SponsorBid } from '@/lib/types';
import SponsorAuction from './sponsor-auction';

const number = (value: number) => new Intl.NumberFormat('fr-FR').format(value);
function countdown(end: number, now: number) {
  const seconds = Math.max(0, Math.ceil((end - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  return `${String(hours).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function CountryStandings({
  country,
  territory,
  campId,
  now,
  needed,
  busy,
  wallet,
  onClose,
  onBid,
  modeLabel,
  restriction = '',
  attackAllowed = true,
  modeSwitcher,
  sponsorBids = [],
  onSponsor,
  attackPanel,
  paymentsMode,
}: {
  country: Country;
  territory?: Territory;
  campId?: string;
  now: number;
  needed: number;
  busy: boolean;
  wallet?: number;
  onClose: () => void;
  onBid: () => void;
  modeLabel?: string;
  restriction?: string;
  attackAllowed?: boolean;
  modeSwitcher?: ReactNode;
  sponsorBids?: SponsorBid[];
  onSponsor?: () => void;
  attackPanel?: ReactNode;
  paymentsMode?: 'disabled' | 'test' | 'live';
}) {
  const [layer, setLayer] = useState<'players' | 'sponsors' | 'combat'>('players');
  const owner = territory?.owner;
  const ranked = [...(territory?.scores || [])].sort(
    (a, b) =>
      b.score - a.score ||
      (a.id === owner?.id ? -1 : b.id === owner?.id ? 1 : a.id.localeCompare(b.id)),
  );
  const isOwner = owner?.id === campId && !!campId;
  const nextExpiry = ranked.reduce(
    (earliest, camp) => Math.min(earliest, camp.nextExpiryAt ?? Infinity),
    Infinity,
  );
  return (
    <aside className="country-standings" aria-label={`Conquête de ${country.name}`}>
      <div className="standings-heading">
        <span className="eyebrow">LA CONQUÊTE / EN DIRECT</span>
        <button className="icon-button" onClick={onClose} aria-label="Fermer le classement du pays">
          <X size={15} />
        </button>
      </div>
      <h2>{country.name}</h2>
      <div className="auction-tabs" role="tablist" aria-label="Enchères du pays">
        <button role="tab" aria-selected={layer === 'players'} onClick={() => setLayer('players')}>
          Conquête
        </button>
        <button role="tab" aria-selected={layer === 'combat'} onClick={() => setLayer('combat')}>
          Attaquer
        </button>
        <button
          role="tab"
          aria-selected={layer === 'sponsors'}
          onClick={() => setLayer('sponsors')}
        >
          Sponsoring
        </button>
      </div>
      {layer !== 'sponsors' && modeSwitcher && (
        <div className="standings-mode-switcher">{modeSwitcher}</div>
      )}
      {layer !== 'sponsors' && modeLabel && <p className="standings-mode">{modeLabel}</p>}
      {layer === 'players' ? (
        <>
          <p className="standings-status">
            <i style={{ background: owner?.color || '#b0b0b0' }} />
            {owner ? (
              <>
                <strong>{owner.name}</strong> contrôle ce territoire
              </>
            ) : (
              'Territoire libre · dès 1 Influence'
            )}
          </p>
          <div className="standings-label">
            <span>CLASSEMENT</span>
            <span>INFLUENCE ACTIVE</span>
          </div>
          {ranked.length ? (
            <ol className="contender-list" aria-label="Classement des prétendants">
              {ranked.map((camp, index) => {
                const leader = camp.id === owner?.id;
                const gap = Math.max(1, (owner?.score || ranked[0].score) - camp.score + 1);
                return (
                  <li
                    key={camp.id}
                    className={`contender ${leader ? 'is-owner' : ''}`}
                    data-camp={camp.id}
                  >
                    <span className="contender-rank">{String(index + 1).padStart(2, '0')}</span>
                    <div className="contender-detail">
                      <div className="contender-title">
                        <strong>
                          {camp.name}
                          {camp.appearance?.title && (
                            <em className="contender-cosmetic-title">{camp.appearance.title}</em>
                          )}
                          {camp.id === campId && <small>VOUS</small>}
                        </strong>
                        <b>{number(camp.score)}</b>
                      </div>
                      <div className="contender-meter">
                        <i
                          style={{
                            width: `${Math.min(100, (camp.score / ranked[0].score) * 100)}%`,
                            background: camp.color,
                          }}
                        />
                      </div>
                      <p>
                        {leader ? (
                          <>
                            <Flag size={10} /> Propriétaire actuel
                          </>
                        ) : (
                          `${camp.alliance ? 'Alliance' : 'Indépendant'} · +${number(gap)} pour passer devant`
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="standings-empty">
              <Flag size={22} strokeWidth={1.3} />
              <strong>À vous d’ouvrir le jeu.</strong>
              <p>Une seule Influence suffit pour devenir le premier propriétaire.</p>
            </div>
          )}
          <button
            className="primary standings-bid"
            onClick={onBid}
            disabled={busy || !attackAllowed || (wallet !== undefined && wallet < needed)}
          >
            <span>
              {isOwner ? 'Renforcer' : owner ? 'Passer devant' : 'Revendiquer'}{' '}
              <b>· {number(needed)} Influence</b>
            </span>
            <ArrowUpRight size={15} />
          </button>
          {restriction && (
            <p className="standings-balance">{restriction} Le mode personnel reste libre.</p>
          )}
          {wallet !== undefined && wallet < needed && (
            <p className="standings-balance">
              Il vous manque {number(needed - wallet)} Influence. Vous pouvez aussi contribuer dès 1
              depuis le header.
            </p>
          )}
          <div className="standings-clock">
            <Clock3 size={13} />
            <span>
              {Number.isFinite(nextExpiry) ? (
                <>
                  Prochaine expiration{' '}
                  <time data-expires={nextExpiry}>{countdown(nextExpiry, now)}</time>
                </>
              ) : (
                'Influence des joueurs : validité de 72 h.'
              )}
            </span>
          </div>
          <p className="standings-note">
            Conquête des joueurs : les mises d’Influence expirent actuellement après 72 h, même hors
            ligne. En cas d’égalité, le propriétaire garde la main.
          </p>
        </>
      ) : layer === 'combat' ? (
        attackPanel
      ) : (
        <SponsorAuction
          bids={sponsorBids}
          onSponsor={onSponsor || (() => {})}
          houseAd={territory?.sponsor?.house ? territory.sponsor : null}
          paymentsMode={paymentsMode}
        />
      )}
    </aside>
  );
}
