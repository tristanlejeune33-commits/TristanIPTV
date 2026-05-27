"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlaylistStore } from "@/lib/store";
import { Hero } from "@/components/hero";
import { Rail } from "@/components/rail";
import { ShowRail } from "@/components/show-rail";
import { EmptyState } from "@/components/empty-state";
import { SkeletonHero, SkeletonRail } from "@/components/skeleton";

const MAX_PER_RAIL = 24;

export default function Home() {
  const playlist = usePlaylistStore((s) => s.playlist);
  const loading = usePlaylistStore((s) => s.loadingPlaylist);
  const error = usePlaylistStore((s) => s.playlistError);
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
    const french = playlist.channels.filter((c) => c.isFrench);
    const pool = french.length > 0 ? french : playlist.channels;
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

  const otherShows = useMemo(() => {
    if (!playlist) return [];
    return playlist.showsSorted
      .map((s) => playlist.shows[s])
      .filter((s) => !s.isFrench)
      .slice(0, MAX_PER_RAIL);
  }, [playlist]);

  const internationalLive = useMemo(
    () => playlist?.liveChannels.filter((c) => !c.isFrench).slice(0, MAX_PER_RAIL) ?? [],
    [playlist]
  );

  const internationalMovies = useMemo(
    () => playlist?.movieChannels.filter((c) => !c.isFrench).slice(0, MAX_PER_RAIL) ?? [],
    [playlist]
  );

  const topGroups = useMemo(() => {
    if (!playlist) return [];
    return playlist.groupsSorted.slice(0, 15);
  }, [playlist]);

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
    return (
      <div className="pb-20">
        <SkeletonHero />
        <div className="-mt-24 relative z-10 space-y-4">
          <SkeletonRail />
          <SkeletonRail />
          <SkeletonRail />
        </div>
      </div>
    );
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
        {continueWatching.length > 0 ? (
          <Rail title="Continuer à regarder" channels={continueWatching} />
        ) : null}

        {favoriteChannels.length > 0 ? (
          <Rail title="Mes favoris" channels={favoriteChannels} href="/favorites" />
        ) : null}

        {/* French priority section */}
        {frenchLive.length > 0 ? (
          <Rail
            title="🇫🇷 Chaînes françaises en direct"
            channels={frenchLive}
            href="/live"
          />
        ) : null}

        {frenchMovies.length > 0 ? (
          <Rail
            title="🇫🇷 Films français"
            channels={frenchMovies}
            href="/movies"
          />
        ) : null}

        {frenchShows.length > 0 ? (
          <ShowRail
            title="🇫🇷 Séries françaises"
            shows={frenchShows}
            href="/series"
          />
        ) : null}

        {/* International */}
        {internationalLive.length > 0 ? (
          <Rail
            title="Chaînes internationales en direct"
            channels={internationalLive}
            href="/live"
          />
        ) : null}

        {internationalMovies.length > 0 ? (
          <Rail
            title="Films internationaux"
            channels={internationalMovies}
            href="/movies"
          />
        ) : null}

        {otherShows.length > 0 ? (
          <ShowRail title="Autres séries" shows={otherShows} href="/series" />
        ) : null}

        {/* Raw groups for discovery */}
        {topGroups.map((group) => (
          <Rail
            key={group}
            title={group}
            channels={playlist.groups[group].slice(0, MAX_PER_RAIL)}
            href={`/category/${encodeURIComponent(group)}`}
          />
        ))}
      </div>
    </div>
  );
}
