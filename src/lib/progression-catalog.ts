export const HOUR = 60 * 60 * 1000;

export const ACHIEVEMENTS = [
  {
    id: 'first-bid',
    name: 'Le premier pas',
    description: 'Engager votre première Influence en votre nom.',
    metric: 'spent',
    target: 1,
    reward: 'title-pioneer',
  },
  {
    id: 'first-flag',
    name: 'Votre place dans le monde',
    description: 'Contrôler un premier territoire en votre nom.',
    metric: 'conquered',
    target: 1,
    reward: 'frame-signal',
  },
  {
    id: 'five-flags',
    name: 'Sans frontières',
    description: 'Avoir contrôlé 5 territoires différents en solo.',
    metric: 'conquered',
    target: 5,
    reward: 'frame-orbit',
  },
  {
    id: 'patient',
    name: 'Tenir la ligne',
    description: 'Garder un territoire personnel pendant 24 heures sans interruption.',
    metric: 'holdHours',
    target: 24,
    reward: 'border-double',
  },
  {
    id: 'strategist',
    name: 'La force des choix',
    description: 'Engager 1 000 Influence personnelle au fil des saisons.',
    metric: 'spent',
    target: 1000,
    reward: 'title-strategist',
  },
  {
    id: 'team-player',
    name: 'L’effort collectif',
    description: 'Financer 200 Influence effectivement engagées par une alliance.',
    metric: 'funded',
    target: 200,
    reward: 'frame-collective',
  },
] as const;

export const CONTROL_OBJECTIVES = [
  {
    id: 'europe',
    name: 'Au cœur de l’Europe',
    description: 'France, Allemagne et Italie.',
    countries: ['250', '276', '380'],
    duration: HOUR,
    reward: 'title-europe',
  },
  {
    id: 'pacific',
    name: 'L’appel du Pacifique',
    description: 'Vanuatu, Fidji et îles Salomon.',
    countries: ['548', '242', '090'],
    duration: HOUR,
    reward: 'border-signal',
  },
  {
    id: 'overseas',
    name: 'Trois îles, trois histoires',
    description: 'La Réunion, Martinique et Guadeloupe.',
    countries: ['638', '474', '312'],
    duration: HOUR,
    reward: 'title-islands',
  },
  {
    id: 'mascarene',
    name: 'L’océan en partage',
    description: 'La Réunion et Maurice.',
    countries: ['638', '480'],
    duration: HOUR,
    reward: 'frame-compass',
  },
] as const;

export const COSMETICS = [
  { id: 'frame-none', slot: 'frame', name: 'Essentiel', style: 'none', requires: null },
  { id: 'frame-signal', slot: 'frame', name: 'Signal', style: 'signal', requires: 'first-flag' },
  { id: 'frame-orbit', slot: 'frame', name: 'Orbite', style: 'orbit', requires: 'five-flags' },
  {
    id: 'frame-collective',
    slot: 'frame',
    name: 'Collectif',
    style: 'collective',
    requires: 'team-player',
  },
  {
    id: 'frame-compass',
    slot: 'frame',
    name: 'Boussole',
    style: 'compass',
    requires: 'goal:mascarene',
  },
  { id: 'title-none', slot: 'title', name: 'Sans titre', style: '', requires: null },
  {
    id: 'title-pioneer',
    slot: 'title',
    name: 'Pionnier',
    style: 'Pionnier',
    requires: 'first-bid',
  },
  {
    id: 'title-strategist',
    slot: 'title',
    name: 'Stratège',
    style: 'Stratège',
    requires: 'strategist',
  },
  {
    id: 'title-europe',
    slot: 'title',
    name: 'Architecte d’Europe',
    style: 'Architecte d’Europe',
    requires: 'goal:europe',
  },
  {
    id: 'title-islands',
    slot: 'title',
    name: 'Voix des îles',
    style: 'Voix des îles',
    requires: 'goal:overseas',
  },
  { id: 'border-solid', slot: 'border', name: 'Continu', style: 'solid', requires: null },
  {
    id: 'border-double',
    slot: 'border',
    name: 'Double ligne',
    style: 'double',
    requires: 'patient',
  },
  {
    id: 'border-signal',
    slot: 'border',
    name: 'Balise',
    style: 'signal',
    requires: 'goal:pacific',
  },
] as const;

export type CosmeticSlot = 'frame' | 'title' | 'border';
export type Appearance = { frame: string; title: string; border: string };
export const DEFAULT_APPEARANCE: Appearance = { frame: 'none', title: '', border: 'solid' };

export interface Progression {
  unlocks: { id: string; unlockedAt: number }[];
  metrics: { spent: number; conquered: number; holdHours: number; funded: number };
  equipped: Record<CosmeticSlot, string>;
  appearance: Appearance;
  objective: {
    id: string;
    startedAt: number;
    heldMs: number;
    controlled: string[];
    completedAt: number | null;
  } | null;
  tutorial: { step: number; dismissed: boolean };
}

export type ControlInterval = { country_id: string; starts_at: number; ends_at: number | null };

// Intersect recorded ownership intervals, rather than relying on a browser timer.
// A lost country breaks the streak, including while the player is offline.
export function controlWindow(
  ids: readonly string[],
  periods: ControlInterval[],
  since: number,
  now: number,
  duration: number,
) {
  let windows: [number, number][] = [[since, now]];
  for (const id of ids) {
    const intervals = periods.filter((p) => p.country_id === id);
    windows = windows.flatMap(([a, b]) =>
      intervals.flatMap((p): [number, number][] => {
        const start = Math.max(a, p.starts_at),
          end = Math.min(b, p.ends_at ?? now);
        return end >= start ? [[start, end]] : [];
      }),
    );
  }
  const completed = windows.filter(([a, b]) => b - a >= duration).map(([a]) => a + duration);
  const controllingNow = ids.every((id) =>
    periods.some(
      (p) => p.country_id === id && p.starts_at <= now && (p.ends_at === null || p.ends_at > now),
    ),
  );
  return {
    heldMs: controllingNow
      ? Math.max(0, ...windows.filter(([, b]) => b === now).map(([a, b]) => b - a))
      : 0,
    completedAt: completed.length ? Math.min(...completed) : null,
  };
}
