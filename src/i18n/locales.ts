export const LOCALES = ['fr', 'en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'claimed_locale';
export function isLocale(value: unknown): value is Locale { return LOCALES.includes(value as Locale); }
export function preferredLocale(acceptLanguage: string | null): Locale {
  const languages = (acceptLanguage || '').split(',').map((entry) => {
    const [tag, quality] = entry.trim().split(';');
    return { tag: tag.toLowerCase().split('-')[0], q: quality?.startsWith('q=') ? Number(quality.slice(2)) : 1 };
  }).filter((entry) => entry.q > 0).sort((a,b) => b.q-a.q);
  return languages.find((entry) => isLocale(entry.tag))?.tag as Locale || 'fr';
}
export function requestLocale(request: Request): Locale {
  const query = new URL(request.url).searchParams.get('lang');
  if (isLocale(query)) return query;
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)claimed_locale=([^;]+)/)?.[1];
  if (isLocale(cookie)) return cookie;
  return preferredLocale(request.headers.get('accept-language'));
}
