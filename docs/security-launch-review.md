# Revue avant lancement — 27 octobre 2026

Le jeu gratuit est disponible. La configuration des recharges sponsor passe sur Stripe réel à la demande de l’exploitant. **Cette mise en service technique ne confirme pas que les mentions professionnelles sont complètes** : une domiciliation professionnelle et un numéro de contact restent à renseigner. L’adresse personnelle de l’exploitant n’est pas publiée. Cette revue porte sur le code, les accès cloud et des vérifications ciblées ; elle ne constitue ni un test d’intrusion indépendant ni une certification de résistance à une campagne de grande ampleur.

## Vérifications et protections

- Comptes : mots de passe hachés avec scrypt, sessions aléatoires stockées sous forme de condensats, cookies HttpOnly/Secure en production et SameSite=Lax. Les nouvelles inscriptions exigent 8 caractères et une adresse e-mail vérifiée avant création du compte ; les mots de passe évidents sont refusés. Les anciens mots de passe restent compatibles.
- Actions serveur : validation des données, calcul des scores, contrôles des rôles, de l’appartenance aux alliances et de la trésorerie côté serveur. Origine des écritures contrôlée avec refus des requêtes cross-site ; le Host fourni par le client ne sert plus de liste d’autorisation.
- Les corps JSON du jeu et du checkout sont limités pendant leur lecture à 12 000 octets, même sans Content-Length. Les actions, connexions, lectures et uploads ont des limites de fréquence. Le cache public ne contient aucun compte connecté, dure une seconde et fusionne les lectures concurrentes d’une même instance.
- La remise à zéro exige le rôle administrateur, une confirmation écrite récente **et le mot de passe actuel**. Les échecs de réauthentification restent comptés même si la transaction échoue. Le reset conserve le sponsoring et reste protégé contre les répétitions de la même demande.
- Logos : décodage/réencodage d’images PNG/JPEG/WebP, dimensions et poids bornés, pas de SVG actif accepté. Fichiers Supabase privés, accès aux annonces soumis à leur statut.
- Stripe : vérification de signature, montants/devises/métadonnées contrôlés, traitement idempotent des événements et gestion des remboursements/litiges. Un événement signé provenant du mauvais environnement est désormais refusé.
- Un simple remplacement de la clé de test par une clé live ne suffit pas à ouvrir les paiements : `LIVE_PAYMENT_LAUNCH_APPROVED` doit être explicitement activé. Les clés réelles et ce paramètre ont été préparés pour le déploiement de production demandé par l’exploitant.
- Politique CSP ajoutée, avec restrictions des ressources, connexions et formulaires, interdiction des objets embarqués et des frames parentes. Elle autorise encore les scripts inline nécessaires au rendu actuel ; ce n’est pas une CSP stricte à nonce. Headers nosniff, Referrer-Policy, Permissions-Policy et X-Frame-Options présents.

## État cloud constaté

Sur le projet Supabase dédié : les tables du jeu sont protégées par RLS, aucun droit d’usage du schéma privé pour le rôle anonyme, bucket des logos privé. Seul le signal de révision du monde est public. L’audit n’a modifié ni les comptes ni la carte.

La préparation du passage en production ajoute huit tables financières privées, vides et protégées par RLS, soit 41 tables protégées avant la migration e-mail, qui porte ce total à 42. Les tables historiques restent le registre de test. Le serveur sélectionne les tables financières réelles uniquement à partir d’une clé Stripe live ; une donnée envoyée par le client ne peut pas choisir l’environnement. Comptes et visuels restent partagés. Soldes, recharges, mises, propriétaires publicitaires, horloges, historiques, événements et litiges sont distincts. Aucune donnée de test n’est copiée ou convertie en euros réels.

Les sondes publiques ont retourné 404 pour `.env.local` et `.git/config`, 403 pour l’administration sans session et 401 pour le portefeuille privé sans session. Aucun test de déni de service n’a été envoyé en production.

L’audit des dépendances de production n’a signalé aucune vulnérabilité connue à cette date. Cela ne démontre pas l’absence de faille dans le jeu.

## État du passage sur Stripe réel

