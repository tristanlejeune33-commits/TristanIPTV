"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Heart, Radio, Film, Tv } from "lucide-react";
import { ChannelCard } from "@/components/channel-card";
import { ShowCard } from "@/components/show-card";
import { usePlaylistStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";

type Tab = "all" | "live" | "movies" | "series";

export default function FavoritesPage() {
  const playlist = usePlaylistStore((s) => s.playlist);
  const favorites = usePlaylistStore((s) => s.favorites);
  const [tab, setTab] = useState<Tab>("all");

  const favChannels = useMemo(() => {
    if (!playlist) return [];
    return favorites
      .map((id) => playlist.channels.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
  }, [playlist, favorites]);

  const liveFavs = useMemo(() => favChannels.filter((c) => c.type === "live"), [favChannels]);
  const movieFavs = useMemo(() => favChannels.filter((c) => c.type === "movie"), [favChannels]);
  const seriesEpFavs = useMemo(
    () => favChannels.filter((c) => c.type === "series"),
    [favChannels]
  );

  // For series, regroup episodes by show (so we show 1 card per show, not 1 per episode)
  const favoriteShows = useMemo(() => {
    if (!playlist) return [];
    const showSlugs = new Set<string>();
    for (const ep of seriesEpFavs) {
      const slug = ep.seriesInfo?.showSlug;
      if (slug) showSlugs.add(slug);
    }
    return Array.from(showSlugs)
      .map((slug) => playlist.shows[slug])
      .filter(Boolean);
  }, [playlist, seriesEpFavs]);

  if (!playlist) {
    return (
      <EmptyState
        title="Playlist non chargée"
        description="Configure ton lien M3U pour gérer tes favoris."
        ctaLabel="Aller aux paramètres"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  if (favChannels.length === 0) {
    return (
      <EmptyState
        title="Aucun favori pour l'instant"
        description="Clique sur le cœur sur une chaîne, un film ou une série pour l'ajouter à tes favoris."
        ctaLabel="Parcourir le catalogue"
        ctaHref="/"
      />
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "all", label: "Tous", icon: <Heart size={14} />, count: favChannels.length },
    { id: "live", label: "Chaînes TV", icon: <Radio size={14} />, count: liveFavs.length },
    { id: "movies", label: "Films", icon: <Film size={14} />, count: movieFavs.length },
    { id: "series", label: "Séries", icon: <Tv size={14} />, count: favoriteShows.length },
  ];

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-8 py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)] mb-2">
          Mes favoris
        </p>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          {favChannels.length} contenu{favChannels.length > 1 ? "s" : ""} épinglé
          {favChannels.length > 1 ? "s" : ""}
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
                : "bg-card border-border text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
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

      {tab === "all" || tab === "live" ? (
        liveFavs.length > 0 ? (
          <Section
            title="Chaînes TV"
            href="/live"
            count={liveFavs.length}
            icon={<Radio size={16} />}
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-8">
              {liveFavs.map((c) => (
                <ChannelCard key={c.id} channel={c} />
              ))}
            </div>
          </Section>
        ) : tab === "live" ? (
          <p className="text-muted">Aucune chaîne TV dans tes favoris.</p>
        ) : null
      ) : null}

      {tab === "all" || tab === "movies" ? (
        movieFavs.length > 0 ? (
          <Section
            title="Films"
            href="/movies"
            count={movieFavs.length}
            icon={<Film size={16} />}
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-3 gap-y-6">
              {movieFavs.map((c) => (
                <ChannelCard key={c.id} channel={c} posterStyle />
              ))}
            </div>
          </Section>
        ) : tab === "movies" ? (
          <p className="text-muted">Aucun film dans tes favoris.</p>
        ) : null
      ) : null}

      {tab === "all" || tab === "series" ? (
        favoriteShows.length > 0 ? (
          <Section
            title="Séries"
            href="/series"
            count={favoriteShows.length}
            icon={<Tv size={16} />}
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
              {favoriteShows.map((s) => (
                <ShowCard key={s.showSlug} show={s} />
              ))}
            </div>
          </Section>
        ) : tab === "series" ? (
          <p className="text-muted">Aucune série dans tes favoris.</p>
        ) : null
      ) : null}
    </div>
  );
}

function Section({
  title,
  href,
  count,
  icon,
  children,
}: {
  title: string;
  href: string;
  count: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          {icon}
          {title}
          <span className="text-xs font-mono text-muted ml-1">{count}</span>
        </h2>
        <Link
          href={href}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          Voir tout →
        </Link>
      </div>
      {children}
    </section>
  );
}
