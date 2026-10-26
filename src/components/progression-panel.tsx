'use client';
import { useState } from 'react';
import { ArrowUpRight, Check, Flag, LockKeyhole, Sparkles, Target, Trophy } from 'lucide-react';
import {
  ACHIEVEMENTS,
  CONTROL_OBJECTIVES,
  COSMETICS,
  type CosmeticSlot,
} from '@/lib/progression-catalog';
import type { Country, Snapshot } from '@/lib/types';
import countriesData from '@/data/countries.json';
const countries = countriesData as Country[];
type Action = (body: Record<string, unknown>, success?: string) => Promise<boolean>;

export default function ProgressionPanel({
  state,
  act,
  busy,
  onCountry,
  onSignup,
  onTutorial,
}: {
  state: Snapshot | null;
  act: Action;
  busy: string;
  onCountry: (id: string) => void;
  onSignup: () => void;
  onTutorial: () => void;
}) {
  const [tab, setTab] = useState('achievements');
  const [slot, setSlot] = useState<CosmeticSlot>('frame');
  const progress = state?.progression;
  const unlocked = new Set(progress?.unlocks.map((u) => u.id));
  const color = state?.player?.color || '#111111';
  const appearance = progress?.appearance;
  const rewardName = (id: string) => COSMETICS.find((c) => c.id === id)?.name;
  return (
    <div className="progression-panel">
      <div className="progression-intro">
        <span className="eyebrow">VOTRE EMPREINTE / À VOTRE RYTHME</span>
        <h3>Une carte. Votre histoire.</h3>
        <p>
          Des défis à accomplir et une identité à construire. Vos déblocages restent acquis entre
          les saisons.
        </p>
        <div className="progression-totals">
          <span>
            <b>{unlocked.size}</b> / {ACHIEVEMENTS.length + CONTROL_OBJECTIVES.length} accomplis
          </span>
          <span>
            <Sparkles size={13} /> Récompenses visuelles uniquement
          </span>
        </div>
        <button className="text-button progression-tutorial" onClick={onTutorial}>
          Rejouer le didacticiel <ArrowUpRight size={12} />
        </button>
      </div>
      <div className="progression-tabs" role="tablist" aria-label="Progression">
        {[
          ['achievements', 'Succès', Trophy],
          ['objectives', 'Objectifs', Target],
          ['appearance', 'Apparence', Sparkles],
        ].map(([id, label, Icon]) => {
          const TabIcon = Icon as typeof Trophy;
          return (
            <button
              key={String(id)}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`progression-${id}`}
              id={`tab-${id}`}
              onClick={() => setTab(String(id))}
            >
              <TabIcon size={14} />
              {String(label)}
            </button>
          );
        })}
      </div>
      {!state?.player && (
        <div className="progression-signup">
          <p>Connectez-vous pour enregistrer vos succès et choisir un objectif.</p>
          <button className="primary full" onClick={onSignup}>
            Commencer gratuitement <ArrowUpRight size={15} />
          </button>
        </div>
      )}
      <div role="tabpanel" id={`progression-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'achievements' && (
          <div className="achievement-list">
            {ACHIEVEMENTS.map((success, index) => {
              const earned = progress?.unlocks.find((u) => u.id === success.id);
              const value = Math.min(success.target, progress?.metrics[success.metric] || 0);
              return (
                <article key={success.id} className={`achievement-card ${earned ? 'earned' : ''}`}>
                  <span className="achievement-number">
                    {earned ? <Check size={17} /> : String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h4>{success.name}</h4>
                    <p>{success.description}</p>
                    <div
                      className="achievement-meter"
                      role="progressbar"
                      aria-label={success.name}
                      aria-valuemin={0}
                      aria-valuemax={success.target}
                      aria-valuenow={Math.floor(value)}
                    >
                      <i style={{ width: `${(value / success.target) * 100}%` }} />
                    </div>
                    <div className="achievement-meta">
                      <span>
                        {earned
                          ? `Acquis le ${new Date(earned.unlockedAt).toLocaleDateString('fr-FR')}`
                          : `${Math.floor(value).toLocaleString('fr-FR')} / ${success.target.toLocaleString('fr-FR')}${success.metric === 'holdHours' ? ' h' : ''}`}
                      </span>
                      <span>
                        <Sparkles size={10} />
                        {rewardName(success.reward)}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {tab === 'objectives' && (
          <>
            <p className="progression-note">
              Choisissez une mission, puis gardez tous ses territoires en votre nom pendant 1 heure
              sans interruption. Un seul objectif suivi à la fois. Changer de mission recommence le
              compteur ; une nouvelle saison demande une nouvelle sélection.
            </p>
            <div className="objective-list">
              {CONTROL_OBJECTIVES.map((goal) => {
                const active = progress?.objective?.id === goal.id ? progress.objective : null;
                const completed = unlocked.has(`goal:${goal.id}`);
                const held = Math.min(goal.duration, active?.heldMs || 0);
                const remaining = Math.max(0, Math.ceil((goal.duration - held) / 60000));
                return (
                  <article
                    key={goal.id}
                    className={`objective-card ${active && !completed ? 'active' : ''}`}
                  >
                    <div className="objective-heading">
                      <Target size={18} />
                      <h4>{goal.name}</h4>
                      <span>{completed ? 'ACCOMPLI' : active ? 'EN COURS' : '01 H'}</span>
                    </div>
                    <p>{goal.description}</p>
                    <div className="objective-countries">
                      {goal.countries.map((id) => (
                        <button key={id} onClick={() => onCountry(id)}>
                          {active?.controlled.includes(id) ? (
                            <Check size={11} />
                          ) : (
                            <Flag size={11} />
                          )}
                          {countries.find((c) => c.id === id)?.name}
                        </button>
                      ))}
                    </div>
                    {active && !completed && (
                      <>
                        <div
                          className="achievement-meter"
                          role="progressbar"
                          aria-label={`Contrôle : ${goal.name}`}
                          aria-valuemin={0}
                          aria-valuemax={60}
                          aria-valuenow={Math.floor(held / 60000)}
                        >
                          <i style={{ width: `${(held / goal.duration) * 100}%` }} />
                        </div>
                        <p className="objective-status">
                          {active.controlled.length} / {goal.countries.length} territoires ·{' '}
                          {active.controlled.length === goal.countries.length
                            ? `${remaining} min de contrôle restant`
                            : 'Le compteur attend tous les territoires.'}
                        </p>
                      </>
                    )}
                    <div className="objective-bottom">
                      <small>
                        <Sparkles size={12} />
                        {rewardName(goal.reward)}
                      </small>
                      <button
                        className="secondary"
                        disabled={!state?.player || !!busy || !!active || completed}
                        onClick={() =>
                          void act(
                            { action: 'select-objective', objectiveId: goal.id },
                            'Objectif suivi. À vous de jouer !',
                          )
                        }
                      >
                        {completed ? (
                          <>
                            <Check size={12} />
                            Accompli
                          </>
                        ) : active ? (
                          'Objectif suivi'
                        ) : progress?.objective ? (
                          'Changer d’objectif'
                        ) : (
                          'Suivre cet objectif'
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="progression-note">
              Ces missions personnelles ne modifient pas les cibles de votre alliance. Le temps
              continue hors ligne ; les mises d’Influence expirent toujours après 72 heures.
            </p>
          </>
        )}
        {tab === 'appearance' && (
          <>
            <div className="appearance-preview">
              <span
                className={`avatar large frame-${appearance?.frame || 'none'}`}
                style={{ background: color }}
              >
                {state?.player?.username.slice(0, 2).toUpperCase() || 'VO'}
              </span>
              <div>
                <h4>{state?.player?.username || 'Votre pseudo'}</h4>
                <p>{appearance?.title || 'Votre histoire commence ici'}</p>
              </div>
              <svg viewBox="0 0 72 64" width="72" height="64" aria-label="Aperçu du contour">
                <path
                  d="M10 14 38 5 61 22 52 52 24 58 7 38Z"
                  fill="#141414"
                  stroke={color}
                  strokeWidth={appearance?.border === 'double' ? 6 : 3}
                  strokeDasharray={appearance?.border === 'signal' ? '2 5' : undefined}
                />
                {appearance?.border === 'double' && (
                  <path
                    d="M10 14 38 5 61 22 52 52 24 58 7 38Z"
                    fill="none"
                    stroke="#141414"
                    strokeWidth="2"
                  />
                )}
              </svg>
            </div>
            <div className="cosmetic-slots" aria-label="Catégorie d’apparence">
              {(
                [
                  ['frame', 'Cadres'],
                  ['title', 'Titres'],
                  ['border', 'Contours'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={slot === id ? 'active' : ''}
                  aria-pressed={slot === id}
                  onClick={() => setSlot(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="cosmetic-grid">
              {COSMETICS.filter((c) => c.slot === slot).map((item) => {
                const available = !item.requires || unlocked.has(item.requires);
                const equipped = progress?.equipped[slot] === item.id;
                const requirement =
                  ACHIEVEMENTS.find((a) => a.id === item.requires)?.name ||
                  CONTROL_OBJECTIVES.find((o) => `goal:${o.id}` === item.requires)?.name;
                return (
                  <article key={item.id} className={`cosmetic-card ${available ? '' : 'locked'}`}>
                    <div className="cosmetic-sample">
                      {slot === 'frame' ? (
                        <span
                          className={`avatar frame-${item.style}`}
                          style={{ background: color }}
                        >
                          VO
                        </span>
                      ) : slot === 'title' ? (
                        <span className="sample-title">{item.style || '—'}</span>
                      ) : (
                        <svg viewBox="0 0 110 24" width="110" height="24" aria-hidden="true">
                          <path
                            d="M4 12H106"
                            stroke={color}
                            strokeWidth={item.style === 'double' ? 7 : 3}
                            strokeDasharray={item.style === 'signal' ? '2 6' : undefined}
                          />
                          {item.style === 'double' && (
                            <path d="M4 12H106" stroke="#fafafa" strokeWidth="3" />
                          )}
                        </svg>
                      )}
                    </div>
                    <h4>{item.name}</h4>
                    <p>{available ? 'Dans votre collection' : requirement}</p>
                    <button
                      className="secondary full"
                      disabled={!state?.player || !!busy || !available || equipped}
                      onClick={() =>
                        void act(
                          { action: 'equip-cosmetic', cosmeticId: item.id },
                          'Apparence équipée.',
                        )
                      }
                    >
                      {equipped ? (
                        <>
                          <Check size={12} />
                          Équipé
                        </>
                      ) : !available ? (
                        <>
                          <LockKeyhole size={12} />À débloquer
                        </>
                      ) : (
                        'Équiper'
                      )}
                    </button>
                  </article>
                );
              })}
            </div>
            <p className="progression-note">
              Votre cadre et votre titre vous suivent sur votre profil et dans les classements. Les
              contours habillent vos territoires personnels. Les récompenses n’augmentent ni vos
              gains, ni votre stock, ni votre score.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
