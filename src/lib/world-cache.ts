import type { Snapshot } from './types';
let pending: Promise<Snapshot> | null = null;
let expiresAt = 0;
export function invalidateWorldCache() {
  pending = null;
  expiresAt = 0;
}
export function cachedAnonymousWorld(load: () => Promise<Snapshot>, now = Date.now()) {
  if (pending && now < expiresAt) return pending;
  const request = load();
  pending = request;
  expiresAt = now + 1000;
  void request.catch(() => {
    if (pending === request) invalidateWorldCache();
  });
  return request;
}
