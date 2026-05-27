# Netflix — IPTV M3U Player

Lecteur M3U / IPTV avec une interface inspirée de Netflix.

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind v4** + design system custom dark mode
- **hls.js** pour la lecture des flux HLS (`.m3u8`)
- **Framer Motion** pour les micro-interactions
- **Zustand** + persist localStorage pour les favoris / historique
- **lucide-react** pour les icônes

## Fonctionnalités

- 📺 Parser M3U complet (EXTINF, tvg-logo, group-title, etc.)
- 🎬 Interface Netflix-like : hero featured, rails horizontaux par catégorie
- ❤️ Favoris persistés en local
- ⏯️ "Continuer à regarder" (30 dernières chaînes)
- 🔎 Recherche multi-mots dans nom + catégorie + pays
- 🗂️ Page catégorie pour explorer toutes les chaînes d'un groupe
- ▶️ Player HLS plein écran avec contrôles custom + récupération d'erreur
- 🔧 Page Settings pour coller / changer le lien M3U
- 🛡️ Proxy serveur (`/api/m3u`) pour contourner CORS des fournisseurs

## Démarrage

```bash
pnpm install
pnpm dev
```

Va sur [http://localhost:3000](http://localhost:3000), clique sur **Paramètres**, colle ton lien M3U.

## Données

Tout est stocké côté client (localStorage). Aucune donnée n'est envoyée à un serveur tiers — seul le proxy `/api/m3u` interne télécharge ta playlist au nom du navigateur pour éviter les blocages CORS.

## Structure

```
src/
├── app/
│   ├── api/m3u/          # Proxy CORS pour télécharger la playlist
│   ├── category/[group]/ # Toutes les chaînes d'une catégorie
│   ├── favorites/        # Liste des favoris
│   ├── search/           # Recherche
│   ├── settings/         # Saisie du lien M3U
│   └── watch/[id]/       # Player plein écran
├── components/
│   ├── channel-card.tsx
│   ├── empty-state.tsx
│   ├── hero.tsx
│   ├── player.tsx
│   ├── playlist-loader.tsx
│   ├── rail.tsx
│   └── topbar.tsx
└── lib/
    ├── m3u-parser.ts
    └── store.ts
```
