import { run } from './db';
import { usesPostgres } from './storage';

export async function notifyWorld() {
  if (usesPostgres()) await run('UPDATE public.world_events SET revision=revision+1 WHERE id=1');
}
