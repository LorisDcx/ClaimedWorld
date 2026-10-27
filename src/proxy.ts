import { NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE, requestLocale } from './i18n/locales';
export function proxy(request: NextRequest) {
  const locale = requestLocale(request);
  const headers = new Headers(request.headers);
  headers.set('x-claimed-locale', locale);
  const response = NextResponse.next({ request: { headers } });
  if (request.cookies.get(LOCALE_COOKIE)?.value !== locale)
    response.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 365*86400, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:' });
  return response;
}
export const config = { matcher: ['/', '/sponsoring'] };
