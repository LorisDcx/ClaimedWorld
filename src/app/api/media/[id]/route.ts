import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { get, publicPlayer } from '@/lib/db';
import { sessionUser } from '@/lib/auth';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const upload = get<{ user_id: string }>('SELECT user_id FROM uploads WHERE id=?', id);
  if (!upload) return new Response(null, { status: 404 });
  const approved = get(
    "SELECT id FROM sponsors WHERE logo_id=? AND status='approved' AND payment_status='paid'",
    id,
  );
  if (!approved) {
    const uid = await sessionUser();
    if (!uid || (uid !== upload.user_id && !publicPlayer(uid)?.isAdmin))
      return new Response(null, { status: 404 });
  }
  try {
    const file = await readFile(path.join(process.cwd(), 'data', 'logos', `${id}.webp`));
    return new NextResponse(file, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': approved ? 'public, max-age=3600' : 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
