# Déploiement KeurSIBY sur cPanel

Guide complet pour déployer KeurSIBY sur un hébergement cPanel avec :

- **Frontend** statique sur `app.votre-domaine.com`
- **Backend** Node.js sur `api.app.votre-domaine.com`
- **PostgreSQL** via la base cPanel

> Guide testé et validé en production — Mai 2026

---

## Prérequis

Sur ton hébergement cPanel :

- **Setup Node.js App** disponible (Node.js 24+)
- **PostgreSQL** disponible (phpPgAdmin ou SSH)
- Deux sous-domaines créés :
  - `app.votre-domaine.com` → frontend
  - `api.app.votre-domaine.com` → backend
- Accès SSH recommandé

Sur ta machine locale :

- Node.js 20+
- npm 10+
- Le projet KeurSIBY cloné

---

## Étape 1 — Configurer le `.env.production`

Copie le fichier exemple et remplis les valeurs :

```bash
cp .env.production.example .env.production
```

Les variables clés à adapter :

```env
# Base de données cPanel
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=cpanel_user_dbname
POSTGRES_USER=cpanel_user
POSTGRES_PASSWORD=TON_MOT_DE_PASSE

# URLs publiques
VITE_API_URL=https://api.app.votre-domaine.com
VITE_WS_URL=wss://api.app.votre-domaine.com
CORS_ORIGINS=https://app.votre-domaine.com
APP_BASE_URL=https://app.votre-domaine.com

# JWT — générer avec : node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=TON_SECRET_FORT_32_CHARS_MIN

# Cookies sécurisés (HTTPS)
COOKIE_SECURE=true
COOKIE_SAMESITE=lax

# Email SMTP (serveur mail cPanel)
EMAIL_ENABLED=true
RESEND_SMTP_HOST=mail.votre-domaine.com
RESEND_SMTP_PORT=587
RESEND_SMTP_USER=support@votre-domaine.com
RESEND_SMTP_PASSWORD=TON_MOT_DE_PASSE_MAIL
EMAIL_FROM=KeurSIBY <support@votre-domaine.com>

# Désactiver les services non utilisés
AI_ENABLED=false
```

> ⚠️ Ne jamais commiter `.env.production` — il est dans `.gitignore`.

---

## Étape 2 — Builder le frontend

Le frontend doit être buildé avec les URLs de production baked dans le bundle.

```powershell
# PowerShell (Windows)
$env:VITE_API_URL="https://api.app.votre-domaine.com"
$env:VITE_WS_URL="wss://api.app.votre-domaine.com"
npx vite build
```

```bash
# Linux/Mac
VITE_API_URL=https://api.app.votre-domaine.com VITE_WS_URL=wss://api.app.votre-domaine.com npx vite build
```

> Utiliser `npx vite build` directement (pas `npm run build:client`) pour éviter les erreurs TypeScript qui bloquent le build.

Les fichiers buildés se trouvent dans `client/dist/`.

---

## Étape 3 — Builder le backend

```bash
# Builder le package partagé (requis par le server)
npm run build:shared

# Builder le serveur
npm run build:server
```

> Si des erreurs TypeScript de librairies tierces bloquent le build, `"skipLibCheck": true` est déjà configuré dans `server/tsconfig.json`.

Les fichiers compilés se trouvent dans `server/dist/`.

---

## Étape 4 — Préparer l'archive backend

```powershell
# Créer la structure deploy/
New-Item -ItemType Directory -Force -Path "deploy\server"
New-Item -ItemType Directory -Force -Path "deploy\shared"

Copy-Item -Recurse -Force "server\dist"       "deploy\server\dist"
Copy-Item -Recurse -Force "server\migrations" "deploy\server\migrations"
Copy-Item -Force "server\package.json"        "deploy\server\package.json"
Copy-Item -Recurse -Force "shared\dist"       "deploy\shared\dist"
Copy-Item -Force "shared\package.json"        "deploy\shared\package.json"
Copy-Item -Force ".env.production"            "deploy\.env"

# Générer le package.json racine SANS le script husky prepare
node scripts/make-deploy-pkg.js

# Créer les archives
Compress-Archive -Force -Path "deploy\*"      -DestinationPath "keursiby-backend.zip"
Compress-Archive -Force -Path "client\dist\*" -DestinationPath "keursiby-frontend.zip"

# Nettoyer
Remove-Item -Recurse -Force "deploy"
```

