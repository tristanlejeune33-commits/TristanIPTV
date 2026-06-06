"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Radio, Film, Tv, Layers, Heart } from "lucide-react";
import { usePlaylistStore } from "@/lib/store";
import { useList, useMeta, useShows, useChannelsByIds } from "@/lib/hooks";
import { Rail } from "@/components/rail";
import { ShowRail } from "@/components/show-rail";
import { EmptyState } from "@/components/empty-state";
import { SkeletonHero, SkeletonRail } from "@/components/skeleton";
import { TypeShortcuts } from "@/components/type-shortcuts";
import { Hero } from "@/components/hero";
import { FullLoadingScreen } from "@/components/full-loading-screen";
import { itemToChannel, showItemToGroup } from "@/lib/adapter";

const MAX_PER_RAIL = 18;

export default function Home() {
  const m3uUrl = usePlaylistStore((s) => s.m3uUrl);
  const progress = usePlaylistStore((s) => s.loadingProgress);
  const favorites = usePlaylistStore((s) => s.favorites);
  const history = usePlaylistStore((s) => s.watchHistory);

  const metaState = useMeta();
  const meta = metaState.data;

  // Each rail is its own paginated API call → tiny payloads, never holds
  // the full catalog in memory.
  const frenchLive = useList({
    type: "live",
    french: true,
    pageSize: MAX_PER_RAIL,
  });
  const frenchMovies = useList({
    type: "movie",
    french: true,
    sort: "year",
    pageSize: MAX_PER_RAIL,
  });
  const internationalLive = useList({
    type: "live",
    pageSize: MAX_PER_RAIL,
  });
  const allMovies = useList({
    type: "movie",
    sort: "year",
    pageSize: MAX_PER_RAIL,
  });
  const frenchShows = useShows({
    french: true,
    pageSize: MAX_PER_RAIL,
  });
  const allShows = useShows({ pageSize: MAX_PER_RAIL });

  const favIds = useMemo(() => favorites.slice(0, MAX_PER_RAIL), [favorites]);
  const histIds = useMemo(
    () => history.slice(0, MAX_PER_RAIL).map((h) => h.channelId),
    [history]
  );
  const favItems = useChannelsByIds(favIds);
  const histItems = useChannelsByIds(histIds);

  if (!m3uUrl) {
    return (
      <EmptyState
        title="Aucune playlist configurée"
        description="Configure DEFAULT_M3U_URL dans les variables d'environnement Vercel, ou ajoute ton lien dans Paramètres."
        ctaLabel="Configurer le lien M3U"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  if (metaState.loading && !meta) {
    return <FullLoadingScreen progress={progress} />;
  }

  if (metaState.error && !meta) {
    return (
      <EmptyState
        title="Impossible de charger le catalogue"
        description={metaState.error}
        ctaLabel="Vérifier le lien"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  if (!meta) return null;

  const featuredItem = frenchLive.data?.items[0] ?? internationalLive.data?.items[0];

  return (
    <div className="pb-20">
      {featuredItem ? <Hero channel={itemToChannel(featuredItem)} /> : null}

      <div className="-mt-24 relative z-10 space-y-2">
        <TypeShortcuts
          liveCount={meta.totalLive}
          movieCount={meta.totalMovies}
          seriesCount={meta.totalShows}
        />

        {histItems.data && histItems.data.length > 0 ? (
          <Rail
            title="Continuer à regarder"
            channels={histItems.data.map(itemToChannel)}
          />
        ) : null}

        {favItems.data && favItems.data.length > 0 ? (
          <Rail
            title="Mes favoris"
            channels={favItems.data.map(itemToChannel)}
            href="/favorites"
          />
        ) : null}

        {frenchLive.data && frenchLive.data.items.length > 0 ? (
          <Rail
            title="🇫🇷 Chaînes françaises en direct"
            channels={frenchLive.data.items.map(itemToChannel)}
            href="/live"
          />
        ) : null}

        {frenchMovies.data && frenchMovies.data.items.length > 0 ? (
          <Rail
            title="🇫🇷 Films français"
            channels={frenchMovies.data.items.map(itemToChannel)}
            href="/movies"
            posterStyle
          />
        ) : null}

        {frenchShows.data && frenchShows.data.items.length > 0 ? (
          <ShowRail
            title="🇫🇷 Séries françaises"
            shows={frenchShows.data.items.map(showItemToGroup)}
            href="/series"
          />
        ) : null}

        {internationalLive.data && internationalLive.data.items.length > 0 ? (
          <Rail
            title="Chaînes en direct"
            channels={internationalLive.data.items.map(itemToChannel)}
            href="/live"
          />
        ) : null}

        {allMovies.data && allMovies.data.items.length > 0 ? (
          <Rail
            title="Derniers films ajoutés"
            channels={allMovies.data.items.map(itemToChannel)}
            href="/movies"
            posterStyle
          />
        ) : null}

        {allShows.data && allShows.data.items.length > 0 ? (
          <ShowRail
            title="Séries"
            shows={allShows.data.items.map(showItemToGroup)}
            href="/series"
          />
        ) : null}

        <CategoryRailGrid />
      </div>
    </div>
  );
}

/**
 * Show the top categories as clickable cards. Each opens /category/[group]
 * where the user can browse with full pagination.
 */
function CategoryRailGrid() {
  const meta = usePlaylistStore((s) => s.meta);
  const groups = meta?.groups.slice(0, 24) ?? [];
  if (groups.length === 0) return null;

  return (
    <section className="px-4 md:px-8 py-6">
      <header className="mb-4 flex items-center gap-2">
        <Layers size={18} />
        <h2 className="text-xl font-bold">Toutes les catégories</h2>
        <Link
          href="/browse"
          className="ml-auto text-xs text-muted hover:text-foreground transition-colors"
        >
          Voir tout →
        </Link>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {groups.map((g) => {
          const Icon = g.type === "live" ? Radio : g.type === "movie" ? Film : Tv;
          return (
            <Link
              key={g.name}
              href={`/category/${encodeURIComponent(g.name)}`}
              className="group relative aspect-[3/2] rounded-xl overflow-hidden border border-border bg-card hover:bg-card-hover transition-colors p-4 flex flex-col justify-between"
            >
              <Icon size={18} className="text-muted group-hover:text-foreground transition-colors" />
              <div>
                <h3 className="text-sm font-semibold truncate">{g.name}</h3>
                <p className="text-xs text-muted mt-0.5">
                  {g.count} {g.count > 1 ? "items" : "item"}
                  {g.isFrench ? " · 🇫🇷" : ""}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
