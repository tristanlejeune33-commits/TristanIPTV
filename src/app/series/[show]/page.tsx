"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Play, Tv } from "lucide-react";
import { usePlaylistStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";
import { ChannelThumbnail } from "@/components/channel-thumbnail";
import type { Channel } from "@/lib/m3u-parser";

export default function ShowPage({
  params,
}: {
  params: Promise<{ show: string }>;
}) {
  const { show: rawShow } = use(params);
  const showSlug = decodeURIComponent(rawShow);
  const playlist = usePlaylistStore((s) => s.playlist);
  const history = usePlaylistStore((s) => s.watchHistory);

  const show = playlist?.shows[showSlug];

  const seasons = useMemo(() => {
    if (!show) return [];
    const map = new Map<number | "unknown", Channel[]>();
    for (const ep of show.episodes) {
      const key = ep.seriesInfo?.season ?? "unknown";
      const arr = map.get(key) ?? [];
      arr.push(ep);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "unknown") return 1;
      if (b[0] === "unknown") return -1;
      return (a[0] as number) - (b[0] as number);
    });
  }, [show]);

  // Last watched episode for the "Continue" CTA — hooks must run unconditionally
  const lastWatched = useMemo(() => {
    if (!show) return null;
    const ids = new Set(show.episodes.map((e) => e.id));
    return history.find((h) => ids.has(h.channelId)) ?? null;
  }, [history, show]);

  if (!playlist) {
    return (
      <EmptyState
        title="Playlist non chargée"
        description="Configure ton lien M3U pour voir cette série."
        ctaLabel="Aller aux paramètres"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  if (!show) {
    return (
      <EmptyState
        title="Série introuvable"
        description="Cette série n'est pas (ou plus) dans ta playlist."
        ctaLabel="Toutes les séries"
        ctaHref="/series"
      />
    );
  }

  const firstEpisode = show.episodes[0];
  const continueEpisode = lastWatched
    ? show.episodes.find((e) => e.id === lastWatched.channelId) ?? firstEpisode
    : firstEpisode;

  return (
    <div className="pb-20">
      {/* Hero */}
      <section className="relative h-[42vh] min-h-[320px] w-full overflow-hidden">
        <div className="absolute inset-0">
          {firstEpisode.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={firstEpisode.logo}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-25 scale-125"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a0e0e] via-[#0a0a0a] to-[#0a0a0a]" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>

        <div className="relative h-full mx-auto max-w-[1600px] px-4 md:px-12 flex items-end pb-10">
          <Link
            href="/series"
            className="absolute top-6 left-4 md:left-12 inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            Toutes les séries
          </Link>

          <div className="flex items-end gap-6 max-w-4xl">
            <div className="hidden md:block w-32 h-44 rounded-xl overflow-hidden border border-border shrink-0 shadow-2xl">
              <ChannelThumbnail channel={firstEpisode} className="w-full h-full" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="uppercase tracking-[0.3em] text-xs text-[var(--accent)] font-semibold mb-2">
                Série · {show.group}
                {show.isFrench ? " · 🇫🇷 Français" : ""}
              </p>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-3">
                {show.show}
              </h1>
              <p className="text-muted mb-6 flex items-center gap-2 text-sm">
                <Tv size={14} />
                {show.episodes.length} épisode{show.episodes.length > 1 ? "s" : ""}
                {seasons.length > 1
                  ? ` · ${seasons.length} saisons`
                  : ""}
              </p>

              <Link
                href={`/watch/${encodeURIComponent(continueEpisode.id)}`}
                className="inline-flex items-center gap-2 h-12 px-7 rounded-md bg-foreground text-background font-semibold hover:bg-foreground/85 transition-colors"
              >
                <Play size={18} fill="currentColor" />
                {lastWatched ? "Reprendre" : "Lecture"}
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  {continueEpisode.seriesInfo?.season
                    ? `S${String(continueEpisode.seriesInfo.season).padStart(2, "0")}`
                    : ""}
                  {continueEpisode.seriesInfo?.episode
                    ? ` E${String(continueEpisode.seriesInfo.episode).padStart(2, "0")}`
                    : ""}
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Episodes by season */}
      <div className="mx-auto max-w-[1600px] px-4 md:px-8 mt-8">
        {seasons.map(([season, episodes]) => (
          <section key={String(season)} className="mb-10">
            <h2 className="text-xl font-bold mb-4">
              {season === "unknown" ? "Épisodes" : `Saison ${season}`}
              <span className="text-sm text-muted font-normal ml-2">
                · {episodes.length} épisode{episodes.length > 1 ? "s" : ""}
              </span>
            </h2>

            <div className="space-y-2">
              {episodes.map((ep, idx) => {
                const watchedEntry = history.find((h) => h.channelId === ep.id);
                return (
                  <Link
                    key={ep.id}
                    href={`/watch/${encodeURIComponent(ep.id)}`}
                    className="group flex items-center gap-4 p-3 rounded-lg border border-border bg-card hover:bg-card-hover transition-colors"
                  >
                    <div className="w-28 md:w-40 aspect-video rounded-md overflow-hidden shrink-0 border border-border">
                      <ChannelThumbnail channel={ep} className="w-full h-full" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <span className="text-muted font-mono text-xs">
                          {ep.seriesInfo?.episode
                            ? `E${String(ep.seriesInfo.episode).padStart(2, "0")}`
                            : `#${idx + 1}`}
                        </span>
                        <span className="truncate">{ep.name}</span>
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {ep.group}
                        {watchedEntry ? (
                          <span className="ml-2 text-[var(--accent)]">
                            · Déjà vu
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <div className="h-10 w-10 grid place-items-center rounded-full bg-foreground text-background opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play size={14} fill="currentColor" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
