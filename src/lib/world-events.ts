import { run } from './db';
import { usesPostgres } from './storage';
import { invalidateWorldCache } from './world-cache';

export async function notifyWorld() {
  invalidateWorldCache();
  if (usesPostgres()) await run('UPDATE public.world_events SET revision=revision+1 WHERE id=1');
}
