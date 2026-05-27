"use client";

import { usePlaylistStore } from "@/lib/store";
import { TypePage } from "@/components/type-page";
import { EmptyState } from "@/components/empty-state";

export default function MoviesPage() {
  const playlist = usePlaylistStore((s) => s.playlist);

  if (!playlist) {
    return (
      <EmptyState
        title="Playlist non chargée"
        description="Configure ton lien M3U pour parcourir les films."
        ctaLabel="Aller aux paramètres"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  return (
    <TypePage
      title="Films"
      subtitle="VOD"
      channels={playlist.movieChannels}
      emptyTitle="Aucun film"
      emptyDescription="Ta playlist ne contient pas de films détectables."
    />
  );
}
