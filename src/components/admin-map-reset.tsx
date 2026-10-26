'use client';
import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';

export default function AdminMapReset({
  seasonId,
  resetBefore,
  act,
  busy,
  onComplete,
}: {
  seasonId: number;
  resetBefore: number;
  busy: boolean;
  onComplete: () => Promise<void>;
  act: (body: Record<string, unknown>, success?: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState('');
  return (
    <section className="admin-map-reset">
      <h3>Remise à zéro de la carte</h3>
      <p>Rendre les pays neutres en retirant toute l’Influence actuellement placée.</p>
      {!open ? (
        <button
          className="danger-link"
          disabled={busy || !resetBefore}
          onClick={() => setOpen(true)}
        >
          Remettre la carte à zéro
        </button>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || confirmation !== 'REINITIALISER') return;
            if (
              await act(
                { action: 'admin-reset-map', seasonId, resetBefore, confirmation },
                'La conquête de la carte a été remise à zéro.',
              )
            ) {
              setOpen(false);
              setConfirmation('');
              await onComplete();
            }
          }}
        >
          <p role="alert">
            <TriangleAlert size={17} /> Attention : cette action est irréversible depuis le jeu. Les
            forces de la saison présentes sur la carte expireront immédiatement. Les comptes,
            stocks, alliances, fonds et annonces sponsorisés sont conservés. L’historique reste
            disponible.
          </p>
          <label>
            Pour confirmer, saisissez REINITIALISER
            <input
              aria-label="Confirmation de remise à zéro"
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </label>
          <div className="confirm-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setConfirmation('');
              }}
            >
              Annuler
            </button>
            <button className="primary" disabled={busy || confirmation !== 'REINITIALISER'}>
              Confirmer la remise à zéro
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