> ⚠️ Le script `make-deploy-pkg.js` supprime le script `prepare` (husky) du `package.json` — sans ça, `npm install` échoue sur le serveur avec `husky: commande introuvable`.

---

## Étape 5 — Déployer le frontend sur cPanel

1. cPanel → **File Manager**
2. Naviguer vers `public_html/app.votre-domaine.com/`
3. Supprimer les fichiers existants si nécessaire
4. **Upload** → `keursiby-frontend.zip`
5. Clic droit sur le zip → **Extract**
6. Vérifier que `index.html` est bien à la racine du dossier

---

## Étape 6 — Déployer le backend sur cPanel

### 6.1 Créer l'application Node.js

cPanel → **Setup Node.js App** → **Create Application** :

| Champ                    | Valeur                      |
| ------------------------ | --------------------------- |
| Node.js version          | **24**                      |
| Application mode         | **Production**              |
| Application root         | `apps/keursiby`             |
| Application URL          | `api.app.votre-domaine.com` |
| Application startup file | `server/dist/index.js`      |

Cliquer **Create**.

### 6.2 Uploader les fichiers

1. File Manager → naviguer vers `apps/keursiby/`
2. **Upload** → `keursiby-backend.zip`
3. Clic droit → **Extract**

Structure attendue :

```
apps/keursiby/
├── .env
├── package.json          ← sans script prepare
├── server/
│   ├── dist/index.js
│   ├── migrations/
│   └── package.json
└── shared/
    ├── dist/
    └── package.json
```

### 6.3 Installer les dépendances

**Setup Node.js App** → **Run NPM Install** échoue souvent à cause de husky ou bcrypt.

Utiliser SSH à la place :

```bash
# Installer les dépendances racine
cd ~/apps/keursiby
PATH=/opt/alt/alt-nodejs24/root/usr/bin:$PATH /opt/alt/alt-nodejs24/root/usr/bin/npm install --prefix . --omit=dev

# Installer les dépendances du server
cd ~/apps/keursiby/server
PATH=/opt/alt/alt-nodejs24/root/usr/bin:$PATH /opt/alt/alt-nodejs24/root/usr/bin/npm install --omit=dev

# Installer @aws-sdk/client-s3 (requis au runtime)
PATH=/opt/alt/alt-nodejs24/root/usr/bin:$PATH /opt/alt/alt-nodejs24/root/usr/bin/npm install @aws-sdk/client-s3 --save
```

> Sur cPanel, `node` n'est pas dans le PATH par défaut. Toujours utiliser le chemin complet `/opt/alt/alt-nodejs24/root/usr/bin/node` et préfixer avec `PATH=...`.

### 6.4 Tester le démarrage

```bash
cd ~/apps/keursiby
PATH=/opt/alt/alt-nodejs24/root/usr/bin:$PATH /opt/alt/alt-nodejs24/root/usr/bin/node server/dist/index.js
```

Le serveur doit afficher :

```json
{ "level": "info", "message": "server.started", "meta": { "port": 3001 } }
```

Arrêter avec `Ctrl+C` puis démarrer via cPanel.

### 6.5 Démarrer l'application

**Setup Node.js App** → **Start App** → vérifier le statut **Running**.

---

## Étape 7 — Initialiser la base de données

La base PostgreSQL 9.6 de cPanel ne supporte pas `uuid-ossp` ni `gen_random_uuid()`.
Utiliser le script d'export dédié qui génère un SQL compatible :

```powershell
# Sur la machine locale
$env:POSTGRES_PASSWORD="TON_MOT_DE_PASSE_LOCAL"
node scripts/export-cpanel.js
```

