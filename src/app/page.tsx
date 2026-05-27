"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlaylistStore } from "@/lib/store";
import { Hero } from "@/components/hero";
import { Rail } from "@/components/rail";
import { EmptyState } from "@/components/empty-state";
import { SkeletonHero, SkeletonRail } from "@/components/skeleton";

export default function Home() {
  const playlist = usePlaylistStore((s) => s.playlist);
  const loading = usePlaylistStore((s) => s.loadingPlaylist);
  const error = usePlaylistStore((s) => s.playlistError);
  const m3uUrl = usePlaylistStore((s) => s.m3uUrl);
  const favorites = usePlaylistStore((s) => s.favorites);
  const history = usePlaylistStore((s) => s.watchHistory);

  // Pick a featured channel on the client side only, refreshed roughly every 6h
  const [timeBucket, setTimeBucket] = useState<number | null>(null);
  useEffect(() => {
    const compute = () => setTimeBucket(Math.floor(Date.now() / (1000 * 60 * 60 * 6)));
    compute();
    const id = window.setInterval(compute, 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const featuredChannel = useMemo(() => {
    if (!playlist || playlist.channels.length === 0 || timeBucket === null) return null;
    const idx = timeBucket % playlist.channels.length;
    return playlist.channels[idx];
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

      <div className="-mt-24 relative z-10 space-y-4">
        {continueWatching.length > 0 ? (
          <Rail title="Continuer à regarder" channels={continueWatching} />
        ) : null}

        {favoriteChannels.length > 0 ? (
          <Rail
            title="Mes favoris"
            channels={favoriteChannels}
            href="/favorites"
          />
        ) : null}

        {playlist.groupsSorted.slice(0, 25).map((group) => (
          <Rail
            key={group}
            title={group}
            channels={playlist.groups[group].slice(0, 24)}
            href={`/category/${encodeURIComponent(group)}`}
          />
        ))}
      </div>
    </div>
  );
}
