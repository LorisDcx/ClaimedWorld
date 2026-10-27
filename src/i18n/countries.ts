import type { Locale } from './locales';

type CountryLabel = { name: string; englishName?: string; code?: string };
const parentNames: Record<string, [string, string]> = {
  France: ['France', 'Francia'],
  Portugal: ['Portugal', 'Portugal'],
  'Royaume-Uni': ['United Kingdom', 'Reino Unido'],
  'États-Unis': ['United States', 'Estados Unidos'],
  Danemark: ['Denmark', 'Dinamarca'],
  Finlande: ['Finland', 'Finlandia'],
  Norvège: ['Norway', 'Noruega'],
  'Pays-Bas': ['Netherlands', 'Países Bajos'],
  'Nouvelle-Zélande': ['New Zealand', 'Nueva Zelanda'],
  Australie: ['Australia', 'Australia'],
  Espagne: ['Spain', 'España'],
};
const spanishOverseas: Record<string, string> = {
  Azores: 'Azores', Réunion: 'Reunión', 'Reunion': 'Reunión', Martinique: 'Martinica',
  Guadeloupe: 'Guadalupe', 'French Guiana': 'Guayana Francesa',
  'French Polynesia': 'Polinesia Francesa', 'New Caledonia': 'Nueva Caledonia',
  'Saint Pierre and Miquelon': 'San Pedro y Miquelón',
  'Falkland Islands': 'Islas Malvinas',
};
export function countryLabel(country: CountryLabel, locale: Locale): string {
  if (locale === 'fr') return country.name;
  const [base, ...parent] = country.name.split(/\s+\/\s+/);
  if (parent.length) {
    const root = country.englishName || base;
    const suffix = parent.join(' / ');
    const localizedRoot = locale === 'es' ? (spanishOverseas[root] || root) : root;
    const parentLabel = parentNames[suffix]?.[locale === 'en' ? 0 : 1] || suffix;
    return `${localizedRoot} / ${parentLabel}`;
  }
  if (locale === 'en') return country.englishName || country.name;
  if (country.code && /^[A-Z]{2}$/.test(country.code)) {
    try {
      const name = new Intl.DisplayNames(['es'], { type: 'region' }).of(country.code);
      if (name && name !== country.code) return name;
    } catch { /* Browser without Intl.DisplayNames */ }
  }
  return spanishOverseas[country.englishName || ''] || country.englishName || country.name;
}
