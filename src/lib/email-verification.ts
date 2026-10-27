import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { get, run, transaction } from './storage';
import { digest, GameError, hashPassword, rateLimit } from './auth';
import { emailIdentity, registrationPassword } from './email-policy';
import { emailDeliveryConfigured, sendVerificationEmail } from './email-delivery';
import { z } from 'zod';

export const EMAIL_CHALLENGE_COOKIE = 'claimed_email_challenge';
export const EMAIL_CODE_LIFETIME = 10 * 60000;
export const EMAIL_CODE_ATTEMPTS = 5;
type Challenge = {
  token_hash: string;
  email: string;
  email_key: string;
  user_id: string | null;
  username: string | null;
  password: string | null;
  color: string | null;
  code_hash: string;
  created_at: number;
  expires_at: number;
  attempts: number;
};

function validToken(token: string | undefined): token is string {
  return !!token && /^[a-f0-9]{64}$/.test(token);
}
function identity(value: unknown) {
  try {
    return emailIdentity(value);
  } catch (error) {
    throw new GameError(
      error instanceof z.ZodError
        ? 'Saisissez une adresse e-mail valide.'
        : error instanceof Error
          ? error.message
          : 'Adresse e-mail invalide.',
    );
  }
}
async function deliveryLimits(emailKey: string, ip: string) {
  await rateLimit(`email-minute:${digest(emailKey)}`, 1, 60000);
  await rateLimit(`email-hour:${digest(emailKey)}`, 3, 3600000);
  await rateLimit(`email-day:${digest(emailKey)}`, 8, 86400000);
  await rateLimit(`email-ip:${digest(ip)}`, 12, 3600000);
  await rateLimit('email-global-day', 400, 86400000);
}
function requireDelivery() {
  if (!emailDeliveryConfigured())
    throw new GameError(
      'La vérification par e-mail est momentanément indisponible. Réessayez plus tard.',
      503,
    );
}
async function deliver(email: string, code: string, tokenHash: string) {
  try {
    await sendVerificationEmail(email, code);
  } catch {
    await run('DELETE FROM email_challenges WHERE token_hash=?', tokenHash);
    throw new GameError(
      'Le code n’a pas pu être envoyé. Vérifiez votre adresse et réessayez plus tard.',
      503,
    );
  }
}

export async function beginEmailVerification(
  input: {
    email: unknown;
    ip: string;
    userId?: string;
    username?: string;
    password?: unknown;
    color?: string;
  },
  now = Date.now(),
) {
  const { email, key } = identity(input.email);
  requireDelivery();
  let password: string | null = null;
  if (!input.userId) {
    await rateLimit(`signup-ip-day:${digest(input.ip)}`, 6, 86400000);
    try {
      password = hashPassword(registrationPassword(input.password, input.username!));
    } catch {
      throw new GameError(
        'Choisissez un mot de passe de 8 caractères minimum, difficile à deviner.',
      );
    }
  }
  await deliveryLimits(key, input.ip);
  const token = randomBytes(32).toString('hex');
  const tokenHash = digest(token);
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await transaction(async () => {
    if (input.userId) {
      const account = await get(
        'SELECT id,email_verified_at FROM users WHERE id=? AND banned=0',
        input.userId,
      );
      if (!account || account.email_verified_at !== null)
        throw new GameError('Cette vérification ne peut pas être effectuée.', 409);
    } else if (await get('SELECT id FROM users WHERE lower(username)=lower(?)', input.username!))
      throw new GameError('Ce pseudonyme est déjà utilisé.', 409);
    if (await get('SELECT id FROM users WHERE email_key=?', key))
      throw new GameError(
        'Cette adresse ne peut pas être utilisée pour créer ou associer un compte. Connectez-vous à votre compte existant.',
        409,
      );
    await run('DELETE FROM email_challenges WHERE expires_at<=?', now);
    await run(
      'INSERT INTO email_challenges(token_hash,email,email_key,user_id,username,password,color,code_hash,created_at,expires_at,attempts) VALUES(?,?,?,?,?,?,?,?,?,?,0)',
      tokenHash,
      email,
      key,
      input.userId || null,
      input.username || null,
      password,
      input.color || null,
      digest(`${token}:${code}`),
      now,
      now + EMAIL_CODE_LIFETIME,
    );
  });
  await deliver(email, code, tokenHash);
  return { token, email, expiresAt: now + EMAIL_CODE_LIFETIME };
}

