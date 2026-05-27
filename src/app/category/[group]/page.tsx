"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ChannelCard } from "@/components/channel-card";
import { usePlaylistStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";

export default function CategoryPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { group: rawGroup } = use(params);
  const group = decodeURIComponent(rawGroup);
  const playlist = usePlaylistStore((s) => s.playlist);

  const channels = useMemo(
    () => playlist?.groups[group] ?? [],
    [playlist, group]
  );

  if (!playlist) {
    return (
      <EmptyState
        title="Playlist non chargée"
        description="Configure ton lien M3U pour explorer les catégories."
        ctaLabel="Aller aux paramètres"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  if (channels.length === 0) {
    return (
      <EmptyState
        title="Catégorie vide"
        description={`Aucune chaîne dans "${group}".`}
        ctaLabel="Retour à l'accueil"
        ctaHref="/"
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-8 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Accueil
      </Link>

      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-muted mb-2">
          Catégorie
        </p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          {group}
        </h1>
        <p className="text-sm text-muted mt-2">
          {channels.length} chaîne{channels.length > 1 ? "s" : ""}
        </p>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-8">
        {channels.map((ch) => (
          <ChannelCard key={ch.id} channel={ch} />
        ))}
      </div>
    </div>
  );
}
