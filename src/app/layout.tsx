import type { Metadata } from 'next';
import './canvas.css';
import { LocaleProvider } from '@/i18n/provider';
import { serverLocale } from '@/i18n/server';
export const metadata: Metadata = {
  title: 'CLAIMED.WORLD — The world is up for grabs.',
  description:
    'Une carte. Des joueurs. Des alliances. Conquérez gratuitement, un territoire à la fois.',
  applicationName: 'CLAIMED.WORLD',
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await serverLocale();
  return (
    <html lang={locale}>
      <body><LocaleProvider initialLocale={locale}>{children}</LocaleProvider></body>
    </html>
  );
}
