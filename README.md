# CLAIMED.WORLD

Une première version locale et jouable du [Game Design Document V1.1](docs/GDD.md).

**The world is up for grabs.**

L’interface est un canevas plein écran en noir et blanc : navigation dans le header, menus à gauche et classement compact des prétendants à droite à la sélection d’un pays. Les actions restent accessibles dans le header et dans le classement. Les couleurs sont réservées aux joueurs, aux alliances et aux contenus sponsorisés. La carte reste montée pendant la navigation ; il n’y a pas de défilement global de la page.

## Démarrer

Prérequis : **Node.js 22.13 ou plus récent**, npm, un navigateur moderne.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Ouvrir [localhost:3000](http://localhost:3000). Créer un compte depuis « Jouer gratuitement » : les 100 Influence d’inscription sont immédiatement disponibles. « Explorer un pays libre » sélectionne un premier territoire sans dépenser de points ; le bouton « Revendiquer » permet ensuite d’investir dès 1 Influence. Un clic sur la carte affiche le classement du pays sur le côté, sans infobulle ni zoom automatique. La recherche sélectionne le territoire et zoome sur son emplacement.

La base `data/claimed.sqlite` est créée automatiquement. Les données survivent aux rechargements et aux redémarrages. Les logos traités sont dans `data/logos/`. Ces fichiers et les secrets sont exclus de Git.

Le premier démarrage crée uniquement une saison vide. Aucun joueur, aucune alliance ni conquête de démonstration ne sont ajoutés. Les anciennes données de démonstration sont retirées automatiquement des installations existantes.

## Ce qui fonctionne

- Carte SVG de **285 unités de jeu**, issue de Natural Earth 1:10m, en projection cylindrique de **Miller** : planisphère rectangulaire à grille droite, recherche française/anglaise, petits territoires, zoom jusqu’à 40×, déplacement, pincement tactile et filtres. Les noms d’océans suivent la carte. Miller est un compromis visuel pour la vue mondiale, sans conservation exacte des aires ni des formes.
- Classement latéral du pays sélectionné : scores actifs, propriétaire en tête en cas d’égalité, barres de progression, Influence supplémentaire nécessaire pour passer devant et prochaine expiration. Sur mobile, le panneau se place en bas et sa liste défile.
- Les contours revendiqués se dessinent après les surfaces, avec une bande colorée de 3 pixels limitée à l’intérieur de chaque pays. Deux voisins revendiqués gardent donc chacun leur couleur côte à côte, séparée par un fin trait sombre ; les frontières neutres ne recouvrent plus les couleurs. L’épaisseur reste constante au zoom et lors de la sélection.
- Comptes par pseudonyme/mot de passe, couleur personnalisée, sessions persistantes, profil public partageable et historique personnel des contributions actives.
- Influence gratuite : recharge automatique de **20 toutes les 30 minutes en continu**, stock personnel de base plafonné à **160**, sans réserve cachée ni plafond journalier. L’excédent des recharges au plafond est perdu. Les débits sont transactionnels.
- Conquêtes individuelles ou collectives : première revendication dès **1 Influence**, mises cumulatives dès 1, expiration individuelle à 72 h, conservation du propriétaire en cas d’égalité, retour à la neutralité sans mise active. Pour dépasser un score de 1 sans mise préalable, il faut investir 2. Les expirations manquées sont traitées dans l’ordre chronologique.
- Alliances de **12 membres maximum** : objectif commun et liste de pays cibles définis par le chef, généraux nommés/rétrogradés, trésorerie commune plafonnée à **1 920**, dons définitifs, journal des opérations et suivi des fonds versés/engagés. Seuls le chef et les généraux engagent la trésorerie, uniquement sur les cibles. Le choix **« En mon nom / Pour l’alliance »** figure dans le panneau du pays. Le mode personnel reste libre pour tous. Le chef peut transmettre le commandement ; sinon un général, puis le membre le plus ancien, prend la relève. Le départ volontaire impose toujours 24 h avant une nouvelle alliance.
- Mise à jour entre navigateurs par **Server-Sent Events**, toutes les 2 secondes lorsqu’un changement apparaît. Un rafraîchissement de secours toutes les 30 secondes reste actif.
- Classements globaux, alliances et indépendants ; journal des conquêtes ; mode OBS épuré.
- Saisons de 30 jours, archivage, champions et remise à zéro des mises et trésoreries. Récompenses individuelles de participation utile : jusqu’à **+20 de capacité**, **+2 par recharge** et **20 Influence de départ**, valables une seule saison et non cumulables. Leur attribution et leur expiration sont automatiques ; les résultats figurent dans le profil et l’archive.
- Propositions de sponsoring avec nom, description, lien HTTPS, couleur et logo PNG/JPEG/WebP facultatif. Les images sont décodées, redimensionnées et réencodées en WebP, sans métadonnées. Aucun SVG utilisateur n’est accepté.
- Administration des annonces et signalements. Le logo reste privé jusqu’à validation **et paiement**. Le sponsoring ne modifie jamais les soldes ni les scores de conquête.
- Stripe Checkout et webhook signé/idempotent prêts à configurer. **Les paiements sont désactivés par défaut.**
- Deux enchères séparées dans le panneau de chaque pays : **Conquête** (Influence gratuite des joueurs) et **Sponsoring** (affichage publicitaire). Le sponsoring est continu et indépendant des saisons de jeu.
- Portefeuille sponsor persistant : **1 crédit = 1 €**, recharge minimale de 5 €, enchère minimale de **5 crédits par pays**. Les crédits non engagés n’expirent pas et le portefeuille n’est jamais remis à zéro par une saison. Les placements sont déplaçables mais ne reviennent jamais au portefeuille ; chaque tranche expire **30 jours après son premier placement**, sans prolongation au déplacement. Le plus haut montant actif d’un visuel approuvé affiche son logo ; l’égalité conserve le sponsor sortant.

## Règles précisées

Le GDD laisse quelques détails ouverts. Cette implémentation utilise les conventions suivantes :

1. Les recharges sont ancrées à l’inscription, puis au début de la saison. Chaque échéance de 30 minutes apporte 20 Influence, dans la limite de la place disponible au stock de 160. Même au plafond, les échéances sont consommées : une dépense ultérieure ne récupère jamais les anciens points perdus. Les calculs fonctionnent hors ligne.
2. Au démarrage d’une nouvelle saison, les soldes passent à zéro, puis les éventuelles récompenses individuelles sont appliquées. Un nouvel inscrit reçoit toujours 100 points. Les comptes, alliances, rôles et stratégies sont conservés ; les trésoreries repartent à zéro.
3. Si plusieurs camps à égalité n’ont pas de propriétaire sortant parmi eux, l’identifiant du camp départage de façon déterministe. Cette règle couvre notamment des expirations simultanées.
4. Une proposition publicitaire en attente bloque temporairement les nouvelles propositions sur ce pays jusqu’à son examen. L’administrateur doit examiner ou refuser ces propositions ; la libération automatique des demandes abandonnées reste à ajouter avant une ouverture commerciale.
5. Les changements de saison sont évalués lors des requêtes ou des événements serveur. Après une période sans visiteur, l’archive est calculée à la **frontière exacte** de fin de saison, et les saisons vides sont rattrapées.
   Les mises, la génération d’Influence et les saisons reposent sur des dates serveur et continuent de courir hors ligne. Au retour, les calculs rattrapent le temps écoulé. L’horloge affichée utilise l’heure réelle corrigée sur le serveur et se resynchronise au retour sur l’onglet.
6. La carte suit les unités géographiques Natural Earth, sans reconnaissance diplomatique implicite. Les divisions continentales d’un même pays restent regroupées. Les unités ultramarines nommées sont séparées : « La Réunion / France », « Martinique / France », « Guadeloupe / France », etc. Le rattachement dans le nom n’entraîne aucun partage de conquêtes ou de sponsoring. Hawaï et l’Alaska sont également séparés des États-Unis continentaux ; les atolls américains nommés ont leurs propres unités. Les archipels comme les Marshall, les Salomon et Vanuatu restent chacun une unité de jeu.

La source Natural Earth **5.1.2**, avec ses empreintes et URL, est archivée dans `scripts/geodata/manifest.json` et `natural-earth-10m.json.gz`. Les constructions sont reproductibles hors ligne. La vue d’ensemble masque les îlots minuscules ; leurs contours apparaissent en zoomant. Elle ajoute au maximum huit repères pour des pays insulaires autrement invisibles (Marshall, Micronésie, Kiribati, Tuvalu, Nauru, Palaos, Seychelles, Maldives). Les autres petits territoires reçoivent au plus un repère après sélection ou à partir du zoom régional. La recherche centre les archipels traversant l’antiméridien sur leurs îles. Les anciens identifiants nationaux sont conservés : les scores et annonces existants de la France restent sur la France métropolitaine, sans être copiés dans les nouveaux territoires ultramarins.

## Participation et récompenses

Le contrôle est mesuré dans la durée, à partir des périodes de propriété et des mises actives. Un jour-territoire est partagé entre les mises du camp propriétaire, proportionnellement à leur montant ; il n’est jamais attribué plusieurs fois. Les mises qui ne soutiennent aucun contrôle ne produisent pas de crédit.

Pour les attaques financées par la trésorerie, les fonds sont consommés dans l’ordre des dons. **90 %** du crédit va aux donateurs au prorata du financement réellement utilisé, **10 %** au commandant de l’attaque. Le crédit collectif d’une personne s’arrête pendant les périodes où elle n’est plus membre. Les dons inutilisés ne donnent aucune récompense. Le jeu personnel bénéficie du même calcul de contrôle, sans partage collectif.

La force du bonus est le minimum de trois facteurs, plafonné à 1 : jours de participation utile / 14, Influence utile / 1 000, racine carrée des jours-territoire personnels / 30. L’Influence utile est pondérée par la durée de contrôle soutenue sur les 72 h de chaque mise. Les jours utiles sont l’union des périodes concernées : contrôler plusieurs pays simultanément ne multiplie pas l’ancienneté. Les trois récompenses sont les parties entières de 20, 2 et 20 multipliées par cette force.

Ainsi, 20 Influence utiles seules ne donnent aucun bonus de puissance ; deux jours d’engagement limitent les bonus à +2 de stock, +0 par recharge et 2 points de départ, même avec beaucoup de fonds. Une saison complète sans contribution utile donne zéro. Les plafonds deviennent au maximum 180 de stock et 22 par demi-heure, pendant la saison suivante uniquement. Une absence couvrant toute cette saison ne reporte pas la récompense à une autre saison. Le plafonnement à 12 membres, la remise à zéro de la trésorerie et le partage du crédit favorisent plusieurs groupes et limitent l’avantage cumulatif des gagnants.

La migration sauvegarde la base existante dans `data/backups/before-alliance-economy-*.sqlite`, conserve les comptes et mises actives, convertit les co-chefs en généraux, plafonne les soldes à 160 et démarre le nouveau compteur de recharge. Les objectifs sont initialement vides, donc les premières attaques collectives nécessitent une stratégie. Le suivi du contrôle antérieur à la migration ne peut pas être reconstitué : les récompenses utilisent les périodes suivies depuis cette mise à jour, sans inventer d’historique.

## Administration

Configurer dans `.env.local`, **avant de redémarrer le serveur** :

```dotenv
ADMIN_USERNAME=VotreAdmin
ADMIN_PASSWORD=un-mot-de-passe-long-et-unique
```

Le mot de passe doit comporter au moins 12 caractères. Le serveur provisionne un **nouveau** compte si ce pseudonyme n’existe pas encore. Connectez-vous avec ces identifiants ; le lien « Administration » apparaît dans le pied de page. Les droits sont enregistrés dans un champ privé en base : changer de pseudonyme ne permet pas de devenir administrateur.

Si le pseudonyme existe déjà comme compte ordinaire, choisissez un autre nom pour le provisionnement. Le serveur ne transforme jamais automatiquement un compte public existant en administrateur. Après la création, retirez `ADMIN_PASSWORD` de l’environnement ; le compte persiste en base.

## Stripe

Configurer d’abord un compte **de test**, une URL d’application et un endpoint webhook :

```dotenv
NEXT_PUBLIC_APP_URL=https://votre-domaine.example
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
ENABLE_PAYMENTS=true
```

Événement à transmettre : `checkout.session.completed`, endpoint `/api/webhooks/stripe`.

Parcours : proposer un visuel → administrateur valide le contenu → « Sponsors / Mes crédits et enchères » → recharger par Stripe → webhook signé vérifie achat, utilisateur, session, montant et devise → portefeuille crédité une seule fois → engagement explicite des crédits sur un pays → affichage du plus haut montant actif. Le paiement ne donne jamais d’Influence gratuite ni de propriété de conquête.

Les recharges sont en euros, en centimes entiers côté serveur (minimum 500). Un identifiant de demande et une clé d’idempotence Stripe évitent de créer plusieurs achats pour un même essai ; les callbacks répétés n’ajoutent pas de crédits. La validité ne dépend plus de la saison : un solde chargé aujourd’hui peut être engagé plus tard. Une fois engagé, il est consommé pour le portefeuille, mais sa position géographique reste modifiable pendant exactement 30 jours. Les fonds les plus anciens sont déplacés en premier ; un transfert partiel conserve l’origine et l’échéance de chaque tranche. Au départ, on laisse zéro ou au moins 5 crédits ; la destination doit atteindre 5. Une baisse sous ce seuil après expiration retire le logo, mais les fonds encore actifs restent regroupables ou complétables. Aucun renouvellement automatique.

Le webhook a été vérifié avec des événements signés de test, y compris les doublons, montants incohérents, remboursements et événements reçus dans le désordre. **Aucun débit ni session Checkout distante n’a été créé pendant le développement.** Les remboursements confirmés par Stripe retirent les crédits correspondants du portefeuille puis des placements ; un éventuel solde à régulariser bloque les nouvelles enchères. Les contestations suspendent le compte publicitaire ; une résolution favorable le réactive. Un visuel peut être suspendu par la modération sans rendre les fonds au portefeuille : ils restent déplaçables vers un autre visuel approuvé. Les remboursements ne sont pas déclenchés par le site ; la politique commerciale, les taxes, la facturation et les tests Stripe distants restent à configurer pour une ouverture commerciale.

Configurer les événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created` et `charge.dispute.closed` sur `/api/webhooks/stripe`. Les confirmations côté navigateur ne créent jamais de crédits. Les archives de saisons concernent les conquêtes et n’archivent pas l’état de l’enchère publicitaire continue. La migration sauvegarde la base dans `data/backups/before-sponsor-auctions-*.sqlite` et ne crée aucun crédit fictif.

## Vérifications

```powershell
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Les tests navigateur utilisent Chrome installé et une base dédiée `data/test-*.sqlite`, sans toucher à la partie locale. Ils couvrent l’inscription, la conquête, la persistance, les alliances, le mobile, les droits d’accès, les logos, les dépenses concurrentes et la réception d’une conquête par un second navigateur.

Les tests du moteur couvrent les limites d’Influence, les égalités, les expirations hors ligne, les transactions, les frontières de saison, l’archivage et le webhook Stripe. Le message `ExperimentalWarning` de `node:sqlite` est normal avec Node.js 22.

Le parcours des mises teste aussi la revendication à 1, l’égalité à 1, le dépassement à 2, le classement en direct et son affichage mobile. Un test sans lecture pendant plusieurs jours vérifie les expirations horodatées.

## Progression, attaques et soutien

Le bouton **Succès & objectifs**, également accessible depuis le profil, réunit six succès persistants, quatre missions de contrôle et un vestiaire de cadres, titres et contours. Les déblocages sont calculés côté serveur et conservés entre les saisons. Les récompenses sont uniquement visuelles. Le succès collectif compte les fonds réellement engagés, pas les dons inutilisés ni la simple présence dans une alliance.

Une mission personnelle doit être sélectionnée avant de démarrer son compteur. Il faut conserver tous ses pays simultanément pendant une heure. Les périodes de propriété enregistrées permettent de valider une mission hors ligne et de détecter une perte entre deux visites. Changer de mission abandonne le compteur courant ; une nouvelle saison termine les objectifs inachevés. Les missions personnelles ne modifient pas les cibles militaires de l’alliance.

Le didacticiel accompagne l’exploration, la première mise puis le choix d’une mission. Il est facultatif, reprenable dans Progression et enregistré sur le compte (localement pour les visiteurs). Il ne dépense rien automatiquement.

L’onglet **Attaquer** d’un pays permet de déplacer l’Influence d’un territoire contrôlé partageant une frontière terrestre. Le joueur choisit un seul rival, premier au classement ou non. Envoyer 30 contre 20 retire 30 au départ, détruit 20 points de chaque camp et installe 10 survivants à l’arrivée ; les autres prétendants restent intacts. Le départ peut changer de propriétaire. Les revendications classiques restent possibles partout, notamment pour les îles et le démarrage en solo.

Les attaques sont transactionnelles et identifiées pour empêcher un double envoi lors d’une relance réseau. Les survivants gardent les échéances de leurs tranches d’origine. Les fonds, donateurs et périodes de contrôle restent traçables ; déplacer des troupes ne compte pas comme une nouvelle dépense dans les succès et les points détruits ne continuent pas à produire des récompenses de saison. Les attaques d’alliance nécessitent le rôle chef/général et une destination autorisée ; elles utilisent les points déjà déployés, sans débit de trésorerie supplémentaire. Les frontières communes proviennent des arcs topologiques Natural Earth, sans raccourci maritime.

La partie Sponsors propose aussi un lien vers [Buy Me a Coffee — LorisDc](https://buymeacoffee.com/LorisDc), indépendant du portefeuille sponsor et des scores de jeu.

## Architecture

| Zone                                     | Emplacement                                             |
| ---------------------------------------- | ------------------------------------------------------- |
| Interface, navigation et formulaires     | `src/components/game.tsx`                               |
| Carte et gestes tactiles                 | `src/components/world-map.tsx`                          |
| Styles adaptatifs                        | `src/app/canvas.css`, `src/app/forms.css`               |
| Règles pures et calculs                  | `src/lib/rules.ts`                                      |
| Schéma SQLite, saisons, scores           | `src/lib/db.ts`                                         |
| Sessions, mots de passe et limitations   | `src/lib/auth.ts`, `src/lib/password.ts`                |
| API transactionnelle du jeu              | `src/app/api/game/route.ts`                             |
| Flux temps réel                          | `src/app/api/events/route.ts`                           |
| Paiement et confirmation                 | `src/app/api/checkout/`, `src/app/api/webhooks/stripe/` |
| Logos et accès aux images                | `src/app/api/logo/`, `src/app/api/media/`               |
| Génération des tracés et drapeaux locaux | `scripts/generate-map.mjs`                              |

Stack : Next.js App Router, React, TypeScript, CSS, D3 Geo, SQLite natif de Node et Stripe. Les versions sont fixées dans `package.json` et `package-lock.json`. Les polices et drapeaux sont servis localement ; l’interface ne dépend pas d’un CDN pour les afficher.

## Mise en ligne

Cette version est un **MVP local**, pas un service public déjà déployé. Elle peut s’exécuter sur **un serveur Node persistant**, avec un volume durable pour `data/` :

```powershell
npm run build
npm start
```

Configurer `NEXT_PUBLIC_APP_URL` avec le domaine HTTPS, sauvegarder régulièrement la base et les logos, et prévoir un reverse proxy compatible SSE. SQLite convient ici à une instance unique ; les fonctions sans disque persistant ou le déploiement multi-instance nécessitent une adaptation du stockage et des transactions.

Le GDD envisage Supabase/PostgreSQL. Aucun projet Supabase n’a été créé ni modifié : l’application utilise son backend local, entièrement fonctionnel. Une migration vers Supabase demandera de remplacer le dépôt SQLite, les sessions et le transport temps réel, avec des politiques RLS adaptées.

Avant une ouverture publique : récupération/suppression de compte, modération et contestations complètes, protections anti-bots et multi-comptes avancées, gestion des campagnes abandonnées/remboursées, tests Stripe distants, conditions de vente et mentions de l’exploitant. Les limites de requêtes présentes constituent une protection de base, pas une détection avancée des bots. `TRUST_PROXY=true` ne doit être utilisé que derrière un proxy maîtrisé qui remplace les en-têtes IP clients.

## Sources et licences

- [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) : données géographiques du domaine public ; [politique de frontières contestées](https://www.naturalearthdata.com/about/disputed-boundaries-policy/).
- [Natural Earth, unités géographiques 1:10m](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-details/) : unités cartographiques, complétées par les sous-unités américaines pour Hawaï et l’Alaska ; version et sources dans `scripts/geodata/manifest.json`.
- [Projection cylindrique de Miller — PROJ](https://proj.org/en/stable/operations/projections/mill.html) : formule de projection du planisphère.
- [Country Flag Icons](https://github.com/catamphetamine/country-flag-icons) : drapeaux sous licence MIT.
- DM Sans et Manrope : polices sous SIL Open Font License, distribuées par Fontsource.
- [Documentation Next.js](https://nextjs.org/docs), [SQLite dans Node.js](https://nodejs.org/api/sqlite.html), [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create).

Les notices des ressources distribuées sont conservées dans `docs/licenses/`.
