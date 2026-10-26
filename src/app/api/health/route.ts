import { get } from '@/lib/db';
import { usesPostgres } from '@/lib/storage';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await get('SELECT 1 AS ready');
    return Response.json({ status: 'ok', storage: usesPostgres() ? 'postgresql' : 'sqlite' });
  } catch { return Response.json({ status: 'unavailable' }, { status: 503 }); }
}
