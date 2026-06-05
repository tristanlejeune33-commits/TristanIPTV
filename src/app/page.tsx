"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlaylistStore } from "@/lib/store";
import { Hero } from "@/components/hero";
import { Rail } from "@/components/rail";
import { ShowRail } from "@/components/show-rail";
import { EmptyState } from "@/components/empty-state";
// Skeleton imports removed — full loading screen replaces the placeholder rails.
import { TypeShortcuts } from "@/components/type-shortcuts";
import { LazySection } from "@/components/lazy-section";
import { FullLoadingScreen } from "@/components/full-loading-screen";

const MAX_PER_RAIL = 24;

export default function Home() {
  const playlist = usePlaylistStore((s) => s.playlist);
  const loading = usePlaylistStore((s) => s.loadingPlaylist);
  const error = usePlaylistStore((s) => s.playlistError);
  const progress = usePlaylistStore((s) => s.loadingProgress);
  const m3uUrl = usePlaylistStore((s) => s.m3uUrl);
  const favorites = usePlaylistStore((s) => s.favorites);
  const history = usePlaylistStore((s) => s.watchHistory);

  // Featured channel — refreshed roughly every 6h, FR-prioritized
  const [timeBucket, setTimeBucket] = useState<number | null>(null);
  useEffect(() => {
    const compute = () => setTimeBucket(Math.floor(Date.now() / (1000 * 60 * 60 * 6)));
    compute();
    const id = window.setInterval(compute, 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const featuredChannel = useMemo(() => {
    if (!playlist || playlist.channels.length === 0 || timeBucket === null) return null;
    const frenchLive = playlist.liveChannels.filter((c) => c.isFrench);
    const pool =
      frenchLive.length > 0
        ? frenchLive
        : playlist.liveChannels.length > 0
          ? playlist.liveChannels
          : playlist.channels;
    return pool[timeBucket % pool.length];
  }, [playlist, timeBucket]);

  const favoriteChannels = useMemo(() => {
    if (!playlist) return [];
    return favorites
      .map((id) => playlist.channels.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
  }, [playlist, favorites]);

  const continueWatching = useMemo(() => {
    if (!playlist) return [];
    return history
      .map((h) => playlist.channels.find((c) => c.id === h.channelId))
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
  }, [playlist, history]);

  const recentMovies = useMemo(
    () => playlist?.movieChannels.slice(0, MAX_PER_RAIL) ?? [],
    [playlist]
  );

  const recentShows = useMemo(() => {
    if (!playlist) return [];
    return playlist.showsSorted
      .map((s) => playlist.shows[s])
      .slice(0, MAX_PER_RAIL);
  }, [playlist]);

  const frenchLive = useMemo(
    () => playlist?.liveChannels.filter((c) => c.isFrench).slice(0, MAX_PER_RAIL) ?? [],
    [playlist]
  );

  const frenchMovies = useMemo(
    () => playlist?.movieChannels.filter((c) => c.isFrench).slice(0, MAX_PER_RAIL) ?? [],
    [playlist]
  );

  const frenchShows = useMemo(() => {
    if (!playlist) return [];
    return playlist.showsSorted
      .map((s) => playlist.shows[s])
      .filter((s) => s.isFrench)
      .slice(0, MAX_PER_RAIL);
  }, [playlist]);

  const internationalLive = useMemo(
    () => playlist?.liveChannels.filter((c) => !c.isFrench).slice(0, MAX_PER_RAIL) ?? [],
    [playlist]
  );

  const topGroups = useMemo(() => {
    if (!playlist) return [];
    // Annotate each group with its dominant content type so the rail picks a
    // consistent card style (avoids mixing 16:9 logos with 2:3 posters in the
    // same rail, which looks awful).
    return playlist.groupsSorted.slice(0, 12).map((group) => {
      const channels = playlist.groups[group] ?? [];
      let movies = 0;
      let live = 0;
      let series = 0;
      for (const c of channels) {
        if (c.type === "movie") movies++;
        else if (c.type === "series") series++;
        else live++;
      }
      const dominant: "movie" | "series" | "live" =
        movies >= series && movies >= live
          ? "movie"
          : series >= live
            ? "series"
            : "live";
      return { group, channels, dominant };
    });
  }, [playlist]);

  // "Parce que vous avez regardé..." — find the most-watched groups in history,
  // then surface channels from those groups the user hasn't watched yet.
  const recommendations = useMemo(() => {
    if (!playlist || history.length === 0) return [];
    const groupCount = new Map<string, number>();
    const watchedIds = new Set(history.map((h) => h.channelId));
    for (const h of history) {
      const ch = playlist.channels.find((c) => c.id === h.channelId);
      if (!ch) continue;
      groupCount.set(ch.group, (groupCount.get(ch.group) ?? 0) + 1);
    }
    const topGroupsByWatch = Array.from(groupCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);

    return topGroupsByWatch
      .map((g) => ({
        group: g,
        channels: (playlist.groups[g] ?? [])
          .filter((c) => !watchedIds.has(c.id))
          .slice(0, MAX_PER_RAIL),
      }))
      .filter((r) => r.channels.length > 0);
  }, [playlist, history]);

  if (!m3uUrl) {
    return (
      <EmptyState
        title="Aucune playlist configurée"
        description="Ajoute le lien M3U que t'a partagé ton ami dans les paramètres pour commencer à regarder."
        ctaLabel="Configurer le lien M3U"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  if (loading && !playlist) {
    return <FullLoadingScreen progress={progress} />;
  }

  if (error) {
    return (
      <EmptyState
        title="Impossible de charger la playlist"
        description={error}
        ctaLabel="Vérifier le lien"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  if (!playlist || playlist.channels.length === 0) {
    return (
      <EmptyState
        title="Playlist vide"
        description="Le fichier M3U ne contient aucune chaîne lisible."
        ctaLabel="Changer le lien"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  return (
    <div className="pb-20">
      {featuredChannel ? <Hero channel={featuredChannel} /> : null}

      <div className="-mt-24 relative z-10 space-y-2">
        {/* Big top shortcuts — clear TV / Films / Series separation */}
        <TypeShortcuts
          liveCount={playlist.liveChannels.length}
          movieCount={playlist.movieChannels.length}
          seriesCount={playlist.showsSorted.length}
        />

        {/* Continue / favorites — always visible */}
        {continueWatching.length > 0 ? (
          <Rail title="Continuer à regarder" channels={continueWatching} />
        ) : null}

        {favoriteChannels.length > 0 ? (
          <Rail title="Mes favoris" channels={favoriteChannels} href="/favorites" />
        ) : null}

        {recommendations.map((rec) => (
          <LazySection key={`reco-${rec.group}`}>
            <Rail
              title={`Parce que vous regardez ${rec.group}`}
              channels={rec.channels}
              href={`/category/${encodeURIComponent(rec.group)}`}
            />
          </LazySection>
        ))}

        {/* Latest releases */}
        {recentMovies.length > 0 ? (
          <LazySection>
            <Rail
              title="Derniers films ajoutés"
              channels={recentMovies}
              href="/movies"
              posterStyle
            />
          </LazySection>
        ) : null}

        {recentShows.length > 0 ? (
          <LazySection>
            <ShowRail
              title="Dernières séries ajoutées"
              shows={recentShows}
              href="/series"
            />
          </LazySection>
        ) : null}

        {/* French priority */}
        {frenchLive.length > 0 ? (
          <LazySection>
            <Rail
              title="🇫🇷 Chaînes françaises en direct"
              channels={frenchLive}
              href="/live"
            />
          </LazySection>
        ) : null}

        {frenchMovies.length > 0 ? (
          <LazySection>
            <Rail
              title="🇫🇷 Films français"
              channels={frenchMovies}
              href="/movies"
              posterStyle
            />
          </LazySection>
        ) : null}

        {frenchShows.length > 0 ? (
          <LazySection>
            <ShowRail
              title="🇫🇷 Séries françaises"
              shows={frenchShows}
              href="/series"
            />
          </LazySection>
        ) : null}

        {/* International */}
        {internationalLive.length > 0 ? (
          <LazySection>
            <Rail
              title="Chaînes internationales en direct"
              channels={internationalLive}
              href="/live"
            />
          </LazySection>
        ) : null}

        {/* Raw groups for discovery (lazy + capped, uniform style per rail) */}
        {topGroups.map(({ group, channels, dominant }) => (
          <LazySection key={group}>
            <Rail
              title={group}
              channels={channels.slice(0, MAX_PER_RAIL)}
              href={`/category/${encodeURIComponent(group)}`}
              posterStyle={dominant === "movie"}
            />
          </LazySection>
        ))}
      </div>
    </div>
  );
}
