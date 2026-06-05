"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ChannelCard } from "./channel-card";
import { InfiniteGrid } from "./infinite-grid";
import type { Channel } from "@/lib/m3u-parser";
import type { LangVariant } from "@/lib/classify";
import { EmptyState } from "./empty-state";

const VARIANTS: { id: LangVariant | "all"; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "VF", label: "VF" },
  { id: "VOSTFR", label: "VOSTFR" },
  { id: "MULTI", label: "MULTI" },
  { id: "VO", label: "VO" },
];

/**
 * Generic page layout for content-type pages (/live, /movies).
 * - French-first sort, language-variant filter (VF/VOSTFR/...),
 *   group filter, text search, infinite scroll.
 */
export function TypePage({
  title,
  subtitle,
  channels,
  emptyTitle,
  emptyDescription,
  posterStyle,
}: {
  title: string;
  subtitle?: string;
  channels: Channel[];
  emptyTitle: string;
  emptyDescription: string;
  /** Render cards as posters (2:3). Auto for movies otherwise. */
  posterStyle?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [variant, setVariant] = useState<LangVariant | "all">("all");
  const [group, setGroup] = useState<string>("all");
  const [sortMode, setSortMode] = useState<"default" | "alpha" | "year">("default");

  const allGroups = useMemo(() => {
    const set = new Set<string>();
    for (const c of channels) set.add(c.group);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [channels]);

  const variantCounts = useMemo(() => {
    const counts: Record<string, number> = { all: channels.length };
    for (const v of ["VF", "VOSTFR", "MULTI", "VO"] as const) {
      counts[v] = channels.filter((c) => c.langVariant === v).length;
    }
    return counts;
  }, [channels]);

  const frenchCount = useMemo(
    () => channels.filter((c) => c.isFrench).length,
    [channels]
  );

  const filtered = useMemo(() => {
    let list = channels;
    if (variant !== "all") list = list.filter((c) => c.langVariant === variant);
    if (group !== "all") list = list.filter((c) => c.group === group);
    const q = query.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      list = list.filter((c) =>
        tokens.every((t) => `${c.name} ${c.group}`.toLowerCase().includes(t))
      );
    }
    return list;
  }, [channels, variant, group, query]);

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

      <div className="sticky top-16 z-20 bg-background/85 backdrop-blur-md py-3 -mx-2 px-2 rounded-2xl mb-8 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
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

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-muted mr-2">
            Tri
          </span>
          {(
            [
              { id: "default", label: "Plus récents" },
              { id: "year", label: "Année" },
              { id: "alpha", label: "A-Z" },
            ] as const
          ).map((s) => {
            const active = sortMode === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSortMode(s.id)}
                className={`h-9 px-3.5 rounded-full text-xs font-semibold transition-colors border ${
                  active
                    ? "bg-foreground border-foreground text-background"
                    : "bg-card border-border text-muted hover:text-foreground"
                }`}
                aria-pressed={active}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Language variant segmented control */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-muted mr-2">
            Langue
          </span>
          {VARIANTS.map((v) => {
            const count = variantCounts[v.id] ?? 0;
            if (v.id !== "all" && count === 0) return null;
            const active = variant === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariant(v.id)}
                className={`h-9 px-3.5 rounded-full text-xs font-semibold transition-colors border flex items-center gap-1.5 ${
                  active
                    ? v.id === "VF"
                      ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                      : v.id === "VOSTFR"
                        ? "bg-blue-500 border-blue-500 text-white"
                        : v.id === "MULTI"
                          ? "bg-purple-500 border-purple-500 text-white"
                          : v.id === "VO"
                            ? "bg-amber-500 border-amber-500 text-white"
                            : "bg-foreground border-foreground text-background"
                    : "bg-card border-border text-muted hover:text-foreground"
                }`}
                aria-pressed={active}
              >
                {v.label}
                <span
                  className={`font-mono text-[10px] ${
                    active ? "opacity-80" : "opacity-60"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted">Aucun résultat avec ces filtres.</p>
      ) : (
        <InfiniteGrid
          items={filtered}
          pageSize={60}
          className={
            posterStyle
              ? "grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-3 gap-y-6"
              : "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-8"
          }
          render={(ch) => (
            <ChannelCard key={ch.id} channel={ch} posterStyle={posterStyle} />
          )}
        />
      )}
    </div>
  );
}