export async function pendingEmailVerification(
  token: string | undefined,
  userId: string | null,
  now = Date.now(),
) {
  if (!validToken(token)) return null;
  const challenge = await get<Challenge>(
    'SELECT * FROM email_challenges WHERE token_hash=? AND expires_at>? AND attempts<?',
    digest(token),
    now,
    EMAIL_CODE_ATTEMPTS,
  );
  return challenge && challenge.user_id === userId
    ? { email: challenge.email, expiresAt: challenge.expires_at }
    : null;
}

export async function resendEmailVerification(
  token: string | undefined,
  userId: string | null,
  ip: string,
  now = Date.now(),
) {
  requireDelivery();
  if (!validToken(token)) throw new GameError('Recommencez la vérification de votre adresse.');
  const challenge = await get<Challenge>(
    'SELECT * FROM email_challenges WHERE token_hash=? AND expires_at>?',
    digest(token),
    now,
  );
  if (!challenge || challenge.user_id !== userId)
    throw new GameError('Recommencez la vérification de votre adresse.');
  await deliveryLimits(challenge.email_key, ip);
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const result = await run(
    'UPDATE email_challenges SET code_hash=?,expires_at=?,attempts=0 WHERE token_hash=? AND expires_at>?',
    digest(`${token}:${code}`),
    now + EMAIL_CODE_LIFETIME,
    digest(token),
    now,
  );
  if (result.changes !== 1) throw new GameError('Recommencez la vérification de votre adresse.');
  await deliver(challenge.email, code, digest(token));
  return { email: challenge.email, expiresAt: now + EMAIL_CODE_LIFETIME };
}

export async function confirmEmailVerification(
  token: string | undefined,
  code: string,
  userId: string | null,
  now = Date.now(),
) {
  if (!validToken(token) || !/^\d{6}$/.test(code))
    throw new GameError('Saisissez le code à 6 chiffres reçu par e-mail.');
  // Persist the attempt before validation. Failed checks must not roll the counter back.
  const challenge = await get<Challenge>(
    'UPDATE email_challenges SET attempts=attempts+1 WHERE token_hash=? AND expires_at>? AND attempts<? AND (user_id=? OR (user_id IS NULL AND CAST(? AS TEXT) IS NULL)) RETURNING *',
    digest(token),
    now,
    EMAIL_CODE_ATTEMPTS,
    userId,
    userId,
  );
  if (!challenge)
    throw new GameError('Code expiré ou trop de tentatives. Demandez un nouveau code.');
  const expected = Buffer.from(challenge.code_hash, 'hex');
  const actual = Buffer.from(digest(`${token}:${code}`), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new GameError('Code incorrect. Vérifiez le dernier e-mail reçu.');
  return transaction(async () => {
    const consumed = await run(
      'DELETE FROM email_challenges WHERE token_hash=? AND code_hash=? AND expires_at>?',
      digest(token),
      challenge.code_hash,
      now,
    );
    if (consumed.changes !== 1) throw new GameError('Ce code a déjà été utilisé.');
    if (await get('SELECT id FROM users WHERE email_key=?', challenge.email_key))
      throw new GameError('Cette adresse est déjà associée à un compte.', 409);
    if (challenge.user_id) {
      const updated = await run(
        'UPDATE users SET email=?,email_key=?,email_verified_at=? WHERE id=? AND email_verified_at IS NULL AND banned=0',
        challenge.email,
        challenge.email_key,
        now,
        challenge.user_id,
      );
      if (updated.changes !== 1)
        throw new GameError('Cette vérification ne peut pas être effectuée.', 409);
      return challenge.user_id;
    }
    if (await get('SELECT id FROM users WHERE lower(username)=lower(?)', challenge.username))
      throw new GameError('Ce pseudonyme vient d’être pris. Recommencez avec un autre.', 409);
    const uid = randomUUID();
    await run(
      'INSERT INTO users(id,username,password,color,created_at,generation_anchor,email,email_key,email_verified_at) VALUES(?,?,?,?,?,?,?,?,?)',
      uid,
      challenge.username,
      challenge.password,
      challenge.color,
      now,
      now,
      challenge.email,
      challenge.email_key,
      now,
    );
    return uid;
  });
}
