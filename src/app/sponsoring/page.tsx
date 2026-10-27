import type { Metadata } from 'next';
import Link from 'next/link';
import { OPERATOR } from '@/lib/operator';
import ThemeToggle from '@/components/theme-toggle';
import './terms.css';

export const metadata: Metadata = { title: 'Sponsoring et crédits — CLAIMED.WORLD' };
export default function SponsoringInformation() {
  return (
    <main className="sponsor-terms-page">
      <article>
        <nav aria-label="Navigation des informations sponsor">
          <Link href="/">← CLAIMED.WORLD</Link>
          <ThemeToggle />
        </nav>
        <p className="eyebrow">INFORMATIONS DU SERVICE / 27 OCTOBRE 2026</p>
        <h1>Les crédits sponsor.</h1>
        <p>
          Le jeu de conquête reste gratuit. Le sponsoring est un service publicitaire indépendant :
          il n’accorde ni Influence, ni territoire, ni avantage de combat.
        </p>
        <h2>Éditeur et assistance</h2>
        <p>
          {OPERATOR.name} — {OPERATOR.status}, {OPERATOR.country}. SIRET : {OPERATOR.siret}.
          Questions sur une commande ou un paiement :{' '}
          <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
        </p>
        <h2>Recharger et participer aux enchères</h2>
        <p>
          Un crédit sponsor correspond à 1 €. La recharge minimale est de 5 €. Le montant total est
          affiché avant confirmation sur Stripe. Il s’agit d’un achat ponctuel, sans abonnement ni
          renouvellement automatique.
        </p>
        <p>
          Un compte de jeu et un visuel approuvé sont nécessaires. Les crédits sont attribués au
          compte connecté après confirmation du paiement par Stripe. Fermer la fenêtre ou revenir
          sur le jeu ne suffit pas à confirmer un paiement.
        </p>
        <h2>Portefeuille et fonds placés</h2>
        <p>
          Le solde non engagé est conservé et n’est pas remis à zéro à la fin des saisons. Chaque
          pays possède un minimum d’enchère, affiché avant placement, à partir de 2 crédits.
        </p>
        <p>
          Les fonds placés peuvent être déplacés vers un autre pays éligible, mais ne reviennent pas
          automatiquement au portefeuille. Chaque lot expire 30 jours après son premier placement,
          même s’il est déplacé, dépassé par un autre sponsor ou encore en tête. Une recharge ne
          prolonge pas les lots déjà placés.
        </p>
        <h2>Affichage des annonces</h2>
        <p>
          Le visuel du sponsor éligible en tête est affiché dans le territoire. Une égalité conserve
          le sponsor en place. Aucun nombre de vues, de clics ou de jours en tête n’est garanti :
          une autre enchère peut remplacer le visuel. Les crédits restants peuvent alors être
          déplacés avant leur expiration.
        </p>
        <p>
          Vous devez disposer des droits sur votre visuel et votre destination. Les contenus
          illégaux, trompeurs, haineux, usurpant une identité ou contraires aux règles du jeu
          peuvent être refusés ou suspendus. Contactez l’assistance pour toute contestation.
        </p>
        <h2>Questions et remboursements</h2>
        <p>
          Les règles de déplacement et d’expiration du jeu ne suppriment pas les droits légaux
          applicables. Pour une demande de rétractation, un paiement en double, une erreur de crédit
          ou un remboursement, écrivez à <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>{' '}
          avec votre pseudonyme et la référence de paiement. Ne transmettez jamais votre numéro de
          carte.
        </p>
        <p>
          Les remboursements acceptés passent par Stripe et peuvent retirer les crédits
          correspondants du portefeuille ou des mises. Les crédits sponsor ne sont pas une monnaie
          retirable, ne produisent pas d’intérêts et ne sont pas convertibles en Influence.
        </p>
        <Link className="primary" href="/?sponsor=1">
          Accéder à mes crédits sponsor →
        </Link>
      </article>
    </main>
  );
}
