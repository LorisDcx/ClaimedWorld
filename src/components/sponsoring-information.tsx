'use client';
import { useT, LanguageSwitcher } from '@/i18n/provider';
import Link from 'next/link';
import { OPERATOR } from '@/lib/operator';
import ThemeToggle from '@/components/theme-toggle';

export default function SponsoringInformation() {
  const t = useT();
  return (
    <main className="sponsor-terms-page">
      <article>
        <nav aria-label={t("Navigation des informations sponsor")}>
          <Link href="/">{t("← CLAIMED.WORLD")}</Link>
          <LanguageSwitcher />
          <ThemeToggle />
        </nav>
        <p className="eyebrow">{t("INFORMATIONS DU SERVICE / 27 OCTOBRE 2026")}</p>
        <h1>{t("Les crédits sponsor.")}</h1>
        <p>
          {t("\n          Le jeu de conquête reste gratuit. Le sponsoring est un service publicitaire indépendant :\n          il n’accorde ni Influence, ni territoire, ni avantage de combat.\n        ")}</p>
        <h2>{t("Éditeur et assistance")}</h2>
        <p>
          {OPERATOR.name} — {OPERATOR.status}, {OPERATOR.country}{t(". SIRET : ")}{OPERATOR.siret}{t(".\n          Questions sur une commande ou un paiement :")}{' '}
          <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
        </p>
        <h2>{t("Recharger et participer aux enchères")}</h2>
        <p>
          {t("\n          Un crédit sponsor correspond à 1 €. La recharge minimale est de 5 €. Le montant total est\n          affiché avant confirmation sur Stripe. Il s’agit d’un achat ponctuel, sans abonnement ni\n          renouvellement automatique.\n        ")}</p>
        <p>
          {t("\n          Un compte de jeu et un visuel approuvé sont nécessaires. Les crédits sont attribués au\n          compte connecté après confirmation du paiement par Stripe. Fermer la fenêtre ou revenir\n          sur le jeu ne suffit pas à confirmer un paiement.\n        ")}</p>
        <h2>{t("Portefeuille et fonds placés")}</h2>
        <p>
          {t("\n          Le solde non engagé est conservé et n’est pas remis à zéro à la fin des saisons. Chaque\n          pays possède un minimum d’enchère, affiché avant placement, à partir de 2 crédits.\n        ")}</p>
        <p>
          {t("\n          Les fonds placés peuvent être déplacés vers un autre pays éligible, mais ne reviennent pas\n          automatiquement au portefeuille. Chaque lot expire 30 jours après son premier placement,\n          même s’il est déplacé, dépassé par un autre sponsor ou encore en tête. Une recharge ne\n          prolonge pas les lots déjà placés.\n        ")}</p>
        <h2>{t("Affichage des annonces")}</h2>
        <p>
          {t("\n          Le visuel du sponsor éligible en tête est affiché dans le territoire. Une égalité conserve\n          le sponsor en place. Aucun nombre de vues, de clics ou de jours en tête n’est garanti :\n          une autre enchère peut remplacer le visuel. Les crédits restants peuvent alors être\n          déplacés avant leur expiration.\n        ")}</p>
        <p>
          {t("\n          Vous devez disposer des droits sur votre visuel et votre destination. Les contenus\n          illégaux, trompeurs, haineux, usurpant une identité ou contraires aux règles du jeu\n          peuvent être refusés ou suspendus. Contactez l’assistance pour toute contestation.\n        ")}</p>
        <h2>{t("Questions et remboursements")}</h2>
        <p>
          {t("\n          Les règles de déplacement et d’expiration du jeu ne suppriment pas les droits légaux\n          applicables. Pour une demande de rétractation, un paiement en double, une erreur de crédit\n          ou un remboursement, écrivez à ")}<a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>{' '}
          {t("\n          avec votre pseudonyme et la référence de paiement. Ne transmettez jamais votre numéro de\n          carte.\n        ")}</p>
        <p>
          {t("\n          Les remboursements acceptés passent par Stripe et peuvent retirer les crédits\n          correspondants du portefeuille ou des mises. Les crédits sponsor ne sont pas une monnaie\n          retirable, ne produisent pas d’intérêts et ne sont pas convertibles en Influence.\n        ")}</p>
        <Link className="primary" href="/?sponsor=1">
          {t("\n          Accéder à mes crédits sponsor →\n        ")}</Link>
      </article>
    </main>
  );
}
