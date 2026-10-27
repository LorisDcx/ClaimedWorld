'use client';
import { useT } from '@/i18n/provider';
import { ArrowUpRight, Coffee } from 'lucide-react';

export default function SupportCreator() {
  const t = useT();
  return (
    <div className="creator-support">
      <Coffee size={22} strokeWidth={1.3} />
      <div>
        <h3>{t("Un café pour faire grandir le monde ?")}</h3>
        <p>
          {t("\n          Vous pouvez aussi soutenir le développement de CLAIMED.WORLD sur Buy Me a Coffee. Ce\n          soutien est indépendant des crédits sponsor et du jeu.\n        ")}</p>
        <a href="https://buymeacoffee.com/LorisDc" target="_blank" rel="noopener noreferrer">
          {t("\n          Soutenir Loris ")}<ArrowUpRight size={13} />
          <span className="sr-only"> {t(" (ouvre un nouvel onglet)")}</span>
        </a>
      </div>
    </div>
  );
}
