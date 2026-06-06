"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Heart, Radio, Film, Tv } from "lucide-react";
import { ChannelCard } from "@/components/channel-card";
import { usePlaylistStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";
import { useChannelsByIds } from "@/lib/hooks";
import { itemToChannel } from "@/lib/adapter";

type Tab = "all" | "live" | "movies" | "series";

export default function FavoritesPage() {
  const favorites = usePlaylistStore((s) => s.favorites);
  const [tab, setTab] = useState<Tab>("all");

  const { data: items, loading } = useChannelsByIds(favorites);

  const grouped = useMemo(() => {
    const list = items ?? [];
    return {
      all: list,
      live: list.filter((c) => c.type === "live"),
      movies: list.filter((c) => c.type === "movie"),
      series: list.filter((c) => c.type === "series"),
    };
  }, [items]);

  if (favorites.length === 0) {
    return (
      <EmptyState
        title="Aucun favori pour l'instant"
        description="Clique sur le cœur d'une carte pour l'ajouter à tes favoris."
        ctaLabel="Parcourir le catalogue"
        ctaHref="/"
      />
    );
  }

  if (loading && !items) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="h-10 w-10 border-4 border-border border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "all", label: "Tous", icon: <Heart size={14} />, count: grouped.all.length },
    { id: "live", label: "Chaînes", icon: <Radio size={14} />, count: grouped.live.length },
    { id: "movies", label: "Films", icon: <Film size={14} />, count: grouped.movies.length },
    { id: "series", label: "Séries", icon: <Tv size={14} />, count: grouped.series.length },
  ];

  const visible = grouped[tab];

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-8 py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)] mb-2">
          Mes favoris
        </p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          {grouped.all.length} {grouped.all.length > 1 ? "contenus épinglés" : "contenu épinglé"}
        </h1>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-8 border-b border-border pb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            disabled={t.count === 0 && t.id !== "all"}
            className={`flex items-center gap-2 h-10 px-4 rounded-full text-sm font-medium transition-colors border ${
              tab === t.id
                ? "bg-foreground text-background border-foreground"
                : "bg-card border-border text-muted hover:text-foreground disabled:opacity-30"
            }`}
          >
            {t.icon}
            {t.label}
            <span
              className={`text-[10px] font-mono ${
                tab === t.id ? "text-background/70" : "text-muted"
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-muted">Aucun favori dans cette catégorie.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-8">
          {visible.map((c) => (
            <ChannelCard
              key={c.id}
              channel={itemToChannel(c)}
              posterStyle={c.type === "movie"}
            />
          ))}
        </div>
      )}

      <div className="mt-12 text-center">
        <Link
          href="/"
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          Retour à l'accueil →
        </Link>
      </div>
    </div>
  );
}
