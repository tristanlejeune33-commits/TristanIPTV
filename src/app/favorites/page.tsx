"use client";

import { useMemo } from "react";
import { ChannelCard } from "@/components/channel-card";
import { usePlaylistStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";

export default function FavoritesPage() {
  const playlist = usePlaylistStore((s) => s.playlist);
  const favorites = usePlaylistStore((s) => s.favorites);

  const channels = useMemo(() => {
    if (!playlist) return [];
    return favorites
      .map((id) => playlist.channels.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
  }, [playlist, favorites]);

  if (!playlist) {
    return (
      <EmptyState
        title="Playlist non chargée"
        description="Configure ton lien M3U pour gérer tes favoris."
        ctaLabel="Aller aux paramètres"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  if (channels.length === 0) {
    return (
      <EmptyState
        title="Aucun favori pour l'instant"
        description="Clique sur le cœur sur une chaîne pour l'ajouter à tes favoris."
        ctaLabel="Parcourir les chaînes"
        ctaHref="/"
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-8 py-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)] mb-2">
          Mes favoris
        </p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          {channels.length} chaîne{channels.length > 1 ? "s" : ""} épinglée
          {channels.length > 1 ? "s" : ""}
        </h1>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-8">
        {channels.map((ch) => (
          <ChannelCard key={ch.id} channel={ch} />
        ))}
      </div>
    </div>
  );
}
