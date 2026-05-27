"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ChannelCard } from "@/components/channel-card";
import { usePlaylistStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";

function SearchInner() {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const playlist = usePlaylistStore((s) => s.playlist);

  const results = useMemo(() => {
    if (!playlist || !q) return [];
    const tokens = q.split(/\s+/);
    return playlist.channels.filter((c) => {
      const hay = `${c.name} ${c.group} ${c.country ?? ""} ${c.language ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [playlist, q]);

  if (!playlist) {
    return (
      <EmptyState
        title="Playlist non chargée"
        description="Configure ton lien M3U pour pouvoir effectuer une recherche."
        ctaLabel="Aller aux paramètres"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-8 py-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-muted mb-2">
          Recherche
        </p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          {q ? <>Résultats pour « {q} »</> : "Tapez quelque chose…"}
        </h1>
        {q ? (
          <p className="text-sm text-muted mt-2">
            {results.length} chaîne{results.length > 1 ? "s" : ""} trouvée
            {results.length > 1 ? "s" : ""}
          </p>
        ) : null}
      </header>

      {q && results.length === 0 ? (
        <p className="text-muted">Aucun résultat. Essaie un autre mot-clé.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-8">
          {results.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] grid place-items-center">
          <div className="h-10 w-10 border-4 border-border border-t-[var(--accent)] rounded-full animate-spin" />
        </div>
      }
    >
      <SearchInner />
    </Suspense>
  );
}
