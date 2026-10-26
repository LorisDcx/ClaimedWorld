import countries from '@/data/countries.json';
import type { Sponsor } from './types';

export const HOUSE_CAMPAIGNS = [
  {
    id: 'house-cramdesk',
    name: 'CramDesk',
    description: 'Vos cours deviennent des fiches, des flashcards et des quiz.',
    url: 'https://www.cramdesk.com/',
    initials: 'CD',
    color: '#e87938',
    logo_url: '/sponsors/cramdesk.webp',
  },
  {
    id: 'house-waant',
    name: 'Waant',
    description: 'Vos envies de cadeaux, réunies au même endroit.',
    url: 'https://giftlock.vercel.app/',
    initials: 'W',
    color: '#841b3c',
    logo_url: '/sponsors/waant.webp',
  },
] as const;

// A stable shuffled selection: no changes on refresh, no invented paid bids.
const hash = (id: string) =>
  [...`claimed-house-v1:${id}`].reduce(
    (n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
const placements = countries
  .filter((c) => c.area > 0.006)
  .sort((a, b) => hash(a.id) - hash(b.id))
  .slice(0, 12);
export function houseSponsor(countryId: string): Sponsor | null {
  const index = placements.findIndex((c) => c.id === countryId);
  return index < 0
    ? null
    : {
        ...HOUSE_CAMPAIGNS[index % HOUSE_CAMPAIGNS.length],
        country_id: countryId,
        status: 'approved',
        amount: 0,
        house: true,
      };
}