Cela génère `keursiby-cpanel-full.sql`. Uploader ce fichier sur le serveur puis :

```bash
# Appliquer les colonnes manquantes (première fois uniquement)
psql -U cpanel_user -d cpanel_user_dbname -h localhost -f keursiby-alter-tables.sql

# Importer le schéma + données
psql -U cpanel_user -d cpanel_user_dbname -h localhost -f keursiby-cpanel-full.sql
```

Vérifier l'import :

```bash
psql -U cpanel_user -d cpanel_user_dbname -h localhost -c \
  "SELECT 'users' as t, COUNT(*) FROM users UNION ALL SELECT 'budget_entries', COUNT(*) FROM budget_entries;"
```

---

## Étape 8 — Vérifier le déploiement

```bash
curl -sS https://api.app.votre-domaine.com/health
```

Réponse attendue :

```json
{ "status": "ok", "timestamp": "..." }
```

Ouvrir `https://app.votre-domaine.com` et se connecter.

---

## Dépannage

### `husky: commande introuvable` lors du npm install

Le `package.json` contient un script `prepare` qui appelle husky. Utiliser `scripts/make-deploy-pkg.js` pour le supprimer avant de créer l'archive.

### `Cannot find module 'ws'` ou `@aws-sdk/client-s3`

Les modules sont installés dans le virtualenv cPanel, pas dans `~/apps/keursiby`. Installer manuellement via SSH avec le chemin complet de node/npm.

### `node: Permission denied` lors du npm install

```bash
PATH=/opt/alt/alt-nodejs24/root/usr/bin:$PATH /opt/alt/alt-nodejs24/root/usr/bin/npm install ...
```

### Erreur PostgreSQL `uuid-ossp` ou `gen_random_uuid`

La base cPanel tourne sur PostgreSQL 9.6 sans ces extensions. Utiliser `scripts/export-cpanel.js` qui génère un SQL sans dépendance aux UUID natifs.

### `EXECUTE FUNCTION` non reconnu

PostgreSQL 9.6 utilise `EXECUTE PROCEDURE`. Le script `export-cpanel.js` gère ça automatiquement.

### Le frontend affiche une page blanche

- Vérifier que `index.html` est à la racine de `public_html/app.votre-domaine.com/`
- Hard refresh : `Ctrl+Shift+R`
- Vérifier la console F12 pour les erreurs réseau

### WebSocket ne se connecte pas

Certains hébergeurs cPanel bloquent les WebSockets. Contacter le support pour l'activer sur le sous-domaine API.

### Changer le mot de passe d'un utilisateur

Générer le hash sur la machine locale :

```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('NOUVEAU_MOT_DE_PASSE', 12).then(h => console.log(h));"
```

Sur le serveur via SSH, utiliser un fichier SQL pour éviter que le shell interprète les `$` du hash bcrypt :

```bash
cat > /tmp/update_pwd.sql << 'EOF'
UPDATE users SET password_hash = '$2a$12$HASH_GENERE_ICI' WHERE email = 'ton@email.com';
EOF
psql -U cpanel_user -d cpanel_user_dbname -h localhost -f /tmp/update_pwd.sql
```

Vérifier que le hash est bien enregistré (doit commencer par `$2a$12`) :

```bash
psql -U cpanel_user -d cpanel_user_dbname -h localhost -c 'SELECT LEFT(password_hash, 7) FROM users;'
```

> ⚠️ Ne jamais passer le hash directement dans la commande `-c "..."` — le shell tronque les valeurs contenant `$`.

---

## Mise à jour

```powershell
# 1. Rebuilder
npm run build:shared
npm run build:server
$env:VITE_API_URL="https://api.app.votre-domaine.com"
$env:VITE_WS_URL="wss://api.app.votre-domaine.com"
npx vite build

# 2. Recréer les archives (voir Étape 4)

# 3. Uploader et extraire sur cPanel

# 4. Redémarrer
# Setup Node.js App → Restart App
```

> Le frontend doit toujours être rebuildé si `VITE_API_URL` ou `VITE_WS_URL` changent.
