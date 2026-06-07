# TRISTAN IPTV — Transcoder

Petit service Node + ffmpeg qui transcode à la volée les flux IPTV en
**H.264 + AAC** (les codecs lisibles par tous les navigateurs et la plupart
des players).

Indispensable si tes chaînes live arrivent en **HEVC (H.265)** ou avec audio
**AC-3 / E-AC-3 / Dolby** — Chrome, Firefox et la plupart des WebView Android
les refusent.

## Déploiement Railway (recommandé)

### 1. Crée un compte Railway
[railway.app](https://railway.app) — gratuit, 5 $ de crédit / mois inclus
(largement de quoi tourner 1-2 streams en continu).

### 2. Déploie depuis ton repo GitHub

1. Dashboard Railway → **New Project** → **Deploy from GitHub repo**
2. Sélectionne `TristanIPTV`
3. Railway détecte le projet
4. Configure :
   - **Root Directory** : `transcoder`
   - **Build Command** : (auto, via Dockerfile)
   - **Start Command** : (auto, via Dockerfile CMD)

### 3. Variables d'environnement (optionnel)

Settings → Variables :

```
TRANSCODER_SECRET = uneStringAuLongAleatoire    # protège l'endpoint
UPSTREAM_UA = VLC/3.0.20 LibVLC/3.0.20         # User-Agent envoyé à l'IPTV
PORT = (auto, Railway le set)
```

### 4. Récupère ton URL

Settings → **Networking** → **Generate Domain** → tu obtiens une URL type :
```
tristan-iptv-transcoder.up.railway.app
```

### 5. Branche-le sur TRISTAN IPTV

Sur **Vercel** (TRISTAN IPTV) → Settings → Environment Variables :

```
TRANSCODER_URL = https://tristan-iptv-transcoder.up.railway.app
TRANSCODER_SECRET = (le même que côté Railway si tu l'as set)
```

→ Redeploy Vercel.

→ Dans TRISTAN IPTV → **Paramètres** → toggle **« Transcoder Live TV »** ON.

## Endpoints

### `GET /`
Health check. Retourne JSON avec uptime et sessions actives.

### `GET /transcode?url=<URL>&secret=<S>`
Démarre une session ffmpeg. Réponse = stream MPEG-TS H.264 + AAC.

### `GET /probe?url=<URL>&secret=<S>`
Inspecte les codecs du stream upstream sans transcoder.

## Coût estimé

- 1 stream H.264 → 0,3-1 vCPU continu, ~150-400 MB RAM
- Railway facture le compute réel utilisé
- Crédit gratuit 5 $/mois = ~150-200h de stream actif/mois
- Plus que largement pour usage perso (4-8h/jour)

## Limites

- ffmpeg = 1 process par stream. Si tu regardes 4 chaînes en même temps
  depuis 4 appareils différents → 4 process → besoin d'un plan Pro Railway.
- Latence ajoutée : ~3-6 secondes (acceptable pour live).
- Le transcodage perd l'audio multilangue si la source en a plusieurs
  (le service ne garde que la première piste audio).

## Hébergement alternatif

Le Dockerfile marche sur **n'importe quel host Docker** : Render, Fly.io,
DigitalOcean Apps, ton propre VPS, Raspberry Pi 4, etc. Suis la même logique
côté variables d'env.
