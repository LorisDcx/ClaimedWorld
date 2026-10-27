import { cookies, headers } from 'next/headers';
import { isLocale, preferredLocale, LOCALE_COOKIE } from './locales';
export async function serverLocale() {
  const requestHeaders = await headers();
  const explicit = requestHeaders.get('x-claimed-locale');
  if (isLocale(explicit)) return explicit;
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(cookie) ? cookie : preferredLocale(requestHeaders.get('accept-language'));
}