1. **Compte réel vérifié** : la clé fournie est une clé live. Stripe confirme `charges_enabled=true`, `payouts_enabled=true`, `details_submitted=true`. Aucun secret n’est publié dans le dépôt.
2. **Isolation des fonds préparée** : les crédits fictifs sont conservés dans les tables historiques. Le registre live démarre vide et n’utilise ni leurs soldes ni leurs mises. Les tests couvrent aussi l’isolation des remboursements, litiges et identifiants d’événements identiques entre environnements. Cette préparation ne suffit pas à activer Stripe.
3. Le webhook live dédié utilise la version d’API du SDK, `2026-09-30.endive`, et les cinq événements de paiement/remboursement/litige traités par l’application. La création d’un checkout live de 5 € a été vérifiée ; cette session a été immédiatement expirée, sans paiement, sans crédit de portefeuille et sans remise d’un lien de paiement générique. Les simulations de paiement/remboursement utilisent le mode test, conformément aux consignes Stripe. Aucune transaction réelle de client n’a encore validé la livraison du prestataire de bout en bout ; ne pas présenter la création d’une session ou un test de signature comme une vente réelle réussie.
4. L’exploitant a fourni les informations publiques suivantes : Loris Ducroux, entrepreneur individuel en France, SIRET `92017831600021`, contact `lorisdcx.pro@gmail.com`. Elles figurent dans les écrans d’information et de sponsoring. Il demande de ne pas publier son adresse personnelle. Une domiciliation professionnelle et un numéro de contact restent nécessaires pour compléter les mentions ; les CGV complètes, les durées de conservation et les procédures commerciales restent à finaliser. La page `/sponsoring` explique le fonctionnement du service et les demandes de remboursement, sans certifier une conformité juridique complète.
5. Prévoir la récupération des comptes et renforcer l’accès administrateur. L’authentification actuelle est propre au jeu ; elle n’offre ni récupération par e-mail ni MFA.
6. Vérifier une restauration de sauvegarde et la capacité en charge avant une audience importante. Les limites de fréquence et le cache n’ont pas été validés à l’échelle d’une communauté de streamers.

Le choix du créateur de rester pour l’instant sur Vercel Hobby est conservé. Aucune souscription ni montée de gamme automatique n’a été réalisée. Les conditions Hobby limitent l’offre à un usage personnel non commercial ; ce point doit aussi être réglé avant exploitation commerciale.

## Validation automatisée

61 tests de domaine passent : conquêtes et expirations hors ligne, combats ciblés, trésorerie/permissions, bonus, sponsoring, paiements idempotents et remboursements, schéma PostgreSQL, séparation test/live, contrôle d’origine, limites JSON, cache public et réauthentification administrateur. Les scénarios navigateur couvrent aussi les interfaces, le montant direct dans un pays, le thème et la visite guidée facultative après inscription.

`node scripts/check-live-payments.mjs` vérifie sans mutation le mode configuré, les capacités du compte Stripe, les tables privées et l’enregistrement du webhook live. La présence du secret est contrôlée, mais seule une validation complète auprès de Stripe confirme la livraison réelle des événements et le rapprochement des fonds. Ce script n’ouvre jamais les paiements et ne débite aucune carte.

Les tests utilisent une base SQLite isolée et une émulation PostgreSQL locale ; ils ne chargent pas la base de production. La CI vérifie également lint, types et build.

## Références officielles

- [Stripe — préparation du passage en production](https://docs.stripe.com/get-started/checklist/go-live)
- [Stripe — webhooks](https://docs.stripe.com/webhooks)
- [Vercel — conditions du plan Hobby](https://vercel.com/docs/plans/hobby)

La campagne Reddit et ses liens sont consignés dans reddit-campaign.md : deux invitations à tester gratuitement ont été publiées le 27 octobre 2026, sur r/playmygame et r/Entreprenariat. Aucune carte bancaire débitée par cette campagne. L’entrée `/?sponsor=1` ouvre le portefeuille du compte connecté, ou l’inscription puis ce portefeuille, sans créer de checkout tant que l’utilisateur ne valide pas une recharge.

## Vérification e-mail et limitation des comptes multiples

Le parcours et ses limites sont détaillés dans [email-account-security.md](email-account-security.md). La migration additive est appliquée : adresse privée unique, horodatage de validation et demandes de code protégées par RLS. Aucun compte, territoire, rôle ou crédit existant n’a été supprimé. Gmail SMTP a accepté la vérification de connexion avec le mot de passe d’application fourni ; les variables sont chiffrées dans Vercel.

Les anciens comptes doivent confirmer leur mot de passe et leur adresse pour effectuer des actions. Le serveur refuse les écritures de jeu, les uploads et la création de checkout tant que l’adresse n’est pas vérifiée. Les webhooks financiers déjà signés continuent de fonctionner. La création d’un nouveau compte ne donne aucune Influence avant validation. La liste des domaines jetables, la normalisation des variantes Gmail, les limites d’inscription et d’envoi et les cinq essais maximum par code réduisent les abus ; plusieurs vraies boîtes et connexions peuvent toujours contourner une partie de ces protections.

Les 21 scénarios navigateur ont été validés (20 dans la suite complète, puis le parcours historique d’inscription mis à jour et rejoué). La vérification PostgreSQL exécute aussi une vraie confirmation de code dans la base de contrat isolée. Les transports de test ne fonctionnent ni en production ni sur Vercel. La récupération de compte par e-mail reste à développer.
