"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Layers } from "lucide-react";
import { usePlaylistStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";
import { getFallbackGradient } from "@/lib/colors";

export default function BrowsePage() {
  const meta = usePlaylistStore((s) => s.meta);
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    if (!meta) return [];
    if (!query.trim()) return meta.groups;
    const q = query.toLowerCase();
    return meta.groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [meta, query]);

  if (!meta) {
    return (
      <EmptyState
        title="Catalogue non chargé"
        description="Configure ton lien M3U pour parcourir les catégories."
        ctaLabel="Aller aux paramètres"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-8 py-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-muted mb-2">Parcourir</p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-1">
          {meta.totalGroups} catégories
        </h1>
        <p className="text-sm text-muted">{meta.totalChannels} entrées au total</p>
      </header>

      <div className="relative mb-8 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer les catégories…"
          className="w-full bg-card border border-border rounded-full h-11 pl-9 pr-4 text-sm placeholder:text-muted focus:outline-none focus:border-foreground/40"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {groups.map((g) => (
          <Link
            key={g.name}
            href={`/category/${encodeURIComponent(g.name)}`}
            className="group relative aspect-[5/3] rounded-xl overflow-hidden border border-border hover:border-foreground/30 transition-all"
            style={{ background: getFallbackGradient(g.name) }}
          >
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
            <div className="relative h-full p-4 flex flex-col justify-end">
              <Layers size={20} className="text-white/70 mb-auto self-end" />
              <h3 className="text-lg font-semibold text-white drop-shadow line-clamp-2">
                {g.name}
              </h3>
              <p className="text-xs text-white/80 mt-1">
                {g.count} {g.count > 1 ? "items" : "item"}
                {g.isFrench ? " · 🇫🇷" : ""}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
