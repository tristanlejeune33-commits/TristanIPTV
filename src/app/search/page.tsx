"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Clock, Sparkles, Radio, Film, Tv, Layers } from "lucide-react";
import { usePlaylistStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";
import { ChannelCard } from "@/components/channel-card";
import { ShowCard } from "@/components/show-card";
import {
  buildSearchIndex,
  getSearchSuggestions,
  groupResults,
  type GroupedResults,
} from "@/lib/search";
import { getFallbackGradient } from "@/lib/colors";

const DEBOUNCE_MS = 300;

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";

  const playlist = usePlaylistStore((s) => s.playlist);
  const recents = usePlaylistStore((s) => s.recentSearches);
  const addRecent = usePlaylistStore((s) => s.addRecentSearch);
  const clearRecents = usePlaylistStore((s) => s.clearRecentSearches);

  const [query, setQuery] = useState(initialQ);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQ);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build the Fuse index once per playlist load — it's a few MB max, fast.
  const index = useMemo(
    () => (playlist ? buildSearchIndex(playlist) : null),
    [playlist]
  );

  // Debounce the live search
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  // Sync URL — without re-fetching, so refreshes are stable
  useEffect(() => {
    const q = debouncedQuery.trim();
    const current = params.get("q") ?? "";
    if (q !== current) {
      router.replace(q ? `/search?q=${encodeURIComponent(q)}` : "/search", {
        scroll: false,
      });
    }
    // Persist the query in recents once it stabilizes and is at least 2 chars
    if (q.length >= 2) {
      addRecent(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // Auto-focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results: GroupedResults | null = useMemo(() => {
    if (!index || !debouncedQuery.trim()) return null;
    const hits = index.search(debouncedQuery.trim()).map((h) => ({
      item: h.item,
      score: h.score ?? 1,
    }));
    return groupResults(hits, 30);
  }, [index, debouncedQuery]);

  const suggestions = useMemo(
    () => (playlist ? getSearchSuggestions(playlist) : []),
    [playlist]
  );

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

  const isEmpty = !debouncedQuery.trim();
  const noResults = results !== null && results.total === 0;

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-8 py-8">
      {/* Search bar */}
      <div className="sticky top-16 z-30 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="relative max-w-3xl mx-auto">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Films, séries, chaînes, catégories…"
            className="w-full bg-card border border-border rounded-full h-14 pl-12 pr-12 text-base placeholder:text-muted focus:outline-none focus:border-foreground/40"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Effacer"
              className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-full hover:bg-card-hover text-muted hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        {results !== null ? (
          <p className="text-xs text-muted text-center mt-2">
            {results.total} résultat{results.total > 1 ? "s" : ""} pour «{" "}
            {debouncedQuery} »
          </p>
        ) : null}
      </div>

      {/* Empty state: recents + suggestions */}
      {isEmpty ? (
        <div className="mt-10 space-y-10 max-w-3xl mx-auto">
          {recents.length > 0 ? (
            <section>
              <header className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-widest text-muted flex items-center gap-2">
                  <Clock size={14} /> Recherches récentes
                </h2>
                <button
                  type="button"
                  onClick={() => clearRecents()}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  Effacer
                </button>
              </header>
              <div className="flex flex-wrap gap-2">
                {recents.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setQuery(r)}
                    className="h-9 px-4 rounded-full bg-card border border-border text-sm hover:bg-card-hover transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted flex items-center gap-2 mb-3">
              <Sparkles size={14} /> Suggestions
            </h2>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuery(s)}
                  className="h-9 px-4 rounded-full bg-card border border-border text-sm hover:bg-card-hover transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {/* No-results state */}
      {noResults ? (
        <div className="mt-16 text-center max-w-md mx-auto">
          <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-card border border-border grid place-items-center">
            <Search size={28} className="text-muted" />
          </div>
          <h2 className="text-2xl font-bold mb-2">
            Aucun résultat pour « {debouncedQuery} »
          </h2>
          <p className="text-muted text-sm mb-6">
            Vérifie l&apos;orthographe ou essaie l&apos;une de ces suggestions.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="h-9 px-4 rounded-full bg-card border border-border text-sm hover:bg-card-hover transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Grouped results */}
      {results !== null && !noResults ? (
        <div className="mt-8 space-y-12">
          {results.live.length > 0 ? (
            <ResultSection
              title="Chaînes TV en direct"
              icon={<Radio size={18} />}
              count={results.live.length}
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-8">
                {results.live.map((c) => (
                  <ChannelCard key={c.id} channel={c} />
                ))}
              </div>
            </ResultSection>
          ) : null}

          {results.movies.length > 0 ? (
            <ResultSection
              title="Films"
              icon={<Film size={18} />}
              count={results.movies.length}
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-3 gap-y-6">
                {results.movies.map((c) => (
                  <ChannelCard key={c.id} channel={c} posterStyle />
                ))}
              </div>
            </ResultSection>
          ) : null}

          {results.shows.length > 0 ? (
            <ResultSection
              title="Séries"
              icon={<Tv size={18} />}
              count={results.shows.length}
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                {results.shows.map((s) => (
                  <ShowCard key={s.showSlug} show={s} />
                ))}
              </div>
            </ResultSection>
          ) : null}

          {results.groups.length > 0 ? (
            <ResultSection
              title="Catégories"
              icon={<Layers size={18} />}
              count={results.groups.length}
            >
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {results.groups.map((g) => (
                  <Link
                    key={g}
                    href={`/category/${encodeURIComponent(g)}`}
                    className="group relative aspect-[5/3] rounded-xl overflow-hidden border border-border hover:border-foreground/30 transition-all"
                    style={{ background: getFallbackGradient(g) }}
                  >
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                    <div className="relative h-full p-3 flex flex-col justify-end">
                      <Layers
                        size={16}
                        className="text-white/70 mb-auto self-end"
                      />
                      <h3 className="text-sm font-semibold text-white drop-shadow line-clamp-2">
                        {g}
                      </h3>
                      <p className="text-[10px] text-white/80 mt-0.5">
                        {playlist.groups[g]?.length ?? 0} chaînes
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </ResultSection>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ResultSection({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-xl font-bold">{title}</h2>
        <span className="text-xs font-mono text-muted">{count}</span>
      </header>
      {children}
    </section>
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
