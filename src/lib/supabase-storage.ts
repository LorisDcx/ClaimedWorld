import { createClient } from '@supabase/supabase-js';

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Stockage Supabase non configuré.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function saveCloudLogo(id: string, bytes: Buffer) {
  const { error } = await serverClient()
    .storage.from('sponsor-logos')
    .upload(`${id}.webp`, bytes, { contentType: 'image/webp', upsert: false });
  if (error) throw new Error('Enregistrement du logo indisponible.');
}
export async function readCloudLogo(id: string) {
  const { data, error } = await serverClient().storage.from('sponsor-logos').download(`${id}.webp`);
  if (error || !data) throw new Error('Logo introuvable.');
  return Buffer.from(await data.arrayBuffer());
}
