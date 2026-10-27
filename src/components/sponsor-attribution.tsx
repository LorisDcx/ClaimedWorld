'use client';
import { countryLabel } from '@/i18n/countries';
import { useT, useLocale } from '@/i18n/provider';

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
  const t = useT();
  const locale = useLocale();
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
    <aside className="sponsor-attribution" aria-label={t("Sponsor de {0}", [country.name])}>
      <div className="sponsor-attribution-label">
        <span>{t("PAYS SPONSORISÉ PAR")}</span>
        <span>{sponsor.house ? t("CAMPAGNE MAISON") : t("PUBLICITÉ")}</span>
      </div>
      <div className="sponsor-attribution-brand">
        {logo && <Image src={logo} alt={t("")} width={42} height={36} unoptimized />}
        <div>
          <h3>{sponsor.name}</h3>
          <span>{countryLabel(country, locale)}</span>
        </div>
      </div>
      <p>{sponsor.description}</p>
      <a
        href={destination.href}
        target="_blank"
        rel="noopener noreferrer sponsored"
        aria-label={t("{0} de {1} (nouvel onglet)", [instagram ? 'Instagram' : app ? 'Application' : 'Site', sponsor.name])}
      >
        <span>{instagram ? t("Voir sur Instagram") : app ? t("Découvrir l’application") : host}</span>
        <ArrowUpRight size={15} />
      </a>
    </aside>
  );
}
