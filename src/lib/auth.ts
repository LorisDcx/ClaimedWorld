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
export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const url = new URL(request.url);
  const host = request.headers.get('host');
  const allowed = new Set([url.origin, process.env.NEXT_PUBLIC_APP_URL]);
  if (host) allowed.add(`${url.protocol}//${host}`);
  if (!allowed.has(origin)) throw new GameError('Origine de la requête non autorisée.', 403);
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
