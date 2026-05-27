"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { usePlaylistStore } from "@/lib/store";
import { ShowCard } from "@/components/show-card";
import { InfiniteGrid } from "@/components/infinite-grid";
import { EmptyState } from "@/components/empty-state";

export default function SeriesPage() {
  const playlist = usePlaylistStore((s) => s.playlist);
  const [query, setQuery] = useState("");
  const [frOnly, setFrOnly] = useState(false);

  const allShows = useMemo(() => {
    if (!playlist) return [];
    return playlist.showsSorted.map((slug) => playlist.shows[slug]);
  }, [playlist]);

  const frenchCount = useMemo(
    () => allShows.filter((s) => s.isFrench).length,
    [allShows]
  );

  const filtered = useMemo(() => {
    let list = allShows;
    if (frOnly) list = list.filter((s) => s.isFrench);
    const q = query.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      list = list.filter((s) =>
        tokens.every((t) => s.show.toLowerCase().includes(t))
      );
    }
    return list;
  }, [allShows, frOnly, query]);

  if (!playlist) {
    return (
      <EmptyState
        title="Playlist non chargée"
        description="Configure ton lien M3U pour parcourir les séries."
        ctaLabel="Aller aux paramètres"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  if (allShows.length === 0) {
    return (
      <EmptyState
        title="Aucune série"
        description="Ta playlist ne contient pas de séries détectables."
        ctaLabel="Retour à l'accueil"
        ctaHref="/"
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-8 py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted mb-2">Séries</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          {allShows.length} série{allShows.length > 1 ? "s" : ""}
        </h1>
        <p className="text-sm text-muted mt-2">
          {playlist.seriesEpisodes.length} épisode
          {playlist.seriesEpisodes.length > 1 ? "s" : ""}
          {frenchCount > 0 ? (
            <>
              {" · "}
              <span className="text-[var(--accent)] font-semibold">
                {frenchCount} en français
              </span>
            </>
          ) : null}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-8 sticky top-16 z-20 bg-background/80 backdrop-blur-md py-3 -mx-2 px-2 rounded-2xl">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une série…"
            className="w-full bg-card border border-border rounded-full h-11 pl-9 pr-4 text-sm placeholder:text-muted focus:outline-none focus:border-foreground/40"
          />
        </div>

        <button
          type="button"
          onClick={() => setFrOnly((v) => !v)}
          className={`h-11 px-4 rounded-full text-sm font-semibold transition-colors border ${
            frOnly
              ? "bg-[var(--accent)] border-[var(--accent)] text-white"
              : "bg-card border-border text-muted hover:text-foreground"
          }`}
          aria-pressed={frOnly}
        >
          🇫🇷 Français
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted">Aucune série correspondante.</p>
      ) : (
        <InfiniteGrid
          items={filtered}
          pageSize={48}
          className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4"
          render={(s) => <ShowCard key={s.showSlug} show={s} />}
        />
      )}
    </div>
  );
}
