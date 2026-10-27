'use client';
import { useT } from '@/i18n/provider';

import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import type { Snapshot } from '@/lib/types';
const lessons = [
  {
    title: 'Bienvenue dans votre monde.',
    text: 'Votre stock personnel est en haut : vous commencez avec 100 Influence. Il se recharge de 20 toutes les demi-heures, même hors ligne, jusqu’à 160. Jouer et conquérir restent gratuits.',
  },
  {
    title: 'Choisissez un territoire.',
    text: 'Cliquez sur la carte ou utilisez la recherche. Le panneau à droite présente le propriétaire et les scores des prétendants. Un pays libre peut être revendiqué dès 1 Influence.',
  },
  {
    title: 'Vous choisissez le montant.',
    text: 'Dans Conquête, saisissez directement combien d’Influence envoyer, puis validez. Le montant nécessaire pour prendre le contrôle est indiqué. Vous pouvez aussi contribuer moins ou renforcer un pays. Chaque mise dure 72 h.',
  },
  {
    title: 'Ensuite, jouez à votre rythme.',
    text: 'Pour attaquer, contrôlez un pays voisin et choisissez un rival ; vous pouvez envoyer votre stock. En alliance, contribuez à la trésorerie : le chef et ses généraux la dépensent. Retrouvez les objectifs et cosmétiques dans votre progression. Le sponsoring affiche des logos, sans bonus de conquête.',
  },
];
export default function Tutorial({
  state,
  selected,
  hidden,
  replay,
  busy = false,
  act,
  onExplore,
  onProgression,
}: {
  state: Snapshot | null;
  selected: string | null;
  hidden: boolean;
  replay: number;
  busy?: boolean;
  act: (body: Record<string, unknown>, success?: string) => Promise<boolean>;
  onExplore: () => void;
  onProgression: () => void;
}) {
  const t = useT();
  const lastReplay = useRef(replay);
  const userId = state?.player?.id;
  useEffect(() => {
    if (!userId || lastReplay.current === replay) return;
    lastReplay.current = replay;
    void act({ action: 'tutorial', step: 0, dismissed: false });
  }, [replay, userId, act]);
  const tutorial = state?.progression?.tutorial;
  if (!userId || !tutorial || hidden || tutorial.dismissed || tutorial.step >= 4) return null;
  const step = tutorial.step,
    lesson = lessons[step];
  const save = (next: number, dismissed = false) =>
    void act({ action: 'tutorial', step: next, dismissed });
  return (
    <aside
      className={`tutorial-coach ${selected ? 'with-selection' : ''}`}
      data-step={step}
      aria-label={t("Didacticiel")}
    >
      <div className="tutorial-top">
        <span>{t("VOTRE PREMIÈRE VISITE / ")}{step + 1} {t(" SUR 4")}</span>
        <button onClick={() => save(step, true)} aria-label={t("Masquer le didacticiel")}>
          <X size={14} />
        </button>
      </div>
      <div className="tutorial-dots" aria-hidden="true">
        {lessons.map((_, index) => (
          <i key={index} className={index <= step ? 'active' : ''} />
        ))}
      </div>
      <h2>{t(lesson.title)}</h2>
      <p>{t(lesson.text)}</p>
      {(step === 1 || (step === 2 && !selected)) && (
        <button className="tutorial-context" onClick={onExplore}>
          {t("\r\n          Me montrer un pays ")}<ArrowRight size={13} />
        </button>
      )}
      {step === 3 && (
        <button className="tutorial-context" onClick={onProgression}>
          {t("\r\n          Voir mes objectifs et apparences ")}<ArrowRight size={13} />
        </button>
      )}
      <small>{t("Vous pouvez continuer sans revendiquer, dépenser ou attaquer.")}</small>
      <div className="tutorial-navigation">
        {step > 0 && (
          <button className="text-button" disabled={busy} onClick={() => save(step - 1)}>
            <ArrowLeft size={13} />
            {t("\r\n            Précédent\r\n          ")}</button>
        )}
        <button className="tutorial-action" disabled={busy} onClick={() => save(step + 1)}>
          {step === 3 ? t("Terminer la visite") : t('Suivant')}
          <ArrowRight size={14} />
        </button>
      </div>
      <button className="tutorial-skip" onClick={() => save(step, true)}>
        <Check size={11} />
        {t("\r\n        Je connais déjà le jeu\r\n      ")}</button>
    </aside>
  );
}
