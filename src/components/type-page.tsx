"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ChannelCard } from "./channel-card";
import { EmptyState } from "./empty-state";
import { useList } from "@/lib/hooks";
import type { CatalogType, LangVariant, SortMode } from "@/lib/catalog-client";
import { itemToChannel } from "@/lib/adapter";

const VARIANTS: { id: LangVariant | "all"; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "VF", label: "VF" },
  { id: "VOSTFR", label: "VOSTFR" },
  { id: "MULTI", label: "MULTI" },
  { id: "VO", label: "VO" },
];

export function TypePage({
  title,
  subtitle,
  type,
  emptyTitle,
  emptyDescription,
  posterStyle,
}: {
  title: string;
  subtitle?: string;
  type: CatalogType;
  emptyTitle: string;
  emptyDescription: string;
  posterStyle?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [variant, setVariant] = useState<LangVariant | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [page, setPage] = useState(1);

  const opts = useMemo(
    () => ({
      type,
      q: query.trim() || undefined,
      variant: variant === "all" ? null : variant,
      sort: sortMode,
      page,
      pageSize: 60,
    }),
    [type, query, variant, sortMode, page]
  );
  const { data, loading, error } = useList(opts);

  if (error) {
    return (
      <EmptyState
        title={emptyTitle}
        description={`${emptyDescription} (${error})`}
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
        {data ? (
          <p className="text-sm text-muted mt-2">
            {data.total} au total · page {data.page}
          </p>
        ) : null}
      </header>

      <div className="sticky top-16 z-20 bg-background/85 backdrop-blur-md py-3 -mx-2 px-2 rounded-2xl mb-8 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Rechercher…"
              className="w-full bg-card border border-border rounded-full h-11 pl-9 pr-4 text-sm placeholder:text-muted focus:outline-none focus:border-foreground/40"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-muted mr-2">Tri</span>
          {([
            { id: "default", label: "Plus récents" },
            { id: "year", label: "Année" },
            { id: "alpha", label: "A-Z" },
          ] as const).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSortMode(s.id);
                setPage(1);
              }}
              className={`h-9 px-3.5 rounded-full text-xs font-semibold transition-colors border ${
                sortMode === s.id
                  ? "bg-foreground border-foreground text-background"
                  : "bg-card border-border text-muted hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-muted mr-2">Langue</span>
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setVariant(v.id);
                setPage(1);
              }}
              className={`h-9 px-3.5 rounded-full text-xs font-semibold transition-colors border ${
                variant === v.id
                  ? "bg-foreground border-foreground text-background"
                  : "bg-card border-border text-muted hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <p className="text-muted">Chargement…</p>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          ctaLabel="Retour à l'accueil"
          ctaHref="/"
        />
      ) : data ? (
        <>
          <div
            className={
              posterStyle
                ? "grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-3 gap-y-6"
                : "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-8"
            }
          >
            {data.items.map((c) => (
              <ChannelCard
                key={c.id}
                channel={itemToChannel(c)}
                posterStyle={posterStyle}
              />
            ))}
          </div>

          {data.total > data.page * data.pageSize ? (
            <div className="flex justify-center mt-10">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={loading}
                className="h-11 px-6 rounded-full bg-card border border-border hover:bg-card-hover text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? "Chargement…" : "Page suivante"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
