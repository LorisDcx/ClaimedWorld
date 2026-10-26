export const MIN_CLAIM = 1;
export const CONTRIBUTION_LIFETIME = 72 * 60 * 60 * 1000;
export const DAY = 24 * 60 * 60 * 1000;
export const HALF_HOUR = 30 * 60 * 1000;
export const SEASON_LENGTH = 30 * DAY;
export const STOCK_CAP = 160;
export const GENERATION_RATE = 20;
export const ALLIANCE_LIMIT = 12;
export const TREASURY_CAP = STOCK_CAP * ALLIANCE_LIMIT;
// Missed ticks at a full stock are discarded, never banked for later spending.
export function generationSlots(joinedAt: number, now: number) {
  return Math.floor(Math.max(0, now - joinedAt) / HALF_HOUR);
}
export function nextGeneration(joinedAt: number, now: number) {
  return joinedAt + (generationSlots(joinedAt, now) + 1) * HALF_HOUR;
}
export function generatedStock(
  wallet: number,
  ticks: number,
  cap = STOCK_CAP,
  rate = GENERATION_RATE,
) {
  return Math.min(cap, wallet + Math.max(0, ticks) * rate);
}
export function chooseOwner(scores: { id: string; score: number }[], incumbent: string | null) {
  const ranked = [...scores]
    .filter((s) => s.score >= MIN_CLAIM)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (!ranked.length) return null;
  const tied = ranked.filter((s) => s.score === ranked[0].score);
  return tied.find((s) => s.id === incumbent)?.id ?? tied[0].id;
}
export function requiredInfluence(top: number, own: number, isOwner: boolean) {
  return isOwner ? 1 : Math.max(MIN_CLAIM, top - own + 1);
}
