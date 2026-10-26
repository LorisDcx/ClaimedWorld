import type { Metadata } from 'next';
import './canvas.css';
export const metadata: Metadata = {
  title: 'CLAIMED.WORLD — The world is up for grabs.',
  description:
    'Une carte. Des joueurs. Des alliances. Conquérez gratuitement, un territoire à la fois.',
  applicationName: 'CLAIMED.WORLD',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
