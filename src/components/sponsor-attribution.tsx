'use client';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import type { Country, Sponsor } from '@/lib/types';

export default function SponsorAttribution({
  country,
  sponsor,
}: {
  country: Country;
  sponsor: Sponsor;
}) {
  let destination: URL;
  try {
    destination = new URL(sponsor.url);
  } catch {
    return null;
  }
  if (destination.protocol !== 'https:') return null;
  const host = destination.hostname.replace(/^www\./, '');
  const instagram = host === 'instagram.com' || host.endsWith('.instagram.com');
  const app = host === 'apps.apple.com' || host === 'play.google.com';
  const logo = sponsor.logo_url || (sponsor.logo_id ? `/api/media/${sponsor.logo_id}` : null);
  return (
    <aside className="sponsor-attribution" aria-label={`Sponsor de ${country.name}`}>
      <div className="sponsor-attribution-label">
        <span>PAYS SPONSORISÉ PAR</span>
        <span>{sponsor.house ? 'CAMPAGNE MAISON' : 'PUBLICITÉ'}</span>
      </div>
      <div className="sponsor-attribution-brand">
        {logo && <Image src={logo} alt="" width={42} height={36} unoptimized />}
        <div>
          <h3>{sponsor.name}</h3>
          <span>{country.name}</span>
        </div>
      </div>
      <p>{sponsor.description}</p>
      <a
        href={destination.href}
        target="_blank"
        rel="noopener noreferrer sponsored"
        aria-label={`${instagram ? 'Instagram' : app ? 'Application' : 'Site'} de ${sponsor.name} (nouvel onglet)`}
      >
        <span>{instagram ? 'Voir sur Instagram' : app ? 'Découvrir l’application' : host}</span>
        <ArrowUpRight size={15} />
      </a>
    </aside>
  );
}
