# Revue avant lancement — 27 octobre 2026

Le jeu gratuit peut être essayé. **Le sponsoring payant réel n’est pas encore prêt à ouvrir.** Cette revue porte sur le code, les accès cloud et des vérifications ciblées ; elle ne constitue ni un test d’intrusion indépendant ni une certification de résistance à une campagne de grande ampleur.

## Vérifications et protections

- Comptes : mots de passe hachés avec scrypt, sessions aléatoires stockées sous forme de condensats, cookies HttpOnly/Secure en production et SameSite=Lax. Les nouvelles inscriptions exigent 12 caractères ; les anciens mots de passe restent compatibles.
- Actions serveur : validation des données, calcul des scores, contrôles des rôles, de l’appartenance aux alliances et de la trésorerie côté serveur. Origine des écritures contrôlée avec refus des requêtes cross-site ; le Host fourni par le client ne sert plus de liste d’autorisation.
- Les corps JSON du jeu et du checkout sont limités pendant leur lecture à 12 000 octets, même sans Content-Length. Les actions, connexions, lectures et uploads ont des limites de fréquence. Le cache public ne contient aucun compte connecté, dure une seconde et fusionne les lectures concurrentes d’une même instance.
- La remise à zéro exige le rôle administrateur, une confirmation écrite récente **et le mot de passe actuel**. Les échecs de réauthentification restent comptés même si la transaction échoue. Le reset conserve le sponsoring et reste protégé contre les répétitions de la même demande.
- Logos : décodage/réencodage d’images PNG/JPEG/WebP, dimensions et poids bornés, pas de SVG actif accepté. Fichiers Supabase privés, accès aux annonces soumis à leur statut.
- Stripe : vérification de signature, montants/devises/métadonnées contrôlés, traitement idempotent des événements et gestion des remboursements/litiges. Un événement signé provenant du mauvais environnement est désormais refusé.
- Un simple remplacement de la clé de test par une clé live ne suffit plus à ouvrir les paiements : `LIVE_PAYMENT_LAUNCH_APPROVED` doit être explicitement activé après la préparation ci-dessous. Il reste désactivé.
- Politique CSP ajoutée, avec restrictions des ressources, connexions et formulaires, interdiction des objets embarqués et des frames parentes. Elle autorise encore les scripts inline nécessaires au rendu actuel ; ce n’est pas une CSP stricte à nonce. Headers nosniff, Referrer-Policy, Permissions-Policy et X-Frame-Options présents.

## État cloud constaté

Sur le projet Supabase dédié : 33 tables du jeu protégées par RLS, aucun droit d’usage du schéma privé pour le rôle anonyme, bucket des logos privé. Seul le signal de révision du monde est public. L’audit n’a modifié ni les comptes ni la carte.

Les sondes publiques ont retourné 404 pour `.env.local` et `.git/config`, 403 pour l’administration sans session et 401 pour le portefeuille privé sans session. Aucun test de déni de service n’a été envoyé en production.

L’audit des dépendances de production n’a signalé aucune vulnérabilité connue à cette date. Cela ne démontre pas l’absence de faille dans le jeu.

## Ce qui bloque les paiements réels

1. **Compte Stripe non activé** : l’API consultée indique `charges_enabled=false`, `payouts_enabled=false`, `details_submitted=false`. L’onboarding du titulaire reste à effectuer.
2. **Argent de test à isoler** : la base partagée contient une recharge de test créditée, 15 € de solde et 5 € de mises actives. Les portefeuilles ne distinguent pas encore test/live. Il faut archiver ou isoler ce registre, avec sauvegarde et rapprochement, avant tout premier crédit réel. Aucune somme n’a été effacée ou convertie pendant cette revue.
3. Configurer les clés live et le webhook live, puis vérifier le parcours réel de paiement, livraison des crédits, répétition du webhook, remboursement et litige. Les tests locaux et les précédentes sessions Stripe test ne remplacent pas cette validation.
4. Renseigner les informations exactes de l’exploitant, le contact support, les conditions du sponsoring et les durées de conservation. Faire valider les engagements commerciaux avant encaissement.
5. Prévoir la récupération des comptes et renforcer l’accès administrateur. L’authentification actuelle est propre au jeu ; elle n’offre ni récupération par e-mail ni MFA.
6. Vérifier une restauration de sauvegarde et la capacité en charge avant une audience importante. Les limites de fréquence et le cache n’ont pas été validés à l’échelle d’une communauté de streamers.

Le choix du créateur de rester pour l’instant sur Vercel Hobby est conservé. Aucune souscription ni montée de gamme automatique n’a été réalisée. Les conditions Hobby limitent l’offre à un usage personnel non commercial ; ce point doit aussi être réglé avant exploitation commerciale.

## Validation automatisée

47 tests de domaine passent : conquêtes et expirations hors ligne, combats ciblés, trésorerie/permissions, bonus, sponsoring, paiements idempotents et remboursements, schéma PostgreSQL, contrôle d’origine, limites JSON, cache public et réauthentification administrateur. Les scénarios navigateur couvrent aussi les interfaces, le montant direct dans un pays, le thème et la visite guidée facultative après inscription.

Les tests utilisent une base SQLite isolée et une émulation PostgreSQL locale ; ils ne chargent pas la base de production. La CI vérifie également lint, types et build.

## Références officielles

- [Stripe — préparation du passage en production](https://docs.stripe.com/get-started/checklist/go-live)
- [Stripe — webhooks](https://docs.stripe.com/webhooks)
- [Vercel — conditions du plan Hobby](https://vercel.com/docs/plans/hobby)

La campagne Reddit est préparée dans `reddit-campaign.md`. Aucun post n’a été envoyé et aucun paiement réel n’a été activé par cette revue.
