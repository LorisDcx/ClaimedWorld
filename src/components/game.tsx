'use client';
import { countryLabel } from '@/i18n/countries';
import { useT, useLocale, LanguageSwitcher } from '@/i18n/provider';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Compass,
  Copy,
  Earth,
  ExternalLink,
  Flag,
  Globe2,
  HelpCircle,
  History,
  Layers2,
  LoaderCircle,
  Map,
  Megaphone,
  Plus,
  Search,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import WorldMap from './world-map';
import CountryStandings from './country-standings';
import AllianceManagement from './alliance-management';
import SponsorConsole from './sponsor-console';
import SponsorAttribution from './sponsor-attribution';
import SupportCreator from './support-creator';
import BorderAttack from './border-attack';
import ProgressionPanel from './progression-panel';
import Tutorial from './tutorial';
import { ACHIEVEMENTS, CONTROL_OBJECTIVES, type Appearance } from '@/lib/progression-catalog';
import Dialog from './dialog';
import data from '@/data/countries.json';
import type { Country, Snapshot, Sponsor, Territory } from '@/lib/types';
import { requiredInfluence } from '@/lib/rules';
import { sponsorMinimum } from '@/lib/sponsor-pricing';
import AdminMapReset from './admin-map-reset';
import ThemeToggle from './theme-toggle';
import { OPERATOR } from '@/lib/operator';
import AccountAuth from './account-auth';
const countries = data as Country[];
const number = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
const colors = ['#ff5d35', '#7972e8', '#4aaf83', '#e4ac3a', '#39a5c5', '#e66d9e'];
type Modal = {
  type: string;
  id?: string;
  title?: string;
  message?: string;
  action?: Record<string, unknown>;
};
type Action = (body: Record<string, unknown>, success?: string) => Promise<boolean>;
function timeLeft(ms: number, short = false) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(seconds / 86400),
    h = Math.floor((seconds % 86400) / 3600),
    m = Math.floor((seconds % 3600) / 60),
    s = seconds % 60;
  return d
    ? `${d}j ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`
    : short
      ? `${h ? `${h}h ` : ''}${m}m`
      : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function ago(at: number, now: number, t: ReturnType<typeof useT>) {
  const m = Math.max(0, Math.floor((now - at) / 60000));
  return m < 1 ? t('à l’instant') : m < 60 ? t("il y a {0} min", [m]) : t("il y a {0} h", [Math.floor(m / 60)]);
}
function Badge({ children, color = '#111111' }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="camp-badge" style={{ color, background: `${color}12` }}>
      {children}
    </span>
  );
}
function Empty({
  icon: Icon = Compass,
  title,
  children,
}: {
  icon?: typeof Compass;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={32} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export default function Game() {
  const t = useT();
  const locale = useLocale();
  const [state, setState] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState('map');
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [claimMode, setClaimMode] = useState<'solo' | 'alliance'>('solo');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [now, setNow] = useState(0);
  const [leaderFilter, setLeaderFilter] = useState('all');
  const [stream, setStream] = useState(false);
  const [tutorialReplay, setTutorialReplay] = useState(0);
  const announcedUnlocks = useRef<{ user: string; ids: Set<string> } | null>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const serverOffset = useRef(0);
  const sponsorEntry = useRef<'new' | 'awaiting-account' | 'opened'>('new');
  const syncClock = useCallback((serverTime: number) => {
    serverOffset.current = serverTime - Date.now();
    setNow(serverTime);
  }, []);
  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/game', { cache: 'no-store' });
      if (!r.ok) throw new Error(t("Le serveur est momentanément indisponible."));
      const s = await r.json();
      setState((previous) => (previous && previous.serverTime > s.serverTime ? previous : s));
      syncClock(s.serverTime);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [syncClock, t]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30000);
    const clock = setInterval(() => setNow(Date.now() + serverOffset.current), 1000);
    const resume = () => {
      if (!document.hidden) {
        setNow(Date.now() + serverOffset.current);
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [refresh]);
  const sessionId = state?.player?.id || 'guest';
  const worldReady = !!state;
  const verificationPrompted = useRef<string | null>(null);
  useEffect(() => {
    if (
      !state?.player ||
      state.account?.emailVerified ||
      verificationPrompted.current === sessionId
    )
      return;
    verificationPrompted.current = sessionId;
    const timer = setTimeout(() => setModal({ type: 'verify-email' }), 0);
    return () => clearTimeout(timer);
  }, [sessionId, state?.player, state?.account?.emailVerified]);
  useEffect(() => {
    if (!worldReady || !new URLSearchParams(window.location.search).has('sponsor')) return;
    if (sponsorEntry.current === 'opened') return;
    if (sessionId === 'guest' && sponsorEntry.current === 'awaiting-account') return;
    const timer = setTimeout(() => {
      sponsorEntry.current = sessionId === 'guest' ? 'awaiting-account' : 'opened';
      setModal({ type: sessionId === 'guest' ? 'signup' : 'my-sponsors' });
    }, 0);
    return () => clearTimeout(timer);
  }, [worldReady, sessionId]);
  const realtimeUrl = state?.realtime?.url;
  const realtimeKey = state?.realtime?.key;
  useEffect(() => {
    const ids = new Set(state?.progression?.unlocks.map((u) => u.id) || []);
    const previous = announcedUnlocks.current;
    announcedUnlocks.current = { user: sessionId, ids };
    if (!previous || previous.user !== sessionId) return;
    const additions = [...ids].filter((id) => !previous.ids.has(id));
    if (!additions.length) return;
    const label = t(
      ACHIEVEMENTS.find((a) => a.id === additions[0])?.name ||
      CONTROL_OBJECTIVES.find((o) => `goal:${o.id}` === additions[0])?.name,
    );
    const timer = setTimeout(
      () =>
        notify(t("{0} · Retrouvez-les dans votre progression.", [additions.length > 1 ? t("{0} récompenses débloquées", [additions.length]) : t("Succès débloqué : {0}", [label])])),
      0,
    );
    return () => clearTimeout(timer);
  }, [state?.progression?.unlocks, sessionId, notify, t]);
  useEffect(() => {
    if (!worldReady) return;
    if (realtimeUrl && realtimeKey) {
      const client = createClient(realtimeUrl, realtimeKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const channel = client
        .channel('world-revision')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'world_events' },
          () => {
            if (timer || document.hidden) return;
            timer = setTimeout(
              () => {
                timer = undefined;
                void refresh();
              },
              750 + Math.random() * 750,
            );
          },
        )
        .subscribe();
      return () => {
        clearTimeout(timer);
        void client.removeChannel(channel);
      };
    }
    const source = new EventSource('/api/events');
    source.addEventListener('world', (event) => {
      const world = JSON.parse(event.data) as Snapshot;
      setState((previous) =>
        previous && previous.serverTime > world.serverTime ? previous : world,
      );
      syncClock(world.serverTime);
      setError('');
    });
    return () => source.close();
  }, [sessionId, syncClock, worldReady, realtimeUrl, realtimeKey, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const country = params.get('country');
    if (country && countries.some((c) => c.id === country)) {
      setTimeout(() => {
        setSelected(country);
        setFocus({ id: country, nonce: Date.now() });
      }, 0);
    }
    if (params.has('invite'))
      setTimeout(() => setModal({ type: 'invite', id: params.get('invite')! }), 0);
    if (params.has('player'))
      setTimeout(() => setModal({ type: 'public-profile', id: params.get('player')! }), 0);
    if (params.get('payment') === 'success')
      setTimeout(() => {
        setModal({ type: 'my-sponsors' });
        notify(
          t("Vérification du paiement : le portefeuille sera crédité après confirmation de Stripe."),
        );
      }, 0);
  }, [notify, t]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape' && !modal) {
        setSelected(null);
        setTab('map');
        setSearchOpen(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        queryRef.current?.focus();
        setSearchOpen(true);
      }
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [modal]);
  const emailVerificationRequired = !!state?.player && !state.account?.emailVerified;
  const act: Action = useCallback(
    async (body, success) => {
      if (emailVerificationRequired && !['login', 'logout'].includes(String(body.action))) {
        setModal({ type: 'verify-email' });
        return false;
      }
      setBusy(String(body.action));
      try {
        const response = await fetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || t("Une erreur est survenue."));
        setState((previous) =>
          previous && previous.serverTime > result.serverTime ? previous : result,
        );
        syncClock(result.serverTime);
        if (body.action === 'login' && !result.account?.emailVerified) {
          setModal({ type: 'verify-email' });
          return false;
        }
        if (body.action === 'contribute') {
          const target = result.territories.find((t: Territory) => t.id === body.countryId);
          const camp = body.mode === 'alliance' ? result.player?.alliance_id : result.player?.id;
          const foundCountry = countries.find((c) => c.id === body.countryId);
          const name = foundCountry ? countryLabel(foundCountry, locale) : undefined;
          notify(
            target?.owner?.id === camp
              ? t("{0} est sous votre contrôle. Bien joué !", [name])
              : success || t("Votre contribution est active pendant 72 heures."),
          );
        } else if (success) notify(success);
        if (
          [
            'signup',
            'login',
            'logout',
            'join-alliance',
            'leave-alliance',
            'create-alliance',
          ].includes(String(body.action))
        )
          setClaimMode('solo');
        return true;
      } catch (e) {
        notify((e as Error).message, true);
        return false;
      } finally {
        setBusy('');
      }
    },
    [notify, syncClock, emailVerificationRequired, locale, t],
  );
  function participate(next?: Modal) {
    if (!state?.player) setModal({ type: 'signup' });
    else if (!state.account?.emailVerified) setModal({ type: 'verify-email' });
    else if (next) setModal(next);
  }
  function chooseCountry(id: string, zoom = false) {
    queryRef.current?.blur();
    setSelected(id);
    setTab('map');
    setQuery('');
    setSearchOpen(false);
    setAmount(null);
    if (zoom) setFocus({ id, nonce: Date.now() });
  }
  async function share(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(t("Lien copié. À vous de rassembler votre communauté !"));
    } catch {
      notify(t("La copie est indisponible dans ce navigateur."), true);
    }
  }
  const results = useMemo(() => {
    const q = query
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return countries
      .filter((c) =>
        `${c.name} ${c.englishName} ${countryLabel(c, locale)} ${c.code}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .includes(q),
      )
      .sort((a, b) => {
        const normalize = (value: string) =>
          value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        const rank = (name: string) =>
          normalize(name) === q ? 0 : normalize(name).startsWith(q) ? 1 : 2;
        return rank(a.name) - rank(b.name);
      })
      .slice(0, 8);
  }, [query, locale]);
  const country = countries.find((c) => c.id === selected);
  const selectedTerritory = state?.territories.find((t) => t.id === selected);
  const owned = state?.territories.filter((t) => !!t.owner).length || 0;
  const player = state?.player;
  const alliance = state?.alliances.find((a) => a.id === player?.alliance_id);
  const mode = alliance ? claimMode : 'solo';
  const canCommand =
    !!alliance && (player?.alliance_role === 'leader' || player?.alliance_role === 'general');
  const campId = mode === 'alliance' ? alliance?.id : player?.id;
  const availableWallet = mode === 'alliance' ? (alliance?.treasury ?? 0) : player?.wallet;
  const targetAllowed =
    mode !== 'alliance' || (!!country && !!alliance?.targets.includes(country.id));
  const attackAllowed = mode !== 'alliance' || (canCommand && targetAllowed);
  const claimRestriction =
    mode !== 'alliance'
      ? ''
      : !canCommand
        ? t("Seuls le chef et les généraux engagent la trésorerie.")
        : !targetAllowed
          ? t("Ce pays est hors des objectifs définis par le chef.")
          : '';
  const ownScore = selectedTerritory?.scores.find((c) => c.id === campId)?.score || 0;
  const isOwner = !!campId && selectedTerritory?.owner?.id === campId;
  const needed = requiredInfluence(selectedTerritory?.owner?.score || 0, ownScore, isOwner);
  const claimAmount = amount ?? needed;
  const recommended =
    countries.find(
      (c) => c.id === '250' && !state?.territories.find((t) => t.id === c.id)?.owner,
    ) ||
    countries.find((c) => !state?.territories.find((t) => t.id === c.id)?.owner) ||
    countries[0];
  const remaining = state ? state.season.ends_at - now : 0;
  const close = () => setModal(null);
  const replayTutorial = () => {
    if (!state?.player) {
      setModal({ type: 'signup' });
      return;
    }
    setModal(null);
    setSelected(null);
    setTab('map');
    setTutorialReplay((value) => value + 1);
  };

  const navigation = [
    { id: 'map', icon: Map, label: t("La carte"), index: '01' },
    { id: 'alliances', icon: Users, label: t("Alliances"), index: '02' },
    { id: 'leaderboard', icon: Trophy, label: t("Classement"), index: '03' },
    { id: 'sponsors', icon: Megaphone, label: t("Sponsors"), index: '04' },
    { id: 'archives', icon: History, label: t("Saisons"), index: '05' },
  ];
  const activeNavigation = navigation.find((item) => item.id === tab);

  return (
    <div className={`app canvas-app ${stream ? 'stream-mode' : ''}`}>
      <header className={`topbar ${country ? 'has-selection' : ''}`}>
        <button
          className="brand"
          onClick={() => {
            setTab('map');
            setSelected(null);
          }}
          aria-label={t("Claimed World — Carte")}
        >
          <span className="brand-symbol">
            <Earth size={21} strokeWidth={1.4} />
          </span>
          <span>
            {t("\r\n            CLAIMED.WORLD\r\n            ")}<small>
              {t("\r\n              SAISON ")}{String(state?.season.id || 1).padStart(2, '0')} /{' '}
              {(state ? timeLeft(remaining) : '30j 00h 00m').replace(/(\d+)j /, (_, days: string) => `${days}${locale === 'fr' ? 'j' : 'd'} `)}
            </small>
          </span>
        </button>
        <nav className="header-nav" aria-label={t("Navigation principale")}>
          {navigation.map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              className={`nav-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => {
                setTab(tab === item.id ? 'map' : item.id);
                setSelected(null);
              }}
              aria-expanded={item.id === 'map' ? undefined : tab === item.id}
            >
              <item.icon size={15} strokeWidth={1.5} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="mobile-language"><LanguageSwitcher /></div>
        <div
          className="search-box"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
          }}
        >
          <Search size={17} />
          <input
            ref={queryRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) chooseCountry(results[0].id, true);
              if (e.key === 'Escape') setSearchOpen(false);
            }}
            placeholder={t("Rechercher un territoire…")}
            aria-label={t("Rechercher un pays")}
            autoComplete="off"
          />
          <kbd>{t("⌘ K")}</kbd>
          {searchOpen && query && (
            <div className="search-results">
              {results.length ? (
                results.map((c) => (
                  <button
                    key={c.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseCountry(c.id, true)}
                  >
                    <span>{c.code || '—'}</span>
                    <span>{countryLabel(c, locale)}</span>
                    <ArrowUpRight size={15} />
                  </button>
                ))
              ) : (
                <p>{t("Aucun territoire trouvé.")}</p>
              )}
              <small>{countries.length} {t(" pays et territoires accessibles")}</small>
            </div>
          )}
        </div>
        <div className="header-actions">
          <LanguageSwitcher />
          <ThemeToggle />
          {country && (
            <form
              className="selection-actions"
              onSubmit={(e) => {
                e.preventDefault();
                if (!player) {
                  participate();
                  return;
                }
                if (!attackAllowed) return;
                void act(
                  { action: 'contribute', countryId: country.id, amount: claimAmount, mode },
                  t("Influence investie."),
                );
              }}
            >
              <span className="selection-name">
                {countryLabel(country, locale)}
                <small>
                  {selectedTerritory?.owner?.name || t("Libre · {0} Influence minimum", [needed])}
                </small>
              </span>
              {player && (
                <input
                  aria-label={t("Influence à investir")}
                  type="number"
                  min={1}
                  max={availableWallet}
                  step="1"
                  value={claimAmount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              )}
              <button
                className="claim-inline"
                type="submit"
                aria-label={
                  player
                    ? mode === 'alliance'
                      ? t("Engager la trésorerie")
                      : t("Investir mon Influence")
                    : t("Rejoindre la conquête")
                }
                disabled={
                  !!busy ||
                  !attackAllowed ||
                  (!!player &&
                    (!Number.isInteger(claimAmount) ||
                      claimAmount < 1 ||
                      claimAmount > (availableWallet || 0)))
                }
                title={
                  claimRestriction ||
                  (isOwner
                    ? t("Renforcer votre territoire")
                    : t("{0} Influence pour prendre le contrôle", [needed]))
                }
              >
                <Flag size={13} />
                <span>
                  {isOwner
                    ? t("Renforcer")
                    : !player || claimAmount >= needed
                      ? t("Revendiquer")
                      : t("Contribuer")}
                </span>
                {!player && (
                  <small>
                    {needed} <Zap size={10} />
                  </small>
                )}
              </button>
              <button
                type="button"
                className="icon-button sponsor-inline"
                onClick={() => participate({ type: 'my-sponsors', id: country.id })}
                aria-label={t("Sponsoriser ce pays")}
                title={t("Sponsoriser ce pays")}
              >
                <Megaphone size={14} />
              </button>
            </form>
          )}

          {player ? (
            <>
              <div className="wallet">
                <span className="zap-icon">
                  <Zap size={17} fill="currentColor" />
                </span>
                <span>
                  <strong>{number(player.wallet)}</strong>
                  <small>{t("INFLUENCE / ")}{player.stockCap}</small>
                </span>
              </div>
              <span
                className="collect-button"
                title={t("Recharge automatique, stock maximum {0}. L’excédent n’est pas conservé.", [player.stockCap])}
              >
                <Plus size={16} />
                <span>
                  {player.wallet >= player.stockCap
                    ? t("Stock plein")
                    : t("+{0} dans {1}", [player.generationRate, timeLeft(player.nextGenerationAt - now)])}
                </span>
              </span>
              <span className="header-divider" />
              <button
                className={`avatar frame-${player.appearance?.frame || 'none'}`}
                style={{ background: player.color }}
                onClick={() => setModal({ type: 'profile' })}
                aria-label={t("Ouvrir mon profil")}
              >
                {player.username.slice(0, 2).toUpperCase()}
              </button>
            </>
          ) : (
            <>
              <span className="guest-gift">
                <Zap size={14} /> {t(" 100 Influence offertes\r\n              ")}</span>
              <button
                className="primary header-join"
                aria-label={t("Entrer dans le jeu")}
                onClick={() => setModal({ type: 'signup' })}
              >
                <span>
                  {t("\r\n                  Jouer gratuitement")}<small>{t("100 Influence offertes")}</small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            </>
          )}
        </div>
      </header>

      <main className="world-canvas" aria-label={t("Terrain de jeu mondial")}>
        <WorldMap
          territories={state?.territories || []}
          selected={selected}
          onSelect={(id) => chooseCountry(id)}
          filter={filter}
          focusId={focus}
          immersive
        />
        <div className={`canvas-layer-control ${tab !== 'map' ? 'shifted' : ''}`}>
          <Layers2 size={15} />
          <select
            aria-label={t("Filtrer les territoires")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">{t("Tous les territoires")}</option>
            <option value="neutral">{t("Territoires neutres")}</option>
            <option value="sponsored">{t("Pays sponsorisés")}</option>
            {state?.alliances.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <ChevronDown size={12} />
        </div>
        {tab === 'map' && country && (
          <div className="country-inspection">
            <CountryStandings
              country={country}
              territory={selectedTerritory}
              campId={campId}
              now={now}
              needed={needed}
              amount={claimAmount}
              onAmount={setAmount}
              busy={!!busy}
              wallet={availableWallet}
              modeLabel={
                mode === 'alliance'
                  ? t("Trésorerie de {0} · {1} disponibles", [alliance?.name, number(availableWallet || 0)])
                  : player
                    ? t("Stock personnel · {0}/{1}", [player.wallet, player.stockCap])
                    : t("En votre nom")
              }
              modeSwitcher={
                alliance && (
                  <select
                    className="claim-mode"
                    aria-label={t("Revendiquer au nom de")}
                    value={mode}
                    onChange={(event) => {
                      setClaimMode(event.target.value as 'solo' | 'alliance');
                      setAmount(null);
                    }}
                  >
                    <option value="solo">{t("En mon nom")}</option>
                    <option value="alliance" disabled={!canCommand}>
                      {t("\r\n                      Pour l’alliance · ")}{alliance.name}
                    </option>
                  </select>
                )
              }
              restriction={claimRestriction}
              attackAllowed={attackAllowed}
              sponsorBids={
                state?.sponsorAuctions.filter((bid) => bid.country_id === country.id) || []
              }
              onSponsor={() => participate({ type: 'my-sponsors', id: country.id })}
              paymentsMode={state?.paymentsMode}
              sponsorWallet={state?.sponsorWallet}
              sponsorCampaigns={state?.sponsorCampaigns}
              act={act}
              onClose={() => setSelected(null)}
              attackPanel={
                <BorderAttack
                  key={`${country.id}-${mode}`}
                  countryId={country.id}
                  world={state?.territories || []}
                  campId={campId}
                  mode={mode}
                  canCommand={attackAllowed}
                  restriction={claimRestriction}
                  reserve={mode === 'alliance' ? alliance?.treasury || 0 : player?.wallet || 0}
                  alliedCampIds={state?.alliedCampIds || []}
                  busy={!!busy}
                  act={act}
                  onSignup={() => participate()}
                />
              }
              onBid={() => {
                if (!player) participate();
                else if (attackAllowed)
                  void act({
                    action: 'contribute',
                    countryId: country.id,
                    amount: claimAmount,
                    mode,
                  });
              }}
            />
            {selectedTerritory?.sponsor && (
              <SponsorAttribution country={country} sponsor={selectedTerritory.sponsor} />
            )}
          </div>
        )}
        <Tutorial
          state={state}
          selected={selected}
          hidden={tab !== 'map' || !!modal || stream || !state?.account?.emailVerified}
          replay={tutorialReplay}
          busy={!!busy}
          act={act}
          onExplore={() => recommended && chooseCountry(recommended.id, true)}
          onProgression={() => setModal({ type: 'progression' })}
        />
        {error && (
          <div className="connection-error" role="alert">
            {t(error)}
            <button onClick={() => void refresh()}>{t("Réessayer")}</button>
          </div>
        )}
        {!state && !error && (
          <div className="loading-strip">
            <LoaderCircle size={14} className="spin" /> {t(" Connexion au monde…\r\n          ")}</div>
        )}
      </main>

      {tab !== 'map' && (
        <aside className="left-drawer" aria-label={activeNavigation?.label}>
          <div className="drawer-heading">
            <span className="eyebrow">{t("EXPLORE / ")}{activeNavigation?.index}</span>
            <button
              className="icon-button"
              onClick={() => setTab('map')}
              aria-label={t("Fermer le panneau")}
            >
              <X size={18} />
            </button>
            <h2>{activeNavigation?.label}</h2>
          </div>
          <div className="drawer-content">
            {tab === 'alliances' && (
              <section className="content-section">
                <div className="section-line">
                  <h2>{state?.alliances.length || 0} {t(" communautés, un seul monde")}</h2>
                  <button
                    className="primary"
                    onClick={() => participate({ type: 'create-alliance' })}
                  >
                    <Plus size={16} /> {t(" Créer une alliance\r\n                  ")}</button>
                </div>
                {alliance && (
                  <div className="your-alliance" style={{ borderColor: alliance.color }}>
                    <span>{t("VOTRE ALLIANCE")}</span>
                    <strong>
                      {alliance.emblem} {alliance.name}
                    </strong>
                    <button
                      className="text-button"
                      onClick={() => setModal({ type: 'alliance', id: alliance.id })}
                    >
                      {t("\r\n                      Gérer et inviter ")}<ArrowUpRight size={14} />
                    </button>
                  </div>
                )}
                <div className="alliance-grid">
                  {[...(state?.alliances || [])]
                    .sort((a, b) => b.territories - a.territories)
                    .map((a, i) => (
                      <button
                        className="alliance-card"
                        key={a.id}
                        onClick={() => setModal({ type: 'alliance', id: a.id })}
                      >
                        <div className="alliance-card-top">
                          <span
                            className="alliance-emblem"
                            style={{ color: a.color, background: `${a.color}12` }}
                          >
                            {a.emblem}
                          </span>
                          <span className="rank-tag">#{i + 1}</span>
                        </div>
                        <h3>{a.name}</h3>
                        <p>
                          {a.description || t("Une nouvelle communauté prête à conquérir le monde.")}
                        </p>
                        <div className="alliance-card-stats">
                          <span>
                            <Flag size={14} />
                            <strong>{a.territories}</strong> {t(" territoires\r\n                          ")}</span>
                          <span>
                            <Users size={14} />
                            {a.members} {t(" membre")}{a.members > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="alliance-card-bottom">
                          <span>
                            <i style={{ background: a.color }} />
                            {a.leader}
                          </span>
                          <ArrowUpRight size={18} />
                        </div>
                      </button>
                    ))}
                  {state && state.alliances.length === 0 && (
                    <Empty icon={Users} title={t("La première alliance peut être la vôtre.")}>
                      {t("\r\n                      Rassemblez vos amis : vos contributions s’additionnent pour conquérir\r\n                      ensemble.\r\n                    ")}</Empty>
                  )}
                </div>
              </section>
            )}
            {tab === 'leaderboard' && (
              <section className="content-section">
                <div className="section-line">
                  <h2>
                    {t("\r\n                    Le classement de la saison ")}{String(state?.season.id || 1).padStart(2, '0')}
                  </h2>
                  <div className="segmented">
                    {[
                      ['all', 'Tous'],
                      ['alliances', 'Alliances'],
                      ['solo', t("Indépendants")],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        onClick={() => setLeaderFilter(id)}
                        className={leaderFilter === id ? 'active' : ''}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ranking-table">
                  <div className="ranking-header">
                    <span>{t("RANG")}</span>
                    <span>{t("JOUEUR / ALLIANCE")}</span>
                    <span>{t("TERRITOIRES")}</span>
                    <span>{t("PART DU MONDE")}</span>
                  </div>
                  {state?.leaderboard
                    .filter(
                      (c) =>
                        leaderFilter === 'all' ||
                        (leaderFilter === 'solo' ? !c.alliance : c.alliance),
                    )
                    .map((c, i) => (
                      <button
                        className="ranking-row"
                        key={c.id}
                        onClick={() =>
                          c.alliance
                            ? setModal({ type: 'alliance', id: c.id })
                            : setModal({ type: 'public-profile', id: c.id })
                        }
                      >
                        <span className={`rank-number ${i === 0 ? 'first' : ''}`}>
                          {i === 0 ? <Trophy size={20} /> : String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="ranking-camp">
                          <span
                            className={`frame-${c.appearance?.frame || 'none'}`}
                            style={{ color: c.color, background: `${c.color}14` }}
                          >
                            {c.emblem}
                          </span>
                          <span>
                            <strong>{c.name}</strong>
                            <small>
                              {c.appearance?.title ||
                                (c.alliance ? 'Alliance' : t("Joueur indépendant"))}
                            </small>
                          </span>
                        </span>
                        <strong>
                          {c.score}
                          <small> {t(" territoires")}</small>
                        </strong>
                        <span className="ranking-share">
                          <span>
                            <i
                              style={{
                                width: `${(c.score / countries.length) * 100}%`,
                                background: c.color,
                              }}
                            />
                          </span>
                          {((c.score / countries.length) * 100).toFixed(1)} %
                        </span>
                      </button>
                    ))}
                  {!state?.leaderboard.filter(
                    (c) =>
                      leaderFilter === 'all' ||
                      (leaderFilter === 'solo' ? !c.alliance : c.alliance),
                  ).length && (
                    <Empty title={t("La place est libre")} icon={Trophy}>
                      {t("\r\n                      Revendiquer un seul territoire suffit pour entrer au classement.\r\n                    ")}</Empty>
                  )}
                </div>
                <p className="discreet-note">
                  {t("\r\n                  Classement par nombre de territoires contrôlés. Les scores évoluent avec les\r\n                  contributions et leur expiration.\r\n                ")}</p>
              </section>
            )}
            {tab === 'sponsors' && (
              <section className="content-section">
                <div className="sponsor-hero">
                  <div>
                    <Badge>{t("CONQUER FOR FREE. ADVERTISE TO THE WORLD.")}</Badge>
                    <h2>
                      {t("\r\n                      Un pays.\r\n                      ")}<br />
                      {t("\r\n                      Une place pour votre projet.\r\n                    ")}</h2>
                    <p>
                      {t("\r\n                      Votre logo à l’intérieur. La couleur des joueurs à l’extérieur. Deux histoires\r\n                      qui partagent la même carte.\r\n                    ")}</p>
                    <button
                      className="primary"
                      onClick={() => {
                        setTab('map');
                        setFilter('all');
                        setSelected(null);
                        notify(
                          t("Sélectionnez un pays, puis utilisez le bouton de sponsoring du header."),
                        );
                      }}
                    >
                      {t("\r\n                      Trouver mon territoire ")}<ArrowUpRight size={17} />
                    </button>
                  </div>
                  <div className="sponsor-illustration">
                    <Globe2 size={190} strokeWidth={0.6} />
                    <span>
                      {t("\r\n                      YOUR\r\n                      ")}<br />
                      {t("\r\n                      BRAND")}<span>↗</span>
                    </span>
                    <i>{t("VOTRE PLACE SUR LA CARTE")}</i>
                  </div>
                </div>
                <div className="sponsor-benefits">
                  {[
                    {
                      icon: Flag,
                      title: t("Deux enchères indépendantes"),
                      text: t("L’Influence contrôle le pays ; les crédits sponsor déterminent le logo affiché."),
                    },
                    {
                      icon: ShieldCheck,
                      title: t("Le jeu reste gratuit"),
                      text: t("Le sponsoring ne donne jamais d’Influence ni de territoire."),
                    },
                    {
                      icon: Clock3,
                      title: t("Des fonds mobiles pendant 30 jours"),
                      text: t("Déplacez vos fonds entre pays sans prolonger leur validité. Votre portefeuille est conservé."),
                    },
                  ].map((b) => (
                    <div key={b.title}>
                      <b.icon size={23} />
                      <h3>{t(b.title)}</h3>
                      <p>{t(b.text)}</p>
                    </div>
                  ))}
                </div>
                <div className="pricing-row">
                  {[
                    [2, t("Première enchère dès")],
                    [30, t("Jours par placement")],
                    [1, t("Crédit = 1 €")],
                  ].map(([price, label]) => (
                    <div key={price}>
                      <span>{label}</span>
                      <strong>
                        {price}
                        <small>
                          {price === 2
                            ? t(" crédits · minimum selon le pays")
                            : price === 30
                              ? t(" jours, même après déplacement")
                              : t(" € par crédit")}
                        </small>
                      </strong>
                      <p>
                        {price === 2
                          ? t("Surface et visibilité déterminent le minimum")
                          : price === 30
                            ? t("Aucun retour des fonds engagés au portefeuille")
                            : t("Le solde non engagé n’expire pas")}
                      </p>
                    </div>
                  ))}
                </div>
                {player && (
                  <button className="secondary" onClick={() => setModal({ type: 'my-sponsors' })}>
                    {t("\r\n                    Mes crédits et enchères ")}<ArrowRight size={15} />
                  </button>
                )}
                <p className="discreet-note">
                  {state?.paymentsMode === 'test'
                    ? t("Stripe en mode test : aucun paiement réel. Utilisez uniquement une carte de test.")
                    : state?.paymentsEnabled
                      ? t("Recharge par Stripe après validation d’un visuel. Aucun avantage de conquête.")
                      : t("Les visuels peuvent être soumis. Les paiements sont désactivés sur cette installation locale.")}
                </p>
                <SupportCreator />
              </section>
            )}
            {tab === 'archives' && (
              <section className="content-section">
                <div className="current-season-card">
                  <span className="live-label">
                    <i /> {t(" SAISON EN COURS\r\n                  ")}</span>
                  <h2>{t("Saison ")}{String(state?.season.id || 1).padStart(2, '0')}</h2>
                  <p>{t("Il reste ")}{timeLeft(remaining, true)} {t(" pour écrire votre histoire.")}</p>
                  <button className="primary" onClick={() => setTab('map')}>
                    {t("\r\n                    Revenir sur le terrain ")}<ArrowUpRight size={16} />
                  </button>
                </div>
                {state?.archived.length ? (
                  <div className="archive-grid">
                    {state.archived.map((s) => (
                      <button
                        key={s.id}
                        className="archive-card"
                        onClick={() => setModal({ type: 'archive', id: String(s.id) })}
                      >
                        <History size={24} />
                        <h3>{t("Saison ")}{String(s.id).padStart(2, '0')}</h3>
                        <p>{s.summary}</p>
                        <small>
                          {new Date(s.ends_at).toLocaleDateString('fr-FR')}{' '}
                          <ArrowUpRight size={13} />
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty title={t("Les légendes sont en train de s’écrire")} icon={History}>
                    {t("\r\n                    La carte finale et les champions de chaque saison seront conservés ici.\r\n                  ")}</Empty>
                )}
              </section>
            )}
          </div>
          <div className="drawer-footer">
            <button onClick={() => setModal({ type: 'help' })}>{t("Règles du jeu ↗")}</button>
            <button onClick={() => setModal({ type: 'privacy' })}>{t("Confidentialité ↗")}</button>
          </div>
        </aside>
      )}

      <footer className="canvas-statusbar">
        <div className="world-status">
          <span>{countries.length} {t(" pays et territoires")}</span>
          <span className="status-divider" />
          <span>{owned ? t("{0} revendiqués", [owned]) : t("Tout reste à conquérir")}</span>
        </div>
        <div className="footer-links">
          <button onClick={() => setModal({ type: 'progression' })}>
            <Trophy size={13} />
            {t("\r\n            Succès & objectifs\r\n          ")}</button>
          {player && <button onClick={replayTutorial}>{t("Didacticiel")}</button>}
          <button onClick={() => setModal({ type: 'help' })}>
            <HelpCircle size={13} />
            {t("\r\n            Comment jouer\r\n          ")}</button>
          <button onClick={() => setModal({ type: 'activity' })}>{t("Journal")}</button>
          <button onClick={() => setModal({ type: 'geography' })}>{t("À propos de la carte")}</button>
          {player && <button onClick={() => setStream(!stream)}>{t("Mode OBS")}</button>}
          {player?.isAdmin && (
            <button onClick={() => setModal({ type: 'admin' })}>{t("Administration")}</button>
          )}
        </div>
      </footer>
      {stream && (
        <button className="exit-stream secondary" onClick={() => setStream(false)}>
          {t("\r\n          Quitter le mode OBS ")}<X size={16} />
        </button>
      )}
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`toast ${toast.error ? 'error' : ''}`}
        >
          {toast.error ? <HelpCircle size={18} /> : <Check size={18} />}
          <span>{t(toast.text)}</span>
          <button onClick={() => setToast(null)} aria-label={t("Fermer la notification")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <GameModal
          key={`${modal.type}-${modal.id || ''}`}
          modal={modal}
          state={state}
          act={act}
          busy={busy}
          now={now}
          close={close}
          setModal={setModal}
          share={share}
          chooseCountry={chooseCountry}
          notify={notify}
          replayTutorial={replayTutorial}
          refresh={refresh}
        />
      )}
    </div>
  );
}

function GameModal({
  modal,
  state,
  act,
  busy,
  now,
  close,
  setModal,
  share,
  chooseCountry,
  notify,
  replayTutorial,
  refresh,
}: {
  modal: Modal;
  state: Snapshot | null;
  act: Action;
  busy: string;
  now: number;
  close: () => void;
  setModal: (m: Modal) => void;
  share: (s: string) => Promise<void>;
  chooseCountry: (id: string, zoom?: boolean) => void;
  notify: (s: string, error?: boolean) => void;
  replayTutorial: () => void;
  refresh: () => Promise<void>;
}) {
  const t = useT();
  const locale = useLocale();
  const [selectedColor, setSelectedColor] = useState(state?.player?.color || colors[0]);
  const [emblem, setEmblem] = useState('✳');
  const [details, setDetails] = useState<Record<string, unknown> | null>(null);
  const [loadError, setLoadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [successor, setSuccessor] = useState('');
  const type = modal.type;
  const player = state?.player;
  const country = countries.find((c) => c.id === modal.id);
  const alliance = state?.alliances.find((a) => a.id === modal.id || a.invite === modal.id);
  const loadDetails = useCallback(async () => {
    let url = '';
    if (type === 'alliance') url = `/api/game?alliance=${modal.id}`;
    if (type === 'admin') url = '/api/game?admin=1';
    if (type === 'profile') url = '/api/game?mine=1';
    if (type === 'archive') url = `/api/game?archive=${modal.id}`;
    if (type === 'public-profile') url = `/api/game?profile=${modal.id}`;
    if (!url) return;
    try {
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDetails(d);
      setLoadError('');
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [type, modal.id]);
  useEffect(() => {
    const timer = setTimeout(() => void loadDetails(), 0);
    return () => clearTimeout(timer);
  }, [loadDetails, state?.serverTime]);
  async function submit(
    e: FormEvent<HTMLFormElement>,
    action: string,
    success: string,
    extra: Record<string, unknown> = {},
  ) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const fields = Object.fromEntries(form);
    try {
      const logo = form.get('logo');
      delete fields.logo;
      if (action === 'sponsor-proposal' && logo instanceof File && logo.size > 0) {
        setUploading(true);
        const upload = new FormData();
        upload.set('logo', logo);
        const response = await fetch('/api/logo', { method: 'POST', body: upload });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        extra.logoId = result.logoId;
      }
      if (await act({ action, ...fields, ...extra }, success)) close();
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setUploading(false);
    }
  }
  function colorPicker() {
    return (
      <div className="color-options" aria-label={t("Choisir une couleur")}>
        {colors.map((c) => (
          <button
            type="button"
            key={c}
            aria-label={t("Couleur {0}", [c])}
            aria-pressed={selectedColor === c}
            onClick={() => setSelectedColor(c)}
            style={{ background: c }}
          >
            {selectedColor === c && <Check size={17} />}
          </button>
        ))}
        <label className="custom-color" title={t("Couleur personnalisée")}>
          <Plus size={17} />
          <input
            type="color"
            value={selectedColor}
            onChange={(e) => setSelectedColor(e.target.value)}
            aria-label={t("Couleur personnalisée")}
          />
        </label>
      </div>
    );
  }
  const titles: Record<string, string> = {
    signup: 'Votre place dans le monde.',
    login: 'Bon retour sur la carte.',
    'verify-email': 'Vérifiez votre adresse e-mail.',
    profile: 'Votre profil',
    progression: 'Votre progression',
    'create-alliance': 'Les grandes conquêtes commencent à plusieurs.',
    alliance: alliance?.name || 'Alliance',
    invite: 'Votre communauté vous attend.',
    sponsor: t("Une place en {0}.", [country?.name || 'ce pays']),
    help: 'Prenez votre place dans le monde.',
    geography: 'Une carte, une politique cohérente.',
    privacy: 'Vos données, en toute transparence.',
    activity: 'Le journal des conquêtes',
    confirm: modal.title || t("Confirmer cette action"),
    report: 'Signaler un contenu',
    admin: 'Administration',
    'my-sponsors': 'Crédits et enchères sponsor',
    archive: t("Saison {0} — Archives", [modal.id]),
    'public-profile': 'Joueur indépendant',
  };
  return (
    <Dialog
      title={t(titles[type] || 'CLAIMED.WORLD')}
      onClose={close}
      wide={['help', 'admin', 'archive'].includes(type)}
    >
      {type === 'progression' && (
        <ProgressionPanel
          state={state}
          act={act}
          busy={busy}
          onCountry={(id) => {
            chooseCountry(id, true);
            close();
          }}
          onSignup={() => setModal({ type: 'signup' })}
          onTutorial={replayTutorial}
        />
      )}
      {['signup', 'login', 'verify-email'].includes(type) && (
        <AccountAuth
          mode={type as 'signup' | 'login' | 'verify-email'}
          color={selectedColor}
          colorPicker={colorPicker()}
          onLogin={(body) => act(body)}
          onMode={(type) => setModal({ type })}
          onComplete={async () => {
            await refresh();
            close();
            notify(t("Votre compte est prêt. À vous de jouer !"));
          }}
        />
      )}
      {type === 'profile' && player && (
        <>
          <div className="form-note">
            <ShieldCheck size={16} />
            {state?.account?.emailVerified ? (
              t("Adresse e-mail vérifiée · privée")
            ) : (
              <button onClick={() => setModal({ type: 'verify-email' })}>
                {t("\r\n                Vérifier mon adresse pour participer\r\n              ")}</button>
            )}
          </div>
          <button
            className="text-button"
            onClick={() => void share(`${window.location.origin}/?player=${player.id}`)}
          >
            <Copy size={14} />
            {t("\r\n            Partager mon profil public\r\n          ")}</button>
          <div className="profile-overview">
            <span
              className={`avatar large frame-${player.appearance?.frame || 'none'}`}
              style={{ background: player.color }}
            >
              {player.username.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h3>{player.username}</h3>
              {player.appearance?.title && (
                <span className="player-title">{player.appearance.title}</span>
              )}
              <p>
                {player.alliance_id
                  ? state?.alliances.find((a) => a.id === player.alliance_id)?.name
                  : t("Joueur indépendant")}
              </p>
            </div>
            <Badge>{number(player.wallet)} ⚡</Badge>
          </div>
          <div className="profile-progression-actions">
            <button className="secondary full" onClick={() => setModal({ type: 'progression' })}>
              <Trophy size={15} />
              {t("\r\n              Succès, objectifs et apparences\r\n            ")}</button>
            <button className="text-button" onClick={replayTutorial}>
              {t("\r\n              Reprendre le didacticiel ")}<ArrowRight size={13} />
            </button>
          </div>
          <div className="reserve-card">
            <span>
              <Zap size={18} /> {t(" Stock personnel")}{' '}
              <strong>
                {number(player.wallet)} / {player.stockCap}
              </strong>
            </span>
            <small>
              +{player.generationRate} {t(" toutes les 30 min, automatiquement, jusqu’à ")}{player.stockCap}
              .
              <br />
              {player.wallet >= player.stockCap
                ? t("Stock plein : dépensez pour reprendre la recharge.")
                : t("Prochaine recharge dans {0}.", [timeLeft(player.nextGenerationAt - now)])}{' '}
              {t("\r\n              L’excédent n’est pas conservé.\r\n            ")}</small>
          </div>
          <div className="season-bonus-card">
            <span className="eyebrow">{t("RÉCOMPENSES DE SAISON")}</span>
            {player.seasonBonus ? (
              <>
                <h3>{t("Votre engagement a compté.")}</h3>
                <p>
                  {t("\r\n                  Bonus de la saison ")}{player.seasonBonus.sourceSeason}{t(", valables uniquement cette\r\n                  saison.\r\n                ")}</p>
                <div className="bonus-values">
                  <span>
                    <b>+{player.seasonBonus.capacityBonus}</b> {t(" capacité\r\n                  ")}</span>
                  <span>
                    <b>+{player.seasonBonus.rateBonus}</b> {t(" / 30 min\r\n                  ")}</span>
                  <span>
                    <b>+{player.seasonBonus.startingInfluence}</b> {t(" au départ\r\n                  ")}</span>
                </div>
                <small>
                  {player.seasonBonus.activeDays.toFixed(1)} {t(" jours utiles ·")}{' '}
                  {number(Math.floor(player.seasonBonus.usefulInfluence))} {t(" Influence utile ·")}{' '}
                  {player.seasonBonus.territoryDays.toFixed(1)} {t(" jours-territoire partagés.\r\n                ")}</small>
              </>
            ) : (
              <p>
                {t("\r\n                Le contrôle soutenu et votre participation utile peuvent accorder jusqu’à +20 de\r\n                capacité, +2 par recharge et 20 Influence de départ pour la saison suivante. Ces\r\n                bonus ne s’accumulent pas.\r\n              ")}</p>
            )}
          </div>
          <form
            onSubmit={(e) =>
              void submit(e, 'profile', t("Profil enregistré."), { color: selectedColor })
            }
          >
            <label>
              {t("\r\n              Pseudonyme\r\n              ")}<input
                name="username"
                defaultValue={player.username}
                minLength={3}
                maxLength={24}
                required
              />
            </label>
            <label>{t("Votre couleur")}{colorPicker()}</label>
            <button className="primary full" disabled={!!busy}>
              {t("\r\n              Enregistrer ")}<Check size={16} />
            </button>
          </form>
          <h3 className="list-heading">{t("Vos contributions actives")}</h3>
          {details &&
          (details.contributions as { country_id: string; amount: number; expires_at: number }[])
            ?.length ? (
            (
              details.contributions as { country_id: string; amount: number; expires_at: number }[]
            ).map((c, i) => (
              <button
                className="detail-list-row"
                key={i}
                onClick={() => {
                  chooseCountry(c.country_id, true);
                  close();
                }}
              >
                <span>
                  {countries.find((x) => x.id === c.country_id) ? countryLabel(countries.find((x) => x.id === c.country_id)!, locale) : ''}
                  <small>{t("Expire dans ")}{timeLeft(c.expires_at - now, true)}</small>
                </span>
                <strong>{c.amount} ⚡</strong>
              </button>
            ))
          ) : (
            <p className="muted">{t("Votre prochaine contribution apparaîtra ici.")}</p>
          )}
          <button
            className="danger-link"
            disabled={!!busy}
            onClick={() =>
              void act({ action: 'logout' }, t("Vous êtes déconnecté.")).then((ok) => ok && close())
            }
          >
            {t("\r\n            Me déconnecter\r\n          ")}</button>
        </>
      )}
      {type === 'create-alliance' && (
        <>
          <p className="modal-intro">
            {t("\r\n            Rassemblez jusqu’à 12 joueurs. Chacun garde son jeu personnel ; le chef et les généraux\r\n            engagent la trésorerie commune sur les objectifs de l’alliance.\r\n          ")}</p>
          {player?.alliance_id ? (
            <div className="notice">
              {t("\r\n              Vous faites déjà partie d’une alliance. Ouvrez sa fiche pour gérer votre départ.\r\n            ")}</div>
          ) : (
            <form
              onSubmit={(e) =>
                void submit(
                  e,
                  'create-alliance',
                  t("Votre alliance est prête. Invitez votre communauté !"),
                  { color: selectedColor, emblem },
                )
              }
            >
              <label>
                {t("\r\n                Nom de l’alliance\r\n                ")}<input
                  name="name"
                  minLength={3}
                  maxLength={30}
                  required
                  placeholder={t("Le début d’un empire…")}
                />
              </label>
              <label>
                {t("\r\n                En quelques mots\r\n                ")}<textarea
                  name="description"
                  maxLength={180}
                  rows={3}
                  placeholder={t("Qu’est-ce qui vous rassemble ?")}
                />
              </label>
              <label>
                {t("\r\n                Votre emblème\r\n                ")}<div className="emblem-options">
                  {['✳', '◈', '✦', '⚑', '◎', '⌘'].map((s) => (
                    <button
                      type="button"
                      className={s === emblem ? 'active' : ''}
                      key={s}
                      onClick={() => setEmblem(s)}
                      aria-label={t("Emblème {0}", [s])}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </label>
              <label>{t("Votre couleur")}{colorPicker()}</label>
              <button
                className="primary full"
                disabled={!!busy || (!!player && player.cooldown_until > now)}
              >
                {t("\r\n                Créer mon alliance ")}<Users size={17} />
              </button>
              {player && player.cooldown_until > now && (
                <p className="muted">
                  {t("\r\n                  Vous pourrez rejoindre ou créer une alliance dans")}{' '}
                  {timeLeft(player.cooldown_until - now, true)}.
                </p>
              )}
            </form>
          )}
        </>
      )}
      {(type === 'alliance' || type === 'invite') && alliance && (
        <>
          <div className="alliance-modal-top">
            <span
              className="alliance-emblem"
              style={{ color: alliance.color, background: `${alliance.color}12` }}
            >
              {alliance.emblem}
            </span>
            <div>
              <p>{alliance.description}</p>
              <span>
                {alliance.territories} {t(" territoires · ")}{alliance.members}/{alliance.memberLimit}{' '}
                {t("\r\n                membres · ")}{number(alliance.influence)} {t(" Influence\r\n              ")}</span>
            </div>
          </div>
          {player?.alliance_id === alliance.id ? (
            <>
              <AllianceManagement
                alliance={alliance}
                player={player}
                act={act}
                busy={!!busy}
                ledger={
                  (details?.ledger || []) as {
                    id: string;
                    username: string;
                    kind: string;
                    amount: number;
                    country_id: string | null;
                  }[]
                }
              />
              <button
                className="secondary full"
                onClick={() => void share(`${window.location.origin}/?invite=${alliance.invite}`)}
              >
                <Copy size={16} /> {t(" Copier le lien d’invitation\r\n              ")}</button>
              <p className="muted">
                {t("\r\n                Les attaques et les dons déjà engagés restent à l’alliance après votre départ. Vos\r\n                mises personnelles gardent votre nom et votre couleur.\r\n              ")}</p>
            </>
          ) : (
            <>
              <button
                className="primary full"
                disabled={
                  !!busy ||
                  !!player?.alliance_id ||
                  alliance.members >= alliance.memberLimit ||
                  (!!player && player.cooldown_until > now)
                }
                onClick={() => {
                  if (!player) {
                    setModal({ type: 'signup' });
                    return;
                  }
                  setModal({
                    type: 'confirm',
                    title: t("Rejoindre {0} ?", [alliance.name]),
                    message:
                      t("Vous gardez la liberté de jouer en votre nom. Vous pourrez donner à la trésorerie ; seuls le chef et les généraux pourront attaquer pour l’alliance."),
                    action: { action: 'join-alliance', allianceId: alliance.id },
                  });
                }}
              >
                {alliance.members >= alliance.memberLimit
                  ? t("Alliance complète · 12/12")
                  : t("Rejoindre cette alliance")}{' '}
                <ArrowRight size={16} />
              </button>
              {player?.alliance_id && (
                <p className="muted">
                  {t("\r\n                  Quittez votre alliance actuelle avant d’en rejoindre une autre.\r\n                ")}</p>
              )}
            </>
          )}
          <h3 className="list-heading">{t("La communauté")}</h3>
          {loadError && <p className="notice">{t(loadError)}</p>}
          {details &&
            (
              details.members as {
                id: string;
                username: string;
                color: string;
                alliance_role: string;
                donated: number;
                engaged: number;
              }[]
            )?.map((m) => (
              <div className="detail-list-row" key={m.id}>
                <span className="member-dot" style={{ background: m.color }}>
                  {m.username.slice(0, 1)}
                </span>
                <span>
                  {m.username}
                  <small>
                    {m.id === alliance.leader_id
                      ? 'Chef'
                      : m.alliance_role === 'general'
                        ? t("Général")
                        : 'Membre'}
                    {' · '}
                    {number(m.donated || 0)} {t(" versés · ")}{number(m.engaged || 0)} {t(" engagés\r\n                  ")}</small>
                </span>
                {alliance.leader_id === player?.id && m.id !== player.id && (
                  <div className="member-actions">
                    <button
                      className="text-button"
                      aria-label={
                        m.alliance_role === 'general'
                          ? t("Rétrograder {0}", [m.username])
                          : t("Nommer {0} général", [m.username])
                      }
                      onClick={() =>
                        setModal({
                          type: 'confirm',
                          title:
                            m.alliance_role === 'general'
                              ? t("Retirer le rôle de général ?")
                              : t("Nommer général ?"),
                          message:
                            t("Un général peut engager la trésorerie sur les objectifs du chef et est prioritaire dans la succession."),
                          action: {
                            action: 'set-general',
                            userId: m.id,
                            enabled: m.alliance_role !== 'general',
                          },
                        })
                      }
                    >
                      ★
                    </button>
                    <button
                      className="text-button danger"
                      onClick={() =>
                        setModal({
                          type: 'confirm',
                          title: t("Expulser {0} ?", [m.username]),
                          message:
                            t("Ses contributions actives restent à l’alliance jusqu’à expiration. Il pourra rejoindre une autre alliance immédiatement."),
                          action: { action: 'kick-member', userId: m.id },
                        })
                      }
                    >
                      {t("\r\n                      Expulser\r\n                    ")}</button>
                  </div>
                )}
              </div>
            ))}
          {player?.id === alliance.leader_id && alliance.members > 1 && (
            <label className="successor-choice">
              {t("\r\n              Transmettre le commandement à\r\n              ")}<select value={successor} onChange={(e) => setSuccessor(e.target.value)}>
                <option value="">{t("Succession automatique")}</option>
                {(details?.members as { id: string; username: string }[] | undefined)
                  ?.filter((m) => m.id !== player.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.username}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {player?.alliance_id === alliance.id && (
            <button
              className="danger-link"
              onClick={() =>
                setModal({
                  type: 'confirm',
                  title:
                    alliance.members === 1
                      ? t("Dissoudre votre alliance ?")
                      : t("Quitter votre alliance ?"),
                  message: `Les dons et mises collectives restent à l’alliance. Vos mises personnelles restent à votre nom. Vous devrez attendre 24 h avant de rejoindre ou créer une autre alliance. ${alliance.leader_id === player.id ? (alliance.members === 1 ? t("Votre alliance sera dissoute et sa trésorerie deviendra inaccessible.") : t("Le commandement sera transmis au successeur désigné ou, à défaut, au général prioritaire, puis au membre actif le plus ancien.")) : ''}`,
                  action: { action: 'leave-alliance', successorId: successor || undefined },
                })
              }
            >
              {t("\r\n              Quitter l’alliance\r\n            ")}</button>
          )}
        </>
      )}
      {type === 'invite' && !alliance && (
        <Empty title={t("Cette invitation a expiré")}>
          {t("\r\n          Cette alliance n’est plus disponible. Retrouvez les communautés depuis le menu Alliances.\r\n        ")}</Empty>
      )}
      {type === 'sponsor' && country && (
        <>
          <p className="modal-intro">
            {t("\r\n            Faites valider votre visuel, puis utilisez-le pour enchérir sur les pays de votre choix.\r\n            Le sponsoring est indépendant du contrôle des joueurs.\r\n          ")}</p>
          <div className="quote-card">
            <span>
              {country.flag} {countryLabel(country, locale)}
              <small>{t("Premier pays envisagé · le visuel sera réutilisable")}</small>
            </span>
            <strong>
              {sponsorMinimum(country.id) / 100} €<small>{t("minimum pour ce pays")}</small>
            </strong>
          </div>
          <form
            onSubmit={(e) =>
              void submit(
                e,
                'sponsor-proposal',
                t("Proposition envoyée à la modération. Aucun paiement effectué."),
                { countryId: country.id, color: selectedColor },
              )
            }
          >
            <label>
              {t("\r\n              Nom de votre projet\r\n              ")}<input
                name="name"
                minLength={2}
                maxLength={40}
                required
                placeholder={t("Votre marque ou votre communauté")}
              />
            </label>
            <label>
              {t("\r\n              Description courte\r\n              ")}<textarea
                name="description"
                minLength={5}
                maxLength={180}
                rows={2}
                required
                placeholder={t("Présentez votre projet au monde.")}
              />
            </label>
            <label>
              {t("\r\n              Site, application ou Instagram\r\n              ")}<input
                name="url"
                type="url"
                pattern="https://.*"
                required
                placeholder={t("https://votre-projet.com")}
              />
            </label>
            <label>
              {t("\r\n              Logo (facultatif)\r\n              ")}<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
              <small className="input-hint">
                {t("\r\n                PNG, JPEG ou WebP · 1 Mo maximum. Un logo sur fond transparent est conseillé. Sans\r\n                logo, vos initiales s’affichent dans le pays.\r\n              ")}</small>
            </label>
            <label>{t("Couleur de vos initiales")}{colorPicker()}</label>
            <label className="checkbox-label">
              <input type="checkbox" required />
              {t("\r\n              Je dispose des droits sur ce contenu et j’accepte les règles de modération. Les\r\n              publicités politiques sont exclues.\r\n            ")}</label>
            <button className="primary full" disabled={!!busy || uploading}>
              {uploading ? t("Traitement du logo…") : t("Soumettre pour validation")}{' '}
              <ArrowUpRight size={16} />
            </button>
          </form>
          <div className="form-note">
            <ShieldCheck size={18} />
            <span>
              {t("\r\n              Après validation, rechargez votre portefeuille et engagez vos crédits. Les fonds\r\n              engagés sont déplaçables pendant 30 jours, sans retour au portefeuille ni\r\n              prolongation.\r\n            ")}</span>
          </div>
        </>
      )}
      {type === 'my-sponsors' && player && (
        <SponsorConsole
          countryId={modal.id}
          paymentsEnabled={!!state?.paymentsEnabled}
          paymentsMode={state?.paymentsMode}
          version={state?.serverTime}
          act={act}
          onCreate={(id) => setModal({ type: 'sponsor', id })}
        />
      )}
      {type === 'help' && (
        <>
          <p className="modal-intro">
            {t("\r\n            The world is up for grabs. Une carte, des joueurs, des alliances. C’est tout ce qu’il\r\n            faut pour commencer.\r\n          ")}</p>
          <div className="rules-grid">
            {[
              {
                icon: Compass,
                n: '01',
                title: t('Explore'),
                text: t("{0} pays et territoires. Choisissez votre terrain sur la carte ou utilisez la recherche.", [countries.length]),
              },
              {
                icon: Zap,
                n: '02',
                title: t('Collect'),
                text: t('100 Influence à l’inscription, puis 20 toutes les 30 min en continu, même hors ligne. Le stock est plafonné à 160 : les recharges excédentaires sont perdues. Dépensez pour libérer de la place.'),
              },
              {
                icon: Flag,
                n: '03',
                title: t('Claim'),
                text: t("Un pays libre peut être revendiqué dès 1 Influence. Les mises actives s’additionnent : le meilleur score contrôle le pays. En cas d’égalité, le propriétaire conserve le territoire. Chaque mise expire au bout de 72 h, même hors ligne, et n’est pas remboursée."),
              },
              {
                icon: Users,
                n: '04',
                title: t("Team up"),
                text: t('12 membres maximum. Le chef définit les pays cibles et nomme les généraux. Tous peuvent donner à la trésorerie (plafond 1 920), seuls le chef et les généraux l’engagent. Le jeu personnel reste libre. Après un départ volontaire : 24 h avant de rejoindre ou créer une alliance.'),
              },
              {
                icon: Megaphone,
                n: '05',
                title: t('Sponsor'),
                text: t("Les sponsors ont une enchère séparée, dès 2 crédits pour les plus petits territoires (1 crédit = 1 €). Le minimum dépend de la surface et de la visibilité du pays. Le plus haut montant actif éligible affiche son logo. Les crédits engagés sont déplaçables, sans retour au portefeuille, et disparaissent 30 jours après leur premier placement. Le portefeuille est conservé, même entre saisons. Aucun gain d’Influence."),
              },
              {
                icon: Swords,
                n: '↗',
                title: t('Attaquez'),
                text: t("Depuis un pays que votre camp contrôle, envoyez ses troupes vers un voisin terrestre et choisissez le rival ciblé. Les points s’annulent un pour un, seuls vos survivants s’installent. Les autres camps restent intacts. Le départ est affaibli et les expirations des troupes restent inchangées. En alliance : chef ou général, et cible autorisée uniquement."),
              },
              {
                icon: Trophy,
                n: '✳',
                title: t("Laissez votre empreinte"),
                text: t("Retrouvez vos succès, missions et cosmétiques dans Succès & objectifs. Choisissez une mission personnelle et gardez ses pays pendant une heure sans interruption. Les cadres, titres et contours débloqués restent acquis entre les saisons, sans avantage de puissance."),
              },
              {
                icon: History,
                n: '↻',
                title: 'Recommencez',
                text: t("Une saison dure 30 jours. Mises et trésoreries repartent à zéro. Des bonus individuels temporaires dépendent du contrôle dans la durée, des fonds réellement utilisés et du temps de participation : maximum +20 de stock, +2 par recharge et 20 Influence de départ. Ils expirent à la fin de la saison suivante et ne s’additionnent jamais."),
              },
            ].map((r) => (
              <div key={r.title}>
                <span className="rule-number">{r.n}</span>
                <r.icon size={22} />
                <h3>{t(r.title)}</h3>
                <p>{t(r.text)}</p>
              </div>
            ))}
          </div>
          <div className="notice">
            {t("\r\n            Règles de communauté : pas de haine, harcèlement, nudité explicite, contenu illégal,\r\n            arnaque, usurpation ou publicité politique payante. Signalez un contenu depuis sa fiche\r\n            pays.\r\n          ")}</div>
        </>
      )}
      {type === 'geography' && (
        <div className="prose">
          <p>
            {t("\r\n            La carte utilise les données")}{' '}
            <a
              href="https://www.naturalearthdata.com/about/disputed-boundaries-policy/"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("\r\n              Natural Earth 1:10m\r\n            ")}</a>
            {t("\r\n            . Elle comprend ")}{countries.length} {t(" pays et territoires, hors Antarctique.\r\n          ")}</p>
          <p>
            {t("\r\n            La projection cylindrique de Miller forme un planisphère rectangulaire avec des\r\n            méridiens et des parallèles droits. Elle privilégie une vue mondiale familière ; les\r\n            surfaces et les formes restent déformées, surtout près des pôles.\r\n          ")}</p>
          <p>
            {t("\r\n            Les frontières et noms suivent cette source de manière cohérente. Ils ne constituent\r\n            aucune prise de position ni reconnaissance diplomatique. Un territoire distinct dans les\r\n            données est une unité de jeu distincte.\r\n          ")}</p>
          <p>
            {t("\r\n            Les territoires ultramarins nommés sont séparés : la France, La Réunion et la Martinique\r\n            ont chacun leurs conquêtes et leur emplacement publicitaire. Le nom après la barre\r\n            oblique indique leur rattachement, sans les regrouper dans le jeu. Hawaï et l’Alaska\r\n            sont également séparés des États-Unis continentaux.\r\n          ")}</p>
          <p>
            {t("\r\n            Quelques repères discrets signalent les territoires nommés invisibles à cette échelle,\r\n            avec un seul point par territoire. Les îlots minuscules apparaissent au zoom et restent\r\n            accessibles par la recherche. Les archipels comme Vanuatu et les îles Marshall restent\r\n            des territoires de jeu uniques.\r\n          ")}</p>
          <p>
            {t("\r\n            Les logos se placent sur un point de référence du territoire et peuvent utiliser une\r\n            pastille pour rester lisibles.\r\n          ")}</p>
        </div>
      )}
      {type === 'privacy' && (
        <div className="prose">
          <p>
            {t("\r\n            CLAIMED.WORLD est édité par ")}{OPERATOR.name}, {OPERATOR.status.toLowerCase()}{t(", en")}{' '}
            {OPERATOR.country}{t(". SIRET : ")}{OPERATOR.siret}{t(". Pour une question sur le service, le\r\n            sponsoring ou vos données : ")}<a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
          </p>
          <p>
            {t("\r\n            Le jeu conserve votre pseudonyme, votre adresse e-mail vérifiée et privée, votre\r\n            couleur, un mot de passe dérivé avec scrypt, vos contributions, vos alliances et vos\r\n            propositions publicitaires. La version hébergée utilise une base PostgreSQL privée chez\r\n            Supabase et un espace privé pour les logos.\r\n          ")}</p>
          <p>
            {t("\r\n            Un cookie strictement nécessaire, HttpOnly et SameSite, maintient votre connexion\r\n            pendant 30 jours. Aucun outil de suivi publicitaire ni cookie analytique n’est installé.\r\n          ")}</p>
          <p>
            {t("\r\n            Les pseudonymes, couleurs, titres, succès, alliances et scores sont publics. Les mots de\r\n            passe, adresses e-mail, codes de vérification et jetons de session ne sont jamais\r\n            transmis aux autres joueurs. Les codes expirent après 10 minutes et les demandes\r\n            expirées sont purgées lors des demandes suivantes. Gmail assure l’envoi des e-mails de\r\n            vérification. Stripe traite les informations de paiement si l’exploitant active cette\r\n            option.\r\n          ")}</p>
          <p>
            {t("\r\n            Retrouvez les")}{' '}
            <a href="/sponsoring" target="_blank" rel="noopener noreferrer">
              {t("\r\n              informations sur le sponsoring\r\n            ")}</a>
            {t("\r\n            . Pour demander l’accès, la rectification ou la suppression de vos données, contactez\r\n            l’adresse ci-dessus. Le jeu ne dispose pas encore d’un service de récupération de mot de\r\n            passe.\r\n          ")}</p>
        </div>
      )}
      {type === 'activity' && (
        <div className="activity-list">
          {state?.activity.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                if (a.country_id) {
                  chooseCountry(a.country_id, true);
                  close();
                }
              }}
            >
              <span
                style={{
                  color: a.country_id ? a.color : '#111111',
                  background: a.country_id ? `${a.color}15` : '#f0f0f0',
                }}
              >
                <Flag size={17} />
              </span>
              <span>
                <strong>{a.text}</strong>
                <small>{ago(a.created_at, now, t)}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      {type === 'confirm' && (
        <>
          <p className="modal-intro">{modal.message}</p>
          <div className="confirm-actions">
            <button className="secondary" onClick={close}>
              {t("\r\n              Annuler\r\n            ")}</button>
            <button
              className="primary"
              disabled={!!busy}
              onClick={() =>
                void act(modal.action!, t("Action confirmée.")).then((ok) => ok && close())
              }
            >
              {t("\r\n              Confirmer ")}<Check size={16} />
            </button>
          </div>
        </>
      )}
      {type === 'report' && (
        <form
          onSubmit={(e) =>
            void submit(e, 'report', t("Signalement transmis à la modération."), { target: modal.id })
          }
        >
          <p className="modal-intro">
            {t("\r\n            Décrivez précisément le contenu et le problème observé. L’équipe de modération examinera\r\n            votre signalement.\r\n          ")}</p>
          <label>
            {t("\r\n            Motif\r\n            ")}<textarea name="reason" minLength={10} maxLength={500} rows={5} required />
          </label>
          <button className="primary full" disabled={!!busy}>
            {t("\r\n            Envoyer le signalement ")}<Flag size={16} />
          </button>
        </form>
      )}
      {type === 'admin' && (
        <>
          {loadError && <p className="notice">{t(loadError)}</p>}
          <AdminMapReset
            seasonId={state?.season.id || 0}
            resetBefore={Number(details?.resetCutoff || 0)}
            act={act}
            busy={!!busy}
            onComplete={loadDetails}
          />
          <h3 className="list-heading">{t("Propositions de sponsoring")}</h3>
          {(details?.sponsors as (Sponsor & { username: string })[] | undefined)?.map((s) => (
            <div className="admin-sponsor" key={s.id}>
              <div>
                {s.logo_id && (
                  <Image
                    className="admin-logo"
                    src={`/api/media/${s.logo_id}`}
                    alt={t("Logo de {0}", [s.name])}
                    width={64}
                    height={64}
                    unoptimized
                  />
                )}
                <strong>
                  {s.name} · {countries.find((c) => c.id === s.country_id) ? countryLabel(countries.find((c) => c.id === s.country_id)!, locale) : ''}
                </strong>
                <small>
                  {t("\r\n                  Par ")}{s.username} · {s.status} · {s.payment_status}
                </small>
                <p>{s.description}</p>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.url} <ExternalLink size={11} />
                </a>
              </div>
              {s.status === 'pending' && (
                <div>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void act(
                        { action: 'moderate', id: s.id, decision: 'approve' },
                        t("Contenu validé."),
                      ).then(() => loadDetails())
                    }
                  >
                    {t("\r\n                    Valider\r\n                  ")}</button>
                  <button
                    className="danger-link"
                    disabled={!!busy}
                    onClick={() =>
                      void act(
                        { action: 'moderate', id: s.id, decision: 'reject' },
                        t("Proposition refusée."),
                      ).then(() => loadDetails())
                    }
                  >
                    {t("\r\n                    Refuser\r\n                  ")}</button>
                </div>
              )}
              {s.status === 'approved' && (
                <button
                  className="danger-link"
                  disabled={!!busy}
                  onClick={() =>
                    void act(
                      { action: 'moderate', id: s.id, decision: 'reject' },
                      t("Visuel suspendu. Les fonds restent déplaçables vers un visuel approuvé."),
                    ).then(() => loadDetails())
                  }
                >
                  {t("\r\n                  Suspendre le visuel\r\n                ")}</button>
              )}
            </div>
          ))}
          {details && !(details.sponsors as unknown[])?.length && (
            <p className="muted">{t("Aucune proposition à examiner.")}</p>
          )}
          <h3 className="list-heading">{t("Signalements ouverts")}</h3>
          {(
            details?.reports as
              { id: string; target: string; reason: string; username: string }[] | undefined
          )?.map((r) => (
            <div className="admin-sponsor" key={r.id}>
              <div>
                <strong>
                  {r.target} {t(" · par ")}{r.username}
                </strong>
                <p>{r.reason}</p>
              </div>
              <button
                className="secondary"
                disabled={!!busy}
                onClick={() =>
                  void act(
                    { action: 'moderate', id: r.id, decision: 'resolve' },
                    t("Signalement traité."),
                  ).then(() => loadDetails())
                }
              >
                {t("\r\n                Marquer traité\r\n              ")}</button>
            </div>
          ))}
          {details && !(details.reports as unknown[])?.length && (
            <p className="muted">{t("Aucun signalement ouvert.")}</p>
          )}
        </>
      )}
      {type === 'archive' && (
        <>
          {loadError && <p className="notice">{t(loadError)}</p>}
          {details ? (
            <>
              <p className="modal-intro">{String(details.summary)}</p>
              <div className="archive-champions">
                {(['allianceChampion', 'independentChampion'] as const).map((key) => {
                  const champion = details[key] as { name: string; territories: number } | null;
                  return (
                    <div key={key}>
                      <Trophy size={19} />
                      <span>
                        {key === 'allianceChampion'
                          ? t("ALLIANCE CHAMPIONNE")
                          : t("MEILLEUR INDÉPENDANT")}
                      </span>
                      <strong>{champion?.name || t("Aucun champion")}</strong>
                      <small>
                        {champion
                          ? t("{0} territoires", [champion.territories])
                          : t("La place reste à prendre.")}
                      </small>
                    </div>
                  );
                })}
              </div>
              <WorldMap
                territories={(details.territories || []) as Territory[]}
                selected={null}
                onSelect={() => {}}
                filter="all"
                focusId={null}
              />
              <h3 className="list-heading">{t("Classement final")}</h3>
              {(details.ranking as { name: string; territories: number; alliance: boolean }[]).map(
                (r, i) => (
                  <div className="detail-list-row" key={i}>
                    <strong>
                      #{i + 1} {r.name}
                    </strong>
                    <span>{r.territories} {t(" territoires")}</span>
                  </div>
                ),
              )}
              {!!(details.mostContested as unknown[] | undefined)?.length && (
                <>
                  <h3 className="list-heading">{t("Les territoires les plus disputés")}</h3>
                  {(details.mostContested as { id: string; name: string; changes: number }[]).map(
                    (c) => (
                      <div className="detail-list-row" key={c.id}>
                        <strong>{c.name}</strong>
                        <span>{c.changes} {t(" changements de contrôle")}</span>
                      </div>
                    ),
                  )}
                </>
              )}
            </>
          ) : (
            <p className="muted">{t("Chargement de la carte finale…")}</p>
          )}
        </>
      )}
      {type === 'public-profile' &&
        (() => {
          const c = details?.profile as
            { id: string; username: string; color: string; alliance_id: string | null } | undefined;
          return c ? (
            <>
              <div className="profile-overview">
                <span
                  className={`avatar large frame-${(details?.appearance as Appearance)?.frame || 'none'}`}
                  style={{ background: c.color }}
                >
                  {c.username.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h3>{c.username}</h3>
                  {(details?.appearance as Appearance)?.title && (
                    <span className="player-title">
                      {(details?.appearance as Appearance).title}
                    </span>
                  )}
                  <p>
                    {c.alliance_id
                      ? state?.alliances.find((a) => a.id === c.alliance_id)?.name || 'Alliance'
                      : t("Joueur indépendant")}{' '}
                    · {(details?.territories as string[])?.length || 0} {t(" territoires en solo\r\n                  ")}</p>
                </div>
              </div>
              <button
                className="secondary full"
                onClick={() => void share(`${window.location.origin}/?player=${c.id}`)}
              >
                <Copy size={15} />
                {t("\r\n                Partager ce profil\r\n              ")}</button>
              {(details?.badges as { season: number; title: string }[])?.map((b) => (
                <p className="muted" key={b.season}>
                  <Trophy size={14} /> {b.title} {t(" · Saison ")}{b.season}
                </p>
              ))}
              <h3 className="list-heading">{t("Succès & objectifs accomplis")}</h3>
              <div className="public-achievements">
                {((details?.achievements as { id: string; unlockedAt: number }[]) || []).map(
                  (earned) => (
                    <span key={earned.id}>
                      <Trophy size={13} />
                      {ACHIEVEMENTS.find((a) => a.id === earned.id)?.name ||
                        CONTROL_OBJECTIVES.find((o) => `goal:${o.id}` === earned.id)?.name}
                    </span>
                  ),
                )}
              </div>
            </>
          ) : (
            <p className="muted">{loadError || t("Chargement du profil…")}</p>
          );
        })()}
    </Dialog>
  );
}
