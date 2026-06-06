"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { ShowCard } from "@/components/show-card";
import { EmptyState } from "@/components/empty-state";
import { useShows } from "@/lib/hooks";
import { showItemToGroup } from "@/lib/adapter";

export default function SeriesPage() {
  const [query, setQuery] = useState("");
  const [frOnly, setFrOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { data, loading, error } = useShows({
    q: query.trim() || undefined,
    french: frOnly || undefined,
    page,
    pageSize: 48,
  });

  if (error) {
    return (
      <EmptyState
        title="Impossible de charger les séries"
        description={error}
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
          {data?.total ?? "…"} séries
        </h1>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-8 sticky top-16 z-20 bg-background/80 backdrop-blur-md py-3 -mx-2 px-2 rounded-2xl">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Rechercher une série…"
            className="w-full bg-card border border-border rounded-full h-11 pl-9 pr-4 text-sm placeholder:text-muted focus:outline-none focus:border-foreground/40"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setFrOnly((v) => !v);
            setPage(1);
          }}
          className={`h-11 px-4 rounded-full text-sm font-semibold transition-colors border ${
            frOnly
              ? "bg-[var(--accent)] border-[var(--accent)] text-white"
              : "bg-card border-border text-muted hover:text-foreground"
          }`}
        >
          🇫🇷 Français
        </button>
      </div>

      {loading && !data ? (
        <p className="text-muted">Chargement…</p>
      ) : data && data.items.length === 0 ? (
        <p className="text-muted">Aucune série correspondante.</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {data.items.map((s) => (
              <ShowCard key={s.showSlug} show={showItemToGroup(s)} />
            ))}
          </div>

          {data.total > data.page * data.pageSize ? (
            <div className="flex justify-center mt-10">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="h-11 px-6 rounded-full bg-card border border-border hover:bg-card-hover text-sm font-semibold transition-colors"
              >
                Page suivante
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
