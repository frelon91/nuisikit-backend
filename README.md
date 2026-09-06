# NUISIKIT — Backend de paiement (Stripe)

Ce dossier contient le petit serveur qui permet au site NUISIKIT d'accepter
de vrais paiements avec plusieurs produits dans le panier en une seule commande.

## Ce que fait ce serveur

Il expose une seule route utile : `/api/create-checkout-session`.
Le site principal (nuisikit.fr) lui envoie la liste des produits du panier,
et ce serveur crée une page de paiement Stripe avec le bon total, puis renvoie
l'adresse de cette page au site pour rediriger le client.

## Étapes de déploiement (même méthode que le site principal)

### 1. Créer un nouveau dépôt GitHub
Même procédure que pour `nuisikit-site` : nouveau dépôt, nommez-le par exemple
`nuisikit-backend`, ne cochez pas "Add a README" (celui-ci existe déjà).

### 2. Uploader les fichiers de ce dossier
- `server.js`
- `package.json`
- `.gitignore`
- `README.md`

Pas de sous-dossier cette fois, tout est à la racine — l'upload sera donc plus simple que pour le site principal.

### 3. Créer une nouvelle application sur Hostinger
Dans hPanel : "Créer un nouveau site" → "Poussez votre code, nous l'hébergeons" → choisissez **"Node.js"** cette fois (pas "Application statique").

Connectez le dépôt `nuisikit-backend` via GitHub, comme précédemment.

### 4. Paramètres de build
- **Build command** : laissez vide, ou `npm install` si demandé
- **Start command** / **Run command** : `npm start` (ou `node server.js`)
- **Version de Node** : 22.x (comme pour le site principal)

### 5. Variables d'environnement — ÉTAPE IMPORTANTE
C'est ici, et **seulement ici**, que la clé secrète Stripe doit être renseignée.
Dans les paramètres de l'application Hostinger, section "Variables d'environnement",
ajoutez :

| Nom | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | votre clé secrète Stripe (commence par `sk_test_...` pour tester, puis `sk_live_...` une fois prête à encaisser réellement) |
| `SITE_URL` | `https://nuisikit.fr` |

Ne mettez **jamais** cette clé directement dans un fichier de code ou sur GitHub.

### 6. Déployer
Une fois les variables renseignées, lancez le déploiement comme pour le site principal.

## Comment vérifier que ça fonctionne

Une fois déployé, Hostinger vous donnera une adresse pour ce backend
(différente de nuisikit.fr, par exemple quelque chose comme
`nuisikit-backend-xxxx.hostinger.app` ou un sous-domaine). Ouvrez cette
adresse dans un navigateur : vous devriez voir le message
"Backend NUISIKIT en ligne." — si c'est le cas, le serveur fonctionne.

## Prochaine étape (à faire ensuite)

Le site principal (`nuisikit-site`) doit être mis à jour pour appeler cette
adresse au moment du paiement, plutôt qu'une adresse locale qui n'existe pas.
C'est une petite modification à faire dans `src/App.jsx` une fois cette adresse
connue — on la fera ensemble une fois ce backend déployé.
