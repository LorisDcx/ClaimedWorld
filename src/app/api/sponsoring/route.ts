import { NextResponse } from 'next/server';
import { sessionUser } from '@/lib/auth';
import { ownSponsoring } from '@/lib/sponsoring';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  return NextResponse.json(ownSponsoring(user), { headers: { 'Cache-Control': 'no-store' } });
}
