'use client';
import { countryLabel } from '@/i18n/countries';
import { useT, useLocale } from '@/i18n/provider';

import { ArrowUpRight, Clock3, Flag, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Country, Territory, SponsorBid, Sponsor } from '@/lib/types';
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
  amount,
  onAmount,
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
  sponsorWallet,
  sponsorCampaigns,
  act,
}: {
  country: Country;
  territory?: Territory;
  campId?: string;
  now: number;
  needed: number;
  amount: number;
  onAmount: (value: number) => void;
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
  sponsorWallet?: { balance_cents: number; debt_cents: number; frozen: number } | null;
  sponsorCampaigns?: Sponsor[];
  act?: (body: Record<string, unknown>, success?: string) => Promise<boolean>;
}) {
  const t = useT();
  const locale = useLocale();
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
    <aside className="country-standings" aria-label={t("Conquête de {0}", [country.name])}>
      <div className="standings-heading">
        <span className="eyebrow">{t("LA CONQUÊTE / EN DIRECT")}</span>
        <button className="icon-button" onClick={onClose} aria-label={t("Fermer le classement du pays")}>
          <X size={15} />
        </button>
      </div>
      <h2>{countryLabel(country, locale)}</h2>
      <div className="auction-tabs" role="tablist" aria-label={t("Enchères du pays")}>
        <button role="tab" aria-selected={layer === 'players'} onClick={() => setLayer('players')}>
          {t("\r\n          Conquête\r\n        ")}</button>
        <button role="tab" aria-selected={layer === 'combat'} onClick={() => setLayer('combat')}>
          {t("\r\n          Attaquer\r\n        ")}</button>
        <button
          role="tab"
          aria-selected={layer === 'sponsors'}
          onClick={() => setLayer('sponsors')}
        >
          {t("\r\n          Sponsoring\r\n        ")}</button>
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
                <strong>{owner.name}</strong> {t(" contrôle ce territoire\r\n              ")}</>
            ) : (
              t("Territoire libre · dès 1 Influence")
            )}
          </p>
          <div className="standings-label">
            <span>{t("CLASSEMENT")}</span>
            <span>{t("INFLUENCE ACTIVE")}</span>
          </div>
          {ranked.length ? (
            <ol className="contender-list" aria-label={t("Classement des prétendants")}>
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
                          {camp.id === campId && <small>{t("VOUS")}</small>}
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
                            <Flag size={10} /> {t(" Propriétaire actuel\r\n                          ")}</>
                        ) : (
                          t("{0} · +{1} pour passer devant", [camp.alliance ? 'Alliance' : t("Indépendant"), number(gap)])
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
              <strong>{t("À vous d’ouvrir le jeu.")}</strong>
              <p>{t("Une seule Influence suffit pour devenir le premier propriétaire.")}</p>
            </div>
          )}
          <form
            className="country-claim-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !busy &&
                attackAllowed &&
                Number.isInteger(amount) &&
                amount >= 1 &&
                (wallet === undefined || amount <= wallet)
              )
                onBid();
            }}
          >
            <label>
              {t("\r\n              Combien d’Influence voulez-vous envoyer ?\r\n              ")}<input
                aria-label={t("Influence dans ce pays")}
                type="number"
                min={1}
                max={wallet}
                step={1}
                value={amount}
                onChange={(event) => onAmount(Number(event.target.value))}
                required
              />
            </label>
            <div className="claim-presets" aria-label={t("Montants rapides")}>
              {[...new Set([1, 10, 50, needed])]
                .filter((value) => value > 0 && (wallet === undefined || value <= wallet))
                .sort((a, b) => a - b)
                .map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={t("Choisir {0} Influence", [value])}
                    aria-pressed={amount === value}
                    onClick={() => onAmount(value)}
                  >
                    {value}
                    {value === needed ? ' · minimum' : ''}
                  </button>
                ))}
            </div>
            <p className="standings-balance">
              {wallet !== undefined ? t("{0} disponibles ·", [number(wallet)]) : ''}
              {isOwner
                ? t("Chaque ajout renforce votre position.")
                : t("{0} nécessaires pour prendre le contrôle. Vous pouvez aussi contribuer moins.", [number(needed)])}
            </p>
            <button
              type="submit"
              className="primary standings-bid"
              disabled={
                busy ||
                !attackAllowed ||
                !Number.isInteger(amount) ||
                amount < 1 ||
                (wallet !== undefined && wallet < amount)
              }
            >
              <span>
                {isOwner
                  ? 'Renforcer'
                  : amount < needed
                    ? 'Contribuer'
                    : owner
                      ? t("Passer devant")
                      : 'Revendiquer'}{' '}
                <b>· {number(amount)} {t(" Influence")}</b>
              </span>
              <ArrowUpRight size={15} />
            </button>
          </form>
          {restriction && (
            <p className="standings-balance">{restriction} {t(" Le mode personnel reste libre.")}</p>
          )}
          {wallet !== undefined && wallet < needed && (
            <p className="standings-balance">
              {t("\r\n              Il vous manque ")}{number(needed - wallet)} {t(" Influence. Vous pouvez aussi contribuer dès 1\r\n              en choisissant un montant dans ce panneau.\r\n            ")}</p>
          )}
          <div className="standings-clock">
            <Clock3 size={13} />
            <span>
              {Number.isFinite(nextExpiry) ? (
                <>
                  {t("\r\n                  Prochaine expiration")}{' '}
                  <time data-expires={nextExpiry}>{countdown(nextExpiry, now)}</time>
                </>
              ) : (
                t("Influence des joueurs : validité de 72 h.")
              )}
            </span>
          </div>
          <p className="standings-note">
            {t("\r\n            Conquête des joueurs : les mises d’Influence expirent actuellement après 72 h, même hors\r\n            ligne. En cas d’égalité, le propriétaire garde la main.\r\n          ")}</p>
        </>
      ) : layer === 'combat' ? (
        attackPanel
      ) : (
        <SponsorAuction
          key={country.id}
          countryId={country.id}
          wallet={sponsorWallet}
          campaigns={sponsorCampaigns}
          act={act}
          busy={busy}
          bids={sponsorBids}
          onSponsor={onSponsor || (() => {})}
          houseAd={territory?.sponsor?.house ? territory.sponsor : null}
          paymentsMode={paymentsMode}
        />
      )}
    </aside>
  );
}
