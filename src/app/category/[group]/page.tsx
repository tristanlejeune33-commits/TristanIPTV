"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { ChannelCard } from "@/components/channel-card";
import { EmptyState } from "@/components/empty-state";
import { useList } from "@/lib/hooks";
import { itemToChannel } from "@/lib/adapter";

export default function CategoryPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { group: rawGroup } = use(params);
  const group = decodeURIComponent(rawGroup);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, error } = useList({
    group,
    q: query.trim() || undefined,
    page,
    pageSize: 60,
  });

  if (error) {
    return (
      <EmptyState
        title="Impossible de charger cette catégorie"
        description={error}
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
        <p className="text-xs uppercase tracking-[0.3em] text-muted mb-2">Catégorie</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">{group}</h1>
        {data ? (
          <p className="text-sm text-muted mt-2">
            {data.total} {data.total > 1 ? "items" : "item"}
          </p>
        ) : null}
      </header>

      {data && data.total > 12 ? (
        <div className="relative mb-8 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={`Filtrer dans ${group}…`}
            className="w-full bg-card border border-border rounded-full h-11 pl-9 pr-4 text-sm placeholder:text-muted focus:outline-none focus:border-foreground/40"
          />
        </div>
      ) : null}

      {loading && !data ? (
        <p className="text-muted">Chargement…</p>
      ) : data && data.items.length === 0 ? (
        <p className="text-muted">Aucun résultat.</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-8">
            {data.items.map((ch) => (
              <ChannelCard key={ch.id} channel={itemToChannel(ch)} />
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
