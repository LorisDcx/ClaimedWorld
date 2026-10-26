import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { assertSameOrigin, GameError, rateLimit, sessionUser } from '@/lib/auth';
import { run } from '@/lib/db';
import { usesPostgres } from '@/lib/storage';
import { saveCloudLogo } from '@/lib/supabase-storage';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const uid = await sessionUser();
    if (!uid) throw new GameError('Connexion requise.', 401);
    await rateLimit(`upload:${uid}`, 10, 3600000);
    if (Number(request.headers.get('content-length')) > 1500000)
      throw new GameError('Le logo doit peser moins de 1 Mo.');
    const form = await request.formData();
    const file = form.get('logo');
    if (!(file instanceof File) || file.size > 1048576 || file.size === 0)
      throw new GameError('Choisissez une image de moins de 1 Mo.');
    const bytes = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(bytes, { limitInputPixels: 16000000 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format || ''))
      throw new GameError('Seuls les logos PNG, JPEG ou WebP sont acceptés.');
    // Decode and re-encode: strip metadata, reject SVG/active content, and bound dimensions.
    const encoded = await sharp(bytes, { limitInputPixels: 16000000 })
      .rotate()
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const logoId = randomUUID();
    if (usesPostgres()) await saveCloudLogo(logoId, encoded);
    else {
      const folder = path.join(process.cwd(), 'data', 'logos');
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, `${logoId}.webp`), encoded);
    }
    await run('INSERT INTO uploads VALUES(?,?,?)', logoId, uid, Date.now());
    return NextResponse.json({ logoId });
  } catch (error) {
    if (error instanceof GameError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: 'Ce fichier image ne peut pas être traité.' },
      { status: 400 },
    );
  }
}
