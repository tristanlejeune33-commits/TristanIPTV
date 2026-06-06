# Déployer TRISTAN IPTV en ligne (Vercel + Chromecast Google TV)

Guide pas-à-pas pour passer du serveur local sur ton PC à une **URL HTTPS publique** que tu pourras lancer comme une app sur ton Chromecast with Google TV.

---

## 1. Vercel (gratuit, 5 min)

### Installation

```powershell
npm i -g vercel
```

### Connexion

```powershell
vercel login
```

Suis le lien dans ton terminal pour valider via email ou GitHub.

### Déploiement

Depuis le dossier du projet :

```powershell
cd C:\Users\trist\OneDrive\Documents\Claude\Projects\netflix
vercel
```

À la première exécution :

- **Set up and deploy** : `Y`
- **Which scope** : sélectionne ton compte perso
- **Link to existing project?** : `N`
- **What's your project's name?** : `tristan-iptv` (ou ce que tu veux)
- **In which directory is your code located?** : `./` (default)
- Vercel détecte Next.js automatiquement et déploie

À la fin tu obtiens une URL preview du type :
```
https://tristan-iptv-abc123.vercel.app
```

### Déploiement production

```powershell
vercel --prod
```

Te donne une URL stable :
```
https://tristan-iptv.vercel.app
```

C'est **celle-là** que tu utiliseras partout. Elle reste fixe entre les déploiements.

---

## 2. Sur ton Chromecast Google TV

### Installation Chrome

1. Sur la TV : Play Store → cherche **"Chrome"**
2. Installe et lance

### Accès TRISTAN IPTV

1. Dans Chrome, tape `https://tristan-iptv.vercel.app`
2. Va dans **Paramètres** (icône en haut à droite)
3. Colle ton lien M3U dans le champ
4. Clique **Charger la playlist**

### Ajout à l'écran d'accueil

1. Dans Chrome, menu **⋮** → **Ajouter à l'écran d'accueil**
2. Confirme le nom "TRISTAN IPTV"
3. Une icône apparaît sur la grille d'apps de la TV
4. Lancement direct sans interface navigateur — **plein écran**

### Alternative : TV Bro (browser optimisé télécommande)

Si Chrome rame, installe **TV Bro** depuis le Play Store. Même flux : URL → "Add to home screen".

---

## 3. Sur ton iPhone

L'URL `https://tristan-iptv.vercel.app` marche aussi depuis Safari iPhone :

1. Safari → tape l'URL
2. **Bouton Partager** (carré + flèche) → **"Sur l'écran d'accueil"**
3. Icône TRISTAN IPTV ajoutée à ton springboard iOS
4. Lancement plein écran, look natif

Plus besoin que ton PC soit allumé.

---

## 4. Limitations Vercel à connaître

### Le proxy de stream a 60s de timeout
Les routes serverless de Vercel sont limitées à **60 secondes**. Pour la lecture d'un flux **live MPEG-TS continu**, ça veut dire que la connexion sera tuée toutes les minutes.

**Conséquences pratiques** :

- **Films / séries** : marchent bien (le proxy télécharge un segment à la fois en quelques secondes)
- **Live TV** : marche **uniquement si tu désactives le proxy** (`/settings` → décoche "Faire passer les flux par le proxy")
- Si ton fournisseur IPTV nécessite le proxy pour le live (CORS / Referer), il faudra héberger le proxy ailleurs (Railway, Fly.io)

### Sauvegarde URL serveur désactivée
Sur Vercel, le filesystem n'est pas writable → le `/api/m3u-url` détecte ça et retombe sur localStorage uniquement.

**Mais** tu peux contourner ça avec la variable d'environnement `DEFAULT_M3U_URL` (voir section 4-bis ci-dessous) — chaque appareil qui ouvre le site récupère ton lien automatiquement, sans rien coller.

---

## 4-bis. Variable `DEFAULT_M3U_URL` — pré-remplir ton lien partout

Pour que **chaque appareil** (PC, iPhone, TV…) qui ouvre l'app charge ton playlist automatiquement, sans coller le lien :

### Sur Vercel

1. Dashboard Vercel → ton projet → **Settings → Environment Variables**
2. Ajoute :
   ```
   Name  : DEFAULT_M3U_URL
   Value : http://ton-fournisseur.com/get.php?username=...&password=...&type=m3u
   Scope : Production, Preview, Development (toutes)
   ```
