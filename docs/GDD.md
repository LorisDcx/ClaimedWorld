# CLAIMED.WORLD

### Game Design Document — V1.1

**Slogan :** The world is up for grabs.  
**Genre :** Expérience web sociale et publicitaire  
**Plateforme :** Web, ordinateur et mobile  
**Saisons :** 30 jours  
**Modèle :** Conquête gratuite + sponsoring payant

---

## 1. Concept

Claimed.world est une carte du monde interactive où les internautes peuvent conquérir des pays seuls ou en alliances.

Chaque pays peut aussi être sponsorisé par un créateur, une marque ou une communauté.

Le concept s'inspire de The Million Dollar Homepage : transformer un espace numérique limité en support publicitaire mondial, tout en y ajoutant une expérience communautaire.

**Deux règles :**

- Le contour du pays indique qui le contrôle.
- Le logo à l'intérieur indique qui le sponsorise.

Le sponsoring n'influence jamais les conquêtes.

## 2. La carte

### Apparence

- Fond blanc.
- Planisphère 2D interactif.
- Tous les pays disponibles dans les données cartographiques retenues.
- Pays remplis en noir (#111111).
- Frontières blanches.
- Pays neutres : contour blanc.
- Pays contrôlés : contour de la couleur du joueur ou de son alliance.
- Pays sponsorisés : logo publicitaire affiché à l'intérieur, dans une pastille lisible si nécessaire.

La couleur intérieure reste noire, même lorsque le pays est contrôlé.

### Interactions

**Survol :**

- Le pays s'éclaircit légèrement.
- Une animation discrète le met en évidence.
- Une infobulle affiche son nom et son propriétaire.

**Clic :**

- Ouverture de la fiche pays.
- Affichage du propriétaire, des scores d'Influence et du sponsor.
- Bouton de contribution.
- Possibilité de réserver l'emplacement publicitaire s'il est disponible.

**Navigation :**

- Zoom fluide.
- Déplacement de la carte.
- Recherche par nom.
- Compatible tactile.

### Couverture géographique

L'objectif est de représenter le maximum de pays et de territoires identifiables.

Le jeu utilisera une base cartographique cohérente, incluant les États reconnus et, lorsque les données le permettent, les territoires distincts et micro-États.

Les territoires contestés seront traités selon une politique cartographique neutre, documentée et cohérente, sans implication de reconnaissance diplomatique.

Tous les territoires jouables doivent être accessibles par recherche, même lorsque leur taille rend le clic direct impossible.

## 3. Joueurs

Les visiteurs peuvent explorer la carte sans compte.

Pour participer, ils créent un compte avec :

- Pseudonyme unique.
- Couleur personnelle.
- Avatar facultatif.
- Alliance facultative.

Chaque utilisateur possède un portefeuille d'Influence et un profil public.

Un joueur indépendant peut conquérir des pays avec sa propre couleur.

## 4. Influence

L'Influence est la monnaie gratuite du jeu.

| Action                           | Gain          |
| -------------------------------- | ------------- |
| Inscription                      | 100 Influence |
| Génération toutes les 30 minutes | 20 Influence  |
| Stock personnel de base maximum  | 160 Influence |

La recharge est automatique et continue, sans limite journalière. Les points qui dépasseraient le stock maximum sont perdus ; aucune réserve ne permet de les récupérer plus tard. Une dépense libère de la place pour les recharges suivantes, même hors ligne.

**Règles :**

- L'Influence ne peut pas être achetée.
- Elle n'a aucune valeur monétaire.
- Elle ne peut pas être échangée entre joueurs ni convertie en argent.
- Elle finance les conquêtes personnelles ou les dons définitifs à la trésorerie d'une alliance.
- Elle est réinitialisée à chaque nouvelle saison.

Aucun achat ne procure d'avantage de gameplay.

## 5. Conquête

Chaque pays possède un classement des joueurs ou alliances qui y ont investi de l'Influence.

Le camp ayant le plus d'Influence active contrôle le pays.

### Exemple

- Pink Empire : 300 points.
- Blue Team : 200 points.

Le pays possède un contour rose.

Blue Team ajoute 150 points.

- Pink Empire : 300 points.
- Blue Team : 350 points.

Le contour devient bleu.

### Règles

- Revendication initiale d'un pays neutre : 1 Influence (règle mise à jour le 26 octobre 2026).
- Les contributions restent actives 72 heures.
- Après expiration, elles disparaissent du score actif.
- Le camp avec le score actif le plus élevé contrôle le pays.
- En cas d'égalité, le propriétaire actuel conserve le pays.
- Sans aucune Influence active, le pays redevient neutre. Les échéances continuent de courir hors ligne.
- Les contributions dépensées ne sont jamais remboursées.

L'interface affiche les points nécessaires pour prendre le contrôle.

## 6. Alliances

Chaque joueur peut créer gratuitement une alliance.

### Informations

- Nom unique.
- Couleur.
- Emblème.
- Description.
- Lien d'invitation.
- Chef, généraux et membres, 12 joueurs maximum.
- But commun et liste de pays cibles.
- Trésorerie de 1 920 Influence maximum et journal des fonds versés/engagés.

Les membres donnent à la trésorerie commune. Le chef et les généraux peuvent la dépenser pour attaquer ou renforcer les pays cibles définis par le chef. Les mises collectives actives s'additionnent pour l'alliance ; chaque don consommé est attribué à son financeur pour les récompenses. Sans cible définie, les attaques collectives sont suspendues.

### Règles

- Une seule alliance par joueur.
- Le joueur peut toujours miser en son nom, même en étant membre. Le choix « En mon nom / Pour l'alliance » est explicite ; le mode personnel est libre, le mode collectif est réservé au chef et aux généraux et limité aux objectifs.
- Rejoindre une alliance nécessite de quitter la précédente.
- Après un départ volontaire : 24 heures d'attente avant de rejoindre ou créer une autre alliance.
- Le joueur peut continuer à jouer en solo pendant ce délai.
- Les contributions déjà investies restent associées à l'ancienne alliance jusqu'à leur expiration.

### Gestion du commandement

Si le chef quitte son alliance :

- Il peut désigner un successeur.
- Sinon, le rôle revient au général prioritaire.
- Sinon, au membre le plus ancien encore actif.

Si l'alliance ne possède qu'un membre, son départ entraîne sa suppression après confirmation.

Un membre expulsé n'est pas soumis au délai de changement d'alliance.

Toutes les actions importantes nécessitent une confirmation indiquant leurs conséquences.

## 7. Sponsoring

Chaque pays possède un emplacement publicitaire exclusif.

### Contenu

Le sponsor peut afficher :

- Logo.
- Nom du projet.
- Courte description.
- Lien externe.

Le logo apparaît à l'intérieur du pays, dans une pastille adaptée à la taille du territoire.

La couleur du contour ne change pas : elle appartient toujours au joueur ou à l'alliance qui contrôle le pays.

### Enchères publicitaires continues — mise à jour

Le sponsoring possède sa propre monnaie : **1 crédit sponsor = 1 €**. Le portefeuille est rechargé par Stripe et conservé sans remise à zéro de saison. Une recharge commence à 5 € ; une enchère par pays commence à 5 crédits.

Un visuel approuvé peut être utilisé sur plusieurs pays. Le sponsor qui dispose du plus haut montant actif affiche son logo. En cas d'égalité, le sponsor sortant conserve l'emplacement. Le contrôle des joueurs et des alliances reste entièrement indépendant.

Les fonds placés ne peuvent jamais revenir au portefeuille. Ils peuvent être déplacés, entièrement ou en partie, vers d'autres pays ou vers un autre visuel approuvé du même annonceur. Chaque tranche disparaît 30 jours après son premier placement. Un déplacement conserve l'échéance, y compris lors d'un partage de tranche. Une nouvelle somme ajoutée a son propre délai de 30 jours. Les crédits non engagés n'expirent pas.

Les fonds dépassés par un autre annonceur restent engagés et déplaçables. Les plus anciens sont déplacés en premier. On laisse zéro ou au moins 5 crédits à la source ; la destination atteint au moins 5 crédits. Une position passant sous ce seuil après expiration n'affiche plus de logo tant qu'elle n'est pas complétée ou regroupée.

La modération peut suspendre un visuel. Les fonds restent soumis à leur délai initial et peuvent rejoindre un autre visuel approuvé. Les crédits ne donnent aucune Influence de conquête, ne sont pas transférables entre comptes et ne disposent d'aucune conversion vers le portefeuille des joueurs.

## 8. Saisons

**Une saison dure exactement 30 jours.**

Le site affiche en permanence le temps restant.

### Pendant la saison

- Les joueurs conquièrent des territoires.
- Les alliances se disputent la carte.
- Les sponsors affichent leurs campagnes.
- Les classements évoluent en direct.

### À la fin des 30 jours

1. Les conquêtes sont figées.
2. La carte finale est enregistrée.
3. Les champions sont annoncés.
4. Les territoires redeviennent neutres.
5. Les stocks et trésoreries sont remis à zéro, puis les récompenses individuelles sont appliquées.
6. Les enchères publicitaires continuent : seuls les fonds engagés arrivant à leurs 30 jours expirent, indépendamment de la saison.
7. Une nouvelle saison commence immédiatement.

Les comptes, alliances et badges sont conservés.

### Récompenses individuelles sans cumul permanent

Les bonus, valables pour la saison suivante uniquement, atteignent au maximum +20 de stock, +2 Influence par recharge et 20 Influence de départ. Ils ne s'ajoutent jamais aux bonus des saisons antérieures.

L'utilité dépend du contrôle soutenu dans le temps, des montants réellement engagés dans des mises contrôlant un pays et de la durée de participation utile. Les dons inutilisés n'attribuent rien. Les jours-territoire sont partagés au prorata des mises : 90 % du crédit revient aux financeurs de trésorerie, 10 % au commandant. Le crédit collectif ne court que pendant les périodes d'appartenance à l'alliance. Le contrôle personnel est aussi pris en compte.

La force du bonus est le minimum de 1, jours utiles / 14, Influence utile / 1 000 et racine carrée des jours-territoire / 30. Les montants sont arrondis vers le bas. La durée utile est comptée une seule fois même si plusieurs pays sont contrôlés simultanément. Ainsi, une arrivée deux jours avant la fin donne au plus +2 de capacité, aucune hausse de recharge et 2 points de départ ; 20 Influence utiles seules ne donnent aucun de ces bonus.

### Archives

Chaque saison possède une page publique contenant :

- Carte finale.
- Alliance gagnante.
- Meilleur joueur indépendant.
- Classement final.
- Pays les plus disputés.

Un replay animé pourra être ajouté ultérieurement.

## 9. Streamers et partage

Les streamers peuvent créer une alliance et inviter gratuitement leur communauté.

### Fonctionnement

1. Le streamer crée son alliance.
2. Il partage son lien.
3. Les spectateurs rejoignent.
4. Ils récupèrent leur Influence.
5. Ils attaquent ou défendent des pays.
6. Les changements apparaissent en direct.

### Fonctionnalités sociales

- Pages publiques d'alliances.
- Liens d'invitation.
- Classement mondial.
- Journal des conquêtes.
- Partage d'un pays ou profil.
- Affichage simple compatible avec une capture OBS.

Les streamers ne peuvent pas acheter d'Influence supplémentaire.

## 10. Modération

Les contenus utilisateurs et publicitaires doivent respecter les règles du site.

### Interdictions

- Nudité explicite et pornographie.
- Contenus illégaux.
- Haine, violence et menaces.
- Harcèlement.
- Terrorisme.
- Phishing, arnaques et logiciels malveillants.
- Usurpation d'identité.
- Publicités mensongères.
- Utilisation non autorisée de marques ou d'images.

Les publicités politiques payantes sont exclues au lancement.

### Sécurité

- Modération des annonces avant publication.
- Signalement des contenus.
- Contrôle des URL.
- Détection des bots.
- Limitation du multi-compte abusif.
- Transactions d'Influence sécurisées.
- Paiements vérifiés côté serveur.
- Gestion des sanctions et contestations.

Les règles de publicité, de paiement et de données personnelles devront être adaptées aux obligations légales applicables.

## 11. Interface principale

Le site doit tenir sur une interface très simple.

**Barre supérieure :**

- Logo.
- Recherche.
- Influence.
- Collect.
- Profil.

**Centre :**

- Carte interactive plein écran.
- Contours colorés.
- Logos sponsorisés.
- Survol et zoom.

**Fiche pays :**

- Nom.
- Propriétaire.
- Scores.
- Sponsor.
- Contribute.
- Sponsor this country, si disponible.

**Menu :**

- Map.
- Alliances.
- Leaderboard.
- Sponsors.

Le design privilégie la carte. Les panneaux ne doivent jamais masquer inutilement le monde.

## 12. MVP

### Indispensable

- Carte interactive complète.
- Comptes utilisateurs.
- Profils.
- Influence gratuite.
- Conquêtes.
- Alliances et règles de changement.
- Contours colorés.
- Sponsoring fixe.
- Logos et liens modérés.
- Classement.
- Saisons de 30 jours.
- Paiements et administration.
- Protections anti-abus.

### Plus tard

- Enchères publicitaires.
- Globe 3D.
- Replays automatiques.
- Événements communautaires.
- Mode Stream avancé.
- Statistiques publicitaires enrichies.

## 13. Technologie

Stack envisagée :

- Next.js + TypeScript.
- Tailwind CSS.
- Carte SVG ou MapLibre.
- PostgreSQL.
- Supabase pour authentification et temps réel.
- Stripe pour les paiements.

La logique de conquête, les soldes d'Influence et les changements de propriété sont contrôlés côté serveur.

## 14. Progression et offensives frontalières

Les succès persistants récompensent les premières mises, les conquêtes personnelles, le contrôle continu et le financement effectivement engagé par une alliance. Les cadres d’avatar, titres et contours se débloquent sans bonus de puissance et restent acquis entre les saisons. Quatre missions personnelles demandent une heure de contrôle simultané de leurs territoires, après sélection ; une perte remet le compteur à zéro. Une mission inachevée s’arrête en fin de saison. Ces missions ne remplacent pas les cibles définies par les chefs d’alliance.

Le didacticiel est facultatif et reprenable. Il accompagne l’exploration, la première mise et le choix d’un objectif sans engager d’Influence automatiquement.

Une offensive déplace des points déjà engagés depuis un pays contrôlé vers un voisin terrestre. Le camp visé est choisi explicitement, y compris un prétendant qui n’est pas propriétaire. Les points s’annulent un pour un : envoyer 30 contre 20 détruit 40 points au total et installe 10 survivants. Les autres prétendants conservent leurs scores ; un tiers peut donc prendre la tête. Les scores d’arrivée et du départ sont recalculés immédiatement, avec conservation de la règle d’égalité favorable au propriétaire.

Les survivants conservent leurs expirations d’origine (72 heures depuis leur mise initiale) et leur attribution financière. Les déplacements ne génèrent ni monnaie, ni nouvel engagement comptabilisé dans les succès. La source peut être perdue si elle est trop affaiblie. En alliance, seuls les chefs et généraux attaquent, vers une destination autorisée par la stratégie. Les îles sans frontière terrestre restent accessibles par revendication classique. Les revendications libres permettent toujours aux indépendants et nouveaux joueurs de s’installer.

Un lien Buy Me a Coffee permet de soutenir le créateur sans acheter de crédits sponsor ou d’avantages de conquête.

## 15. Philosophie du produit

Claimed.world ne doit pas devenir un jeu de stratégie compliqué.

Pas d'armées, pas de bâtiments, pas d'inventaire, pas de système pay-to-win.

Seulement :

**Une carte. Des joueurs. Des alliances. Des pays. Des sponsors.**

Cinq actions suffisent :

**Explore · Collect · Claim · Team Up · Sponsor**

---

**CLAIMED.WORLD**

_The world is up for grabs._

**Conquer for free. Advertise to the world.**
