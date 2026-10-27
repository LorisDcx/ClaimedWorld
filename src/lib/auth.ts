import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { get, run } from './db';
export { hashPassword, checkPassword } from './password';
export const SESSION_COOKIE = 'claimed_session';
export function digest(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export async function sessionUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await get<{ user_id: string }>(
    'SELECT s.user_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.banned=0',
    digest(token),
    Date.now(),
  );
  return session?.user_id || null;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const expires = Date.now() + 30 * 86400000;
  await run('INSERT INTO sessions VALUES(?,?,?)', digest(token), userId, expires);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expires),
  });
}
export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await run('DELETE FROM sessions WHERE token=?', digest(token));
  jar.delete(SESSION_COOKIE);
}
export async function requireVerifiedEmail(userId: string) {
  const account = await get('SELECT email_verified_at FROM users WHERE id=? AND banned=0', userId);
  if (!account || account.email_verified_at === null)
    throw new GameError('Vérifiez votre adresse e-mail pour participer.', 403);
}
export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function assertSameOrigin(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new GameError('Origine de la requête non autorisée.', 403);
  const origin = request.headers.get('origin');
  if (!origin) return;
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const allowed = new Set([configured ? new URL(configured).origin : new URL(request.url).origin]);
  if (process.env.NODE_ENV !== 'production') {
    const local = new URL(request.url);
    allowed.add(local.origin);
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(local.hostname))
      for (const host of ['localhost', '127.0.0.1', '0.0.0.0']) {
        const alias = new URL(local);
        alias.hostname = host;
        allowed.add(alias.origin);
      }
  }
  if (!allowed.has(origin)) throw new GameError('Origine de la requête non autorisée.', 403);
}
export function requestIp(request: Request) {
  return process.env.VERCEL === '1' || process.env.TRUST_PROXY === 'true'
    ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 128) || 'local'
    : 'local';
}
export async function readJsonBody(request: Request, maximum = 12000) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new GameError('Format non autorisé.', 415);
  if (Number(request.headers.get('content-length')) > maximum)
    throw new GameError('Requête trop volumineuse.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new GameError('Requête vide.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new GameError('Requête trop volumineuse.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const decoded = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
    throw new GameError('Un objet JSON est requis.');
  return decoded as Record<string, unknown>;
}
export async function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const row = await get<{ count: number }>(
    'INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.resets_at<=? THEN 1 ELSE rate_limits.count+1 END,resets_at=CASE WHEN rate_limits.resets_at<=? THEN ? ELSE rate_limits.resets_at END RETURNING count',
    key,
    now + windowMs,
    now,
    now,
    now + windowMs,
  );
  if (row && row.count > max)
    throw new GameError('Trop de tentatives. Réessayez dans quelques minutes.', 429);
}
