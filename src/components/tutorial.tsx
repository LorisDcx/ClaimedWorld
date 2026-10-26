'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import type { Snapshot } from '@/lib/types';

const storageKey = 'claimed-tutorial-v1';
const initial = { step: 0, dismissed: false };
export default function Tutorial({
  state,
  selected,
  hidden,
  replay,
  act,
  onExplore,
  onSignup,
  onProgression,
}: {
  state: Snapshot | null;
  selected: string | null;
  hidden: boolean;
  replay: number;
  act: (body: Record<string, unknown>, success?: string) => Promise<boolean>;
  onExplore: () => void;
  onSignup: () => void;
  onProgression: () => void;
}) {
  const [guest, setGuest] = useState(initial);
  const [ready, setReady] = useState(false);
  const progress = state?.progression;
  const tutorial = progress?.tutorial || guest;
  const userId = state?.player?.id;
  const save = (step: number, dismissed = false) => {
    if (userId) void act({ action: 'tutorial', step, dismissed });
    else {
      const value = { step, dismissed };
      setGuest(value);
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        /* Private browsing can disable storage. */
      }
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (
          saved &&
          Number.isInteger(saved.step) &&
          saved.step >= 0 &&
          saved.step <= 4 &&
          typeof saved.dismissed === 'boolean'
        )
          setGuest(saved);
      } catch {
        /* Start with the introduction when storage is unavailable. */
      }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!replay) return;
    const timer = setTimeout(() => {
      if (userId) void act({ action: 'tutorial', step: 0, dismissed: false });
      else {
        setGuest(initial);
        try {
          localStorage.setItem(storageKey, JSON.stringify(initial));
        } catch {
          /* Optional storage. */
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [replay, userId, act]);
  useEffect(() => {
    if (!ready || tutorial.dismissed || tutorial.step === 4) return;
    let next = tutorial.step;
    if (selected && next < 2) next = 2;
    if (next === 2 && (progress?.metrics.spent || 0) > 0) next = 3;
    if (next === 3 && progress?.objective) next = 4;
    if (next === tutorial.step) return;
    const timer = setTimeout(() => {
      if (userId) void act({ action: 'tutorial', step: next, dismissed: false });
      else {
        const value = { step: next, dismissed: false };
        setGuest(value);
        try {
          localStorage.setItem(storageKey, JSON.stringify(value));
        } catch {
          /* Optional storage. */
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [
    ready,
    selected,
    tutorial.step,
    tutorial.dismissed,
    progress?.metrics.spent,
    progress?.objective,
    userId,
    act,
  ]);
  if (!state || !ready || hidden || tutorial.dismissed || tutorial.step === 4) return null;
  const step = tutorial.step;
  return (
    <aside
      className={`tutorial-coach ${selected ? 'with-selection' : ''}`}
      aria-label="Didacticiel"
    >
      <div className="tutorial-top">
        <span>DIDACTICIEL / {Math.max(1, step)} SUR 3</span>
        <button onClick={() => save(step, true)} aria-label="Masquer le didacticiel">
          <X size={13} />
        </button>
      </div>
      <div className="tutorial-dots" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <i key={n} className={n <= step ? 'active' : ''} />
        ))}
      </div>
      <h2>
        {step <= 1
          ? 'Un pays vous attend.'
          : step === 2
            ? 'À vous de planter le drapeau.'
            : 'Donnez-vous un cap.'}
      </h2>
      <p>
        {step <= 1
          ? 'Déplacez la carte ou utilisez la recherche. Cliquez sur un pays pour voir qui le contrôle.'
          : step === 2
            ? 'En votre nom, 1 Influence suffit sur un pays libre. Sur un pays occupé, dépassez le premier score. Validez vous-même votre mise dans la barre du pays.'
            : 'Votre première mise a débloqué un titre. Ouvrez votre progression, choisissez un objectif de contrôle et découvrez vos apparences.'}
      </p>
      {step === 2 && (
        <small>
          +20 / 30 min · stock de base 160 · mises actives 72 h. Les timers continuent hors ligne.
          Le sponsoring est une compétition séparée.
        </small>
      )}
      <button
        className="tutorial-action"
        onClick={() => {
          if (step <= 1) {
            save(1);
            onExplore();
          } else if (step === 2) {
            if (!userId) onSignup();
            else if (!selected) onExplore();
          } else onProgression();
        }}
        disabled={step === 2 && !!userId && !!selected}
      >
        {step <= 1
          ? 'Explorer un pays libre'
          : step === 2
            ? !userId
              ? 'Créer mon compte gratuit'
              : selected
                ? 'Utilisez le bouton Revendiquer'
                : 'Choisir un territoire'
            : 'Choisir mon objectif'}
        <ArrowRight size={14} />
      </button>
      <button className="tutorial-skip" onClick={() => save(step, true)}>
        <Check size={11} />
        Je connais déjà le jeu
      </button>
    </aside>
  );
}
