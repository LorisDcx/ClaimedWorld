# Inscription et comptes vérifiés

27 octobre 2026. Le jeu conserve son authentification propre et ses sessions serveur ; Supabase héberge les tables privées, sans migration des mots de passe vers Supabase Auth. Gmail SMTP assure uniquement l’envoi des codes.

## Parcours

L’inscription exige un pseudonyme, une adresse durable et un mot de passe de 8 à 128 caractères. Les mots de passe évidents de la liste locale sont refusés ; aucun ensemble de symboles n’est imposé. Le mot de passe est dérivé avec scrypt dès la demande, jamais conservé en clair.

Une demande privée expire après 10 minutes. Un code aléatoire à six chiffres est envoyé ; son empreinte est liée à un jeton aléatoire de 256 bits placé dans un cookie HttpOnly, Secure en production et SameSite=Lax. Cinq tentatives sont possibles, y compris si les vérifications échouent. Le compte et les 100 Influence ne sont créés qu’après confirmation, dans une transaction qui consomme le code. La réponse réseau et les journaux n’exposent jamais le code.

Les comptes existants peuvent se connecter et consulter leurs données. Pour participer, ils doivent associer une adresse, confirmer leur mot de passe actuel, puis saisir le code reçu. La migration n’efface et ne fusionne aucun compte, territoire, alliance, rôle administrateur ou portefeuille. Un administrateur doit lui aussi vérifier son adresse. Les contributions existantes gardent leurs échéances normales ; la vérification ne réinitialise pas la partie.

La barrière serveur précède toutes les écritures du jeu, les uploads et la création de checkout. Les webhooks Stripe déjà signés continuent de traiter les paiements antérieurs, sans exiger une session de joueur. La lecture du portefeuille reste disponible au propriétaire connecté.

## Mesures contre les comptes multiples

- Une clé d’adresse unique en base, même face à des confirmations concurrentes. L’adresse n’est visible que dans l’état privé de son propriétaire.
- Liste locale `disposable-email-domains` 1.0.62, complétée pour les services explicitement concernés, avec refus de leurs sous-domaines. Cette liste nécessite des mises à jour ; elle n’identifie pas tout domaine temporaire futur. Source : [projet de la liste](https://github.com/ivolo/disposable-email-domains).
- Gmail et Googlemail partagent la même identité ; les points et suffixes « + » sont ignorés dans cette clé. Les suffixes « + » de quelques autres fournisseurs connus sont aussi regroupés. Les domaines personnalisés ne sont pas réécrits arbitrairement. L’envoi se fait à l’adresse effectivement saisie.
- Maximum de six demandes d’inscription par IP sur une fenêtre de 24 heures. Cela freine la création en série mais peut aussi limiter des joueurs partageant une connexion.
- Renvoi limité à un code par minute, trois par heure et huit par jour pour une même identité d’adresse. Les envois sont également limités par IP et globalement, en plus des limites de connexion existantes. Une réexpédition invalide l’ancien code.

Ces protections ne constituent pas une preuve d’unicité humaine : plusieurs vraies boîtes et plusieurs connexions permettent encore des abus. Aucun CAPTCHA, suivi d’empreinte de navigateur, contrôle téléphonique ou collecte de pièce d’identité n’a été ajouté.

## Gmail

Le secret est un mot de passe d’application Google, conservé dans les variables serveur privées, et non le mot de passe principal de la boîte. Les connexions SMTP utilisent TLS, validation de certificat et délais bornés. Le client du jeu n’a accès à aucun identifiant d’envoi. [Documentation Google](https://support.google.com/accounts/answer/185833?hl=fr), [transport Nodemailer](https://nodemailer.com/smtp).

Gmail peut refuser ou limiter des envois et leur placement en boîte de réception n’est pas garanti. La limite globale de l’application est un garde-fou interne, pas une garantie de capacité accordée par Google. Si l’envoi échoue ou si la configuration manque, l’inscription n’est pas activée et aucun stock n’est accordé.

`node scripts/check-email.mjs --save` vérifie la connexion au compte autorisé et copie uniquement les variables SMTP dans `.env.local`. `.env.mail.local` et `.env.local` sont ignorés par Git et par le déploiement des fichiers. `node scripts/sync-email-env.mjs` installe uniquement ces cinq variables dans l’environnement Vercel de production, via stdin, sans toucher à Stripe.

## Vérifications

Les tests de domaine couvrent domaines jetables, variantes, unicité, expiration, usage unique, essais persistants, renvoi et absence d’Influence avant confirmation. Les tests navigateur exécutent le vrai parcours de code et les refus des API avec une base isolée et une boîte de sortie locale. Ce transport de test est inopérant en production ou sur Vercel, même si sa variable est présente.

Les codes et demandes expirés sont purgés lors des nouvelles demandes ; aucune tâche périodique n’a été créée. La récupération de mot de passe et le changement autonome d’adresse vérifiée ne font pas partie de cette modification et restent à mettre en place.
