"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
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
  const [query, setQuery] = useState("");

  const baseChannels = useMemo(
    () => playlist?.groups[group] ?? [],
    [playlist, group]
  );

  const channels = useMemo(() => {
    if (!query.trim()) return baseChannels;
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return baseChannels.filter((c) =>
      tokens.every((t) => c.name.toLowerCase().includes(t))
    );
  }, [baseChannels, query]);

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

  if (baseChannels.length === 0) {
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
        href="/browse"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Toutes les catégories
      </Link>

      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted mb-2">
          Catégorie
        </p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          {group}
        </h1>
        <p className="text-sm text-muted mt-2">
          {baseChannels.length} chaîne{baseChannels.length > 1 ? "s" : ""}
        </p>
      </header>

      {baseChannels.length > 12 ? (
        <div className="relative mb-8 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filtrer dans ${group}…`}
            className="w-full bg-card border border-border rounded-full h-11 pl-9 pr-4 text-sm placeholder:text-muted focus:outline-none focus:border-foreground/40"
          />
        </div>
      ) : null}

      {channels.length === 0 ? (
        <p className="text-muted">Aucun résultat avec ce filtre.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-8">
          {channels.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} />
          ))}
        </div>
      )}
    </div>
  );
}
