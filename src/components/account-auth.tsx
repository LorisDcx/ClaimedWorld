'use client';
import { useT } from '@/i18n/provider';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
type Pending = { email: string; expiresAt: number };
export default function AccountAuth({
  mode,
  color,
  colorPicker,
  onLogin,
  onComplete,
  onMode,
}: {
  mode: 'signup' | 'login' | 'verify-email';
  color: string;
  colorPicker: React.ReactNode;
  onLogin: (body: Record<string, unknown>) => Promise<boolean>;
  onComplete: () => Promise<void>;
  onMode: (mode: string) => void;
}) {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (mode === 'login') return;
    let active = true;
    void fetch('/api/account/email', { cache: 'no-store' })
      .then((r) => r.json())
      .then((result) => {
        if (active && result.pending) setPending(result.pending);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [mode]);
  async function request(url: string, body: Record<string, unknown>) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || t("Réessayez plus tard."));
    return result;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setWorking(true);
    setError('');
    setNotice('');
    try {
      if (pending) {
        await request('/api/account/email', { action: 'verify', code });
        await onComplete();
      } else if (mode === 'login') {
        if (await onLogin({ action: 'login', ...fields })) await onComplete();
      } else {
        const result = await request(mode === 'signup' ? '/api/game' : '/api/account/email', {
          action: mode === 'signup' ? 'signup' : 'send',
          ...fields,
          color,
        });
        setPending(result.pending || { email: result.email, expiresAt: result.expiresAt });
        setEmail(String(fields.email));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function resend() {
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/account/email', { action: 'resend' });
      setPending(result.pending);
      setCode('');
      setNotice(t("Un nouveau code a été envoyé. Utilisez le dernier reçu."));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <p className="modal-intro">
        {pending ? (
          <>
            {t("\r\n            Un code a été envoyé à ")}<strong>{pending.email}</strong>{t(". Saisissez-le ici pour activer\r\n            votre accès.\r\n          ")}</>
        ) : mode === 'signup' ? (
          t("Une couleur, un pseudo et une adresse vérifiée. Vos 100 Influence vous attendent après confirmation.")
        ) : mode === 'verify-email' ? (
          t("Sécurisez votre compte existant. Vos territoires, votre alliance et vos crédits sont conservés.")
        ) : (
          t("Votre communauté et vos territoires vous attendent.")
        )}
      </p>
      <form key={pending ? 'verification' : mode} onSubmit={(e) => void submit(e)}>
        {pending ? (
          <>
            <label>
              {t("\r\n              Code de vérification\r\n              ")}<input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t("000000")}
              />
            </label>
            <p className="form-note">
              {t("\r\n              Valable 10 minutes · 5 essais maximum. Pensez à vérifier les courriers indésirables.\r\n            ")}</p>
          </>
        ) : (
          <>
            {mode !== 'verify-email' && (
              <label>
                {t("\r\n                Pseudonyme\r\n                ")}<input
                  name="username"
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={24}
                  placeholder={t("Votre nom sur la carte")}
                />
              </label>
            )}
            {mode !== 'login' && (
              <label>
                {t("\r\n                Adresse e-mail\r\n                ")}<input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("vous@exemple.fr")}
                />
              </label>
            )}
            <label>
              {mode === 'verify-email' ? t("Mot de passe actuel") : t("Mot de passe")}
              <input
                name="password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={8}
                maxLength={128}
                placeholder={mode === 'signup' ? t('8 caractères minimum') : t("Votre mot de passe")}
              />
            </label>
            {mode === 'signup' && <label>{t("Votre couleur")}{colorPicker}</label>}
            {mode !== 'login' && (
              <p className="form-note">
                <Mail size={16} /> {t(" Un seul compte par personne. Les adresses temporaires sont\r\n                refusées. Votre e-mail reste privé.\r\n              ")}</p>
            )}
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        {notice && <p role="status">{t(notice)}</p>}
        <button className="primary full" disabled={working}>
          {working ? (
            <LoaderCircle size={17} className="spin" />
          ) : pending ? (
            t("Vérifier mon adresse")
          ) : mode === 'signup' ? (
            t("Créer mon compte gratuit")
          ) : mode === 'verify-email' ? (
            t("Recevoir mon code")
          ) : (
            t("Me connecter")
          )}
          <ArrowUpRight size={16} />
        </button>
      </form>
      {pending && (
        <div className="form-switch">
          <button disabled={working} onClick={() => void resend()}>
            {t("\r\n            Renvoyer un code\r\n          ")}</button>{' '}
          ·{' '}
          <button
            disabled={working}
            onClick={() => {
              setPending(null);
              setCode('');
              setError('');
            }}
          >
            {t("\r\n            Changer d’adresse ou recommencer\r\n          ")}</button>
        </div>
      )}
      {mode !== 'verify-email' && (
        <p className="form-switch">
          {mode === 'signup' ? t("Déjà dans la partie ?") : t("Pas encore de compte ?")}{' '}
          <button disabled={working} onClick={() => onMode(mode === 'signup' ? 'login' : 'signup')}>
            {mode === 'signup' ? t("Se connecter") : t("Rejoindre la conquête")}
          </button>
        </p>
      )}
      <div className="form-note">
        <ShieldCheck size={16} />
        <span>{t("La conquête est gratuite. Aucun achat ne donne d’avantage en jeu.")}</span>
      </div>
    </>
  );
}
