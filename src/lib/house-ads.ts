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
    logo_url: '/sponsors/waant-symbol.png',
  },
] as const;

// Explicit house placements, independent of player conquests and paid bids.
const placements: Record<string, number> = {
  '276': 0,
  '840': 0,
  '578': 1,
  '752': 1,
  '208': 1,
  '036': 1,
};
export function houseSponsor(countryId: string): Sponsor | null {
  const index = placements[countryId];
  return index === undefined
    ? null
    : {
        ...HOUSE_CAMPAIGNS[index],
        country_id: countryId,
        status: 'approved',
        amount: 0,
        house: true,
      };
}
