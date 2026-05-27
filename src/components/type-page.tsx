"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ChannelCard } from "./channel-card";
import { InfiniteGrid } from "./infinite-grid";
import type { Channel } from "@/lib/m3u-parser";
import { EmptyState } from "./empty-state";

/**
 * Generic page layout for content-type pages (/live, /movies).
 * - French-first sort, FR filter toggle, group filter, text search,
 *   infinite scroll for large catalogs.
 */
export function TypePage({
  title,
  subtitle,
  channels,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  subtitle?: string;
  channels: Channel[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  const [query, setQuery] = useState("");
  const [frOnly, setFrOnly] = useState(false);
  const [group, setGroup] = useState<string>("all");

  const allGroups = useMemo(() => {
    const set = new Set<string>();
    for (const c of channels) set.add(c.group);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [channels]);

  const frenchCount = useMemo(
    () => channels.filter((c) => c.isFrench).length,
    [channels]
  );

  const filtered = useMemo(() => {
    let list = channels;
    if (frOnly) list = list.filter((c) => c.isFrench);
    if (group !== "all") list = list.filter((c) => c.group === group);
    const q = query.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      list = list.filter((c) =>
        tokens.every((t) => `${c.name} ${c.group}`.toLowerCase().includes(t))
      );
    }
    // List is already sorted upstream (FR-first, year desc for VOD).
    // Don't resort — preserve "latest releases first" order.
    return list;
  }, [channels, frOnly, group, query]);

  if (channels.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        ctaLabel="Retour à l'accueil"
        ctaHref="/"
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-8 py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted mb-2">
          {subtitle ?? "Catégorie"}
        </p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">{title}</h1>
        <p className="text-sm text-muted mt-2">
          {channels.length} au total
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

      <div className="flex flex-wrap items-center gap-3 mb-8 sticky top-16 md:top-16 z-20 bg-background/80 backdrop-blur-md py-3 -mx-2 px-2 rounded-2xl">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
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

        {allGroups.length > 1 ? (
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="h-11 px-3 rounded-full bg-card border border-border text-sm focus:outline-none focus:border-foreground/40 max-w-[240px] truncate"
          >
            <option value="all">Toutes les catégories ({allGroups.length})</option>
            {allGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted">Aucun résultat avec ces filtres.</p>
      ) : (
        <InfiniteGrid
          items={filtered}
          pageSize={60}
          className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-8"
          render={(ch) => <ChannelCard key={ch.id} channel={ch} />}
        />
      )}
    </div>
  );
}