3. Redéploie : `vercel --prod`

### En local (dev)

Crée un fichier `.env.local` à la racine du projet :

```
DEFAULT_M3U_URL=http://ton-fournisseur.com/get.php?username=...&password=...&type=m3u
```

Le `.env.local` est gitignored par défaut — ton lien ne fuite pas sur GitHub.

### Comment ça marche

- Quand un nouveau client ouvre le site, `/api/m3u-url` renvoie le `DEFAULT_M3U_URL`
- L'app le sauvegarde en localStorage et lance le chargement automatiquement
- L'utilisateur peut toujours le changer via `/settings` (override personnel)
- Si l'utilisateur efface son lien, le défaut env revient

C'est la meilleure approche pour un usage perso multi-appareils.

---

## 4-ter. Pré-chargement automatique du M3U (cron)

Le proxy `/api/m3u` est déjà mis en cache au niveau du CDN Vercel pendant 1 heure (`s-maxage=3600`). Mais le tout premier visiteur après le déploiement (ou après expiration du cache) doit attendre que le serveur télécharge le M3U depuis l'IPTV.

**Solution** : un **cron job** qui appelle `/api/cron/warm` pour pré-charger le cache à intervalles réguliers. Comme ça, n'importe quel appareil qui ouvre le site obtient le M3U **instantanément** depuis le CDN, jamais depuis l'IPTV upstream.

### Cron Vercel intégré (gratuit, daily)

Déjà configuré dans `vercel.json` :
```json
{
  "crons": [
    { "path": "/api/cron/warm", "schedule": "0 4 * * *" }
  ]
}
```

→ Chaque jour à 4h UTC (= 5h heure de Paris), Vercel appelle automatiquement `/api/cron/warm`, qui télécharge le M3U et populate le cache edge.

**Limite Hobby (gratuit)** : 1 exécution par jour max. Suffisant pour la plupart des cas.

### Cron externe plus fréquent (gratuit, hourly+)

Pour rafraîchir plus souvent que daily (utile si ta playlist change fréquemment), utilise un cron externe :

**[cron-job.org](https://cron-job.org)** (gratuit, illimité) :
1. Crée un compte
2. **Create cronjob** → URL : `https://ton-projet.vercel.app/api/cron/warm`
3. Schedule : `Every 1 hour` (ou tout autre intervalle)
4. Save

Tu peux protéger l'endpoint en définissant `CRON_SECRET` dans les env Vercel — dans ce cas le cron externe doit envoyer `Authorization: Bearer <secret>` (configurable dans cron-job.org → Advanced).

### Test manuel

Tu peux déclencher le warm manuellement depuis ton navigateur (sans secret par défaut) :
```
https://ton-projet.vercel.app/api/cron/warm
```

Réponse attendue :
```json
{
  "ok": true,
  "status": 200,
  "bytes": 8123456,
  "sizeMb": "7.75",
  "durationMs": 4521,
  "cachedAt": "2025-...",
  "note": "Cache edge Vercel rafraîchi"
}
```

Pour les visiteurs suivants, le M3U sera servi en quelques ms depuis le CDN.

---

## 5. Si tu veux le proxy live qui marche (option Railway)

Pour avoir Live TV via proxy sans limite :

1. Crée un compte sur [Railway.app](https://railway.app) (gratuit jusqu'à $5/mois de credit)
2. Connecte ton repo GitHub
3. Railway déploie comme Vercel mais sans timeout
4. Tu auras `https://tristan-iptv.up.railway.app` qui supporte le live

Vercel pour les pages statiques, Railway pour le proxy de stream. Plus tard si tu veux.

---

## 6. Mise à jour

Après modifs locales :

```powershell
git add -A
git commit -m "feat: ..."
vercel --prod
```

Ou push sur GitHub (si tu as connecté Vercel au repo) → auto-deploy.

---

## Récap des commandes

```powershell
# Premier déploiement
npm i -g vercel
vercel login
cd C:\Users\trist\OneDrive\Documents\Claude\Projects\netflix
vercel --prod

# Redéploiement après modif
vercel --prod
```

URL finale typique : `https://tristan-iptv.vercel.app`
