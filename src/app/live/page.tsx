"use client";

import { usePlaylistStore } from "@/lib/store";
import { TypePage } from "@/components/type-page";
import { EmptyState } from "@/components/empty-state";

export default function LivePage() {
  const playlist = usePlaylistStore((s) => s.playlist);

  if (!playlist) {
    return (
      <EmptyState
        title="Playlist non chargée"
        description="Configure ton lien M3U pour parcourir les chaînes en direct."
        ctaLabel="Aller aux paramètres"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  return (
    <TypePage
      title="Chaînes en direct"
      subtitle="Live TV"
      channels={playlist.liveChannels}
      emptyTitle="Aucune chaîne en direct"
      emptyDescription="Ta playlist ne contient pas de chaînes live détectables."
    />
  );
}
