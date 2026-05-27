# LE JEUNE IPTV

Lecteur M3U / IPTV moderne avec une interface inspirée des grandes plateformes de streaming.

## Stack

- **Next.js 15 / 16** (App Router) + TypeScript
- **Tailwind v4** + design system custom dark mode
- **hls.js** pour la lecture des flux HLS (`.m3u8`)
- **Framer Motion** pour les micro-interactions
- **Zustand** + persist localStorage pour les favoris / historique
- **Sonner** pour les toasts, **cmdk** pour la command palette
- **lucide-react** pour les icônes

## Fonctionnalités

### Catalogue
- 📺 Classification automatique : Live TV / Films / Séries
- 🇫🇷 Détection et tri prioritaire du contenu francophone
- 🆕 Dernières sorties d'abord (extraction de l'année dans le titre)
- 🎞️ Regroupement des épisodes par série avec saisons
- 🗂️ Pages dédiées : `/live`, `/movies`, `/series`, `/series/[show]`, `/browse`
- ❤️ Favoris séparés par type (chaînes / films / séries)
- ⏯️ "Continuer à regarder" avec reprise de position pour les films/séries

### Player
- Sous-titres, pistes audio, qualité, vitesse (sélecteurs HLS natifs)
- Barre de progression cliquable pour les VOD
- Picture-in-picture, plein écran, mute, volume slider
- Raccourcis clavier : Espace, M, F, P, ↑↓, ←→, J/L, C
- Récupération automatique sur erreur réseau / media
- Tuning fast-start (faible buffer initial)

### UX
- Hero rotatif (chaîne du moment, FR prioritaire)
- Trois grandes cartes type au-dessus des rails : TV, Films, Séries
- Command palette `⌘K` / `Ctrl+K` avec recherche globale
- Toasts contextuels, skeleton loaders, fallback logo gradient + initiales
- Lazy rendering des rails (IntersectionObserver) + pagination infinie sur les grilles

### Technique
- Proxy serveur `/api/m3u` pour contourner les CORS
- PWA installable (manifest + icône)
- Tout côté client : aucune donnée envoyée ailleurs que pour fetch ta playlist

## Démarrage

```bash
pnpm install
pnpm dev
```

Va sur [http://localhost:3000](http://localhost:3000), clique sur **Paramètres**, colle ton lien M3U.

## Structure

```
src/
├── app/
│   ├── api/m3u/          # Proxy CORS pour la playlist
│   ├── browse/           # Toutes les catégories brutes
│   ├── category/[group]/ # Chaînes d'une catégorie
│   ├── favorites/        # Favoris séparés par type
│   ├── live/             # Chaînes en direct
│   ├── movies/           # Films
│   ├── series/           # Liste des séries
│   ├── series/[show]/    # Page d'une série avec saisons
│   ├── search/           # Recherche globale
│   ├── settings/         # Configuration du lien M3U
│   └── watch/[id]/       # Player plein écran
├── components/
│   ├── channel-card.tsx
│   ├── channel-thumbnail.tsx
│   ├── command-palette.tsx
│   ├── empty-state.tsx
│   ├── hero.tsx
│   ├── infinite-grid.tsx
│   ├── lazy-section.tsx
│   ├── player.tsx
│   ├── playlist-loader.tsx
│   ├── rail.tsx
│   ├── show-card.tsx
│   ├── show-rail.tsx
│   ├── skeleton.tsx
│   ├── topbar.tsx
│   ├── type-page.tsx
│   └── type-shortcuts.tsx
└── lib/
    ├── classify.ts       # Détection type/langue/année/série
    ├── colors.ts         # Fallback gradient + initiales
    ├── m3u-parser.ts     # Parser + index par type/show
    └── store.ts          # Zustand + localStorage
```
