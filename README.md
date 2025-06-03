# 🌍 ClaimedWorld - Carte du Monde Enchères

Une application web interactive où les utilisateurs peuvent enchérir pour "posséder" virtuellement des pays sur une carte du monde.

## 🚀 Fonctionnalités

- Carte interactive du monde en SVG
- Enchères progressives sur chaque pays
- Système de surenchère (+1 € min, enchère libre possible)
- Authentification par magic link via Supabase
- Intégration Stripe Checkout pour paiements
- Classement global (top enchérisseurs) et par pays
- Personnalisation du message et de la couleur pour chaque pays possédé

## 🛠️ Technologies utilisées

- **Frontend**: React.js, Tailwind CSS
- **Backend & DB**: Supabase (PostgreSQL, Auth, Storage)
- **Paiements**: Stripe Checkout
- **Déploiement**: Netlify

## 📋 Prérequis

- Node.js et NPM installés
- Compte Supabase
- Compte Stripe
- Compte Netlify (pour le déploiement)

## ⚙️ Installation et configuration

1. **Cloner le dépôt**

```bash
git clone <url-du-repo>
cd claimed-world
```

2. **Installer les dépendances**

```bash
npm install
```

3. **Configurer les variables d'environnement**

Créez un fichier `.env` à la racine du projet avec les informations suivantes:

```
REACT_APP_SUPABASE_URL=your_supabase_url_here
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key_here
REACT_APP_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key_here
```

4. **Configurer Supabase**

- Créez un nouveau projet sur [Supabase](https://supabase.com)
- Exécutez le script SQL dans `supabase/schema.sql` dans l'éditeur SQL de Supabase
- Activez l'authentification par email (magic link) dans les paramètres d'authentification

5. **Configurer Stripe**

- Créez un compte sur [Stripe](https://stripe.com)
- Obtenez votre clé API publique et ajoutez-la dans le fichier `.env`
- Configurez un webhook pour les événements `checkout.session.completed` pointant vers votre fonction Supabase

6. **Déployer les fonctions Edge Supabase**

```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
```

## 🚀 Lancement de l'application en local

```bash
npm start
```

L'application sera accessible à l'adresse [http://localhost:3000](http://localhost:3000).

## 📦 Déploiement

### Déploiement sur Netlify

1. Connectez votre dépôt GitHub à Netlify
2. Configurez les variables d'environnement dans les paramètres de build
3. Déployez avec les paramètres du fichier `netlify.toml`

## 📝 Structure du projet

```
claimed-world/
├── public/
├── src/
│   ├── assets/
│   │   └── world-map.svg
│   ├── components/
│   │   ├── BidPanel.js
│   │   ├── CountryRanking.js
│   │   ├── Footer.js
│   │   ├── GlobalRanking.js
│   │   ├── Header.js
│   │   └── WorldMap.js
│   ├── pages/
│   │   ├── Home.js
│   │   ├── Login.js
│   │   ├── NotFound.js
│   │   └── UserProfile.js
│   ├── utils/
│   ├── App.js
│   ├── index.js
│   └── supabaseClient.js
├── supabase/
│   ├── schema.sql
│   └── functions/
│       ├── create-checkout-session/
│       │   └── index.ts
│       └── stripe-webhook/
│           └── index.ts
├── .env
├── package.json
└── README.md
```

## 🤝 Contribuer

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou à soumettre une pull request.

## 📄 Licence

Ce projet est sous licence MIT.
