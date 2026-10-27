'use client';
import { useT } from '@/i18n/provider';

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
  const t = useT();
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  return (
    <section className="admin-map-reset">
      <h3>{t("Remise à zéro de la carte")}</h3>
      <p>{t("Rendre les pays neutres en retirant toute l’Influence actuellement placée.")}</p>
      {!open ? (
        <button
          className="danger-link"
          disabled={busy || !resetBefore}
          onClick={() => setOpen(true)}
        >
          {t("\r\n          Remettre la carte à zéro\r\n        ")}</button>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || confirmation !== 'REINITIALISER' || !password) return;
            if (
              await act(
                { action: 'admin-reset-map', seasonId, resetBefore, confirmation, password },
                t("La conquête de la carte a été remise à zéro."),
              )
            ) {
              setOpen(false);
              setConfirmation('');
              setPassword('');
              await onComplete();
            }
          }}
        >
          <p role="alert">
            <TriangleAlert size={17} /> {t(" Attention : cette action est irréversible depuis le jeu. Les\r\n            forces de la saison présentes sur la carte expireront immédiatement. Les comptes,\r\n            stocks, alliances, fonds et annonces sponsorisés sont conservés. L’historique reste\r\n            disponible.\r\n          ")}</p>
          <label>
            {t("\r\n            Pour confirmer, saisissez REINITIALISER\r\n            ")}<input
              aria-label={t("Confirmation de remise à zéro")}
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </label>
          <label>
            {t("\r\n            Votre mot de passe actuel\r\n            ")}<input
              aria-label={t("Mot de passe pour confirmer le reset")}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={128}
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
                setPassword('');
              }}
            >
              {t("\r\n              Annuler\r\n            ")}</button>
            <button
              className="primary"
              disabled={busy || confirmation !== 'REINITIALISER' || !password}
            >
              {t("\r\n              Confirmer la remise à zéro\r\n            ")}</button>
          </div>
        </form>
      )}
    </section>
  );
}
