import countries from '@/data/countries.json';

export const SPONSOR_BASE_MINIMUM = 200;
// Editorial visibility premiums, in euros. Geographic size sets the base for
// all other territories; these are opening bids, never fixed purchase prices.
const visibility: Record<string, number> = {
  RU: 100,
  CN: 100,
  US: 100,
  CA: 80,
  BR: 80,
  AU: 80,
  FR: 60,
  DE: 60,
  GB: 60,
  JP: 60,
  IN: 60,
  IT: 40,
  ES: 40,
  KR: 40,
  MX: 35,
  ID: 35,
  TR: 30,
  SA: 30,
  NL: 30,
  CH: 30,
  NO: 25,
  SE: 25,
  PL: 25,
  ZA: 25,
  EG: 25,
  TH: 25,
  AE: 25,
  SG: 25,
  DK: 20,
  FI: 20,
  NZ: 20,
  BE: 20,
  PT: 20,
  AT: 20,
  IE: 20,
  GR: 20,
  HK: 20,
  IS: 10,
};
export const SPONSOR_MINIMUMS: Record<string, number> = Object.fromEntries(
  countries.map((country) => {
    const area = country.area;
    const size =
      area >= 0.2
        ? 50
        : area >= 0.06
          ? 25
          : area >= 0.02
            ? 15
            : area >= 0.005
              ? 10
              : area >= 0.001
                ? 5
                : 2;
    const premium = /^\d{3}$/.test(country.id) ? visibility[country.code] || 0 : 0;
    return [country.id, Math.max(size, premium) * 100];
  }),
);
export function sponsorMinimum(countryId: string): number {
  return SPONSOR_MINIMUMS[countryId] ?? SPONSOR_BASE_MINIMUM;
}
