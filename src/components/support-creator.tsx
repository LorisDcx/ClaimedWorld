import { ArrowUpRight, Coffee } from 'lucide-react';

export default function SupportCreator() {
  return (
    <div className="creator-support">
      <Coffee size={22} strokeWidth={1.3} />
      <div>
        <h3>Un café pour faire grandir le monde ?</h3>
        <p>
          Vous pouvez aussi soutenir le développement de CLAIMED.WORLD sur Buy Me a Coffee. Ce
          soutien est indépendant des crédits sponsor et du jeu.
        </p>
        <a href="https://buymeacoffee.com/LorisDc" target="_blank" rel="noopener noreferrer">
          Soutenir Loris <ArrowUpRight size={13} />
          <span className="sr-only"> (ouvre un nouvel onglet)</span>
        </a>
      </div>
    </div>
  );
}
