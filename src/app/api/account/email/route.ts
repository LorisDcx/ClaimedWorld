import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  assertSameOrigin,
  checkPassword,
  createSession,
  GameError,
  rateLimit,
  readJsonBody,
  requestIp,
  sessionUser,
} from '@/lib/auth';
import { get, snapshot } from '@/lib/db';
import {
  beginEmailVerification,
  confirmEmailVerification,
  EMAIL_CHALLENGE_COOKIE,
  EMAIL_CODE_LIFETIME,
  pendingEmailVerification,
  resendEmailVerification,
} from '@/lib/email-verification';
import { notifyWorld } from '@/lib/world-events';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const uid = await sessionUser();
  const token = (await cookies()).get(EMAIL_CHALLENGE_COOKIE)?.value;
  return NextResponse.json(
    { pending: await pendingEmailVerification(token, uid) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request);
    const ip = requestIp(request);
    await rateLimit(`email-request:${ip}`, 30, 15 * 60000);
    const uid = await sessionUser();
    const jar = await cookies();
    const token = jar.get(EMAIL_CHALLENGE_COOKIE)?.value;
    if (body.action === 'send') {
      if (!uid) throw new GameError('Connectez-vous à votre compte existant.', 401);
      await rateLimit(`email-reauth:${uid}`, 5, 15 * 60000);
      const account = await get<{ password: string }>(
        'SELECT password FROM users WHERE id=? AND banned=0',
        uid,
      );
      const password = z.string().min(8).max(128).parse(body.password);
      if (!account || !checkPassword(password, account.password))
        throw new GameError('Mot de passe incorrect.', 401);
      const result = await beginEmailVerification({ email: body.email, userId: uid, ip });
      jar.set(EMAIL_CHALLENGE_COOKIE, result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: EMAIL_CODE_LIFETIME / 1000,
      });
      return NextResponse.json(
        { pending: { email: result.email, expiresAt: result.expiresAt } },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (body.action === 'resend') {
      const pending = await resendEmailVerification(token, uid, ip);
      jar.set(EMAIL_CHALLENGE_COOKIE, token!, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: EMAIL_CODE_LIFETIME / 1000,
      });
      return NextResponse.json({ pending }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body.action !== 'verify') throw new GameError('Action inconnue.');
    const userId = await confirmEmailVerification(
      token,
      z
        .string()
        .regex(/^\d{6}$/)
        .parse(body.code),
      uid,
    );
    jar.delete(EMAIL_CHALLENGE_COOKIE);
    await createSession(userId);
    await notifyWorld();
    return NextResponse.json(await snapshot(userId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status =
      error instanceof GameError ? error.status : error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      {
        error:
          error instanceof GameError
            ? error.message
            : 'Vérifiez le formulaire ou réessayez plus tard.',
      },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
