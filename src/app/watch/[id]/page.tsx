"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Heart, SkipBack, SkipForward, RotateCw, Play } from "lucide-react";
import { toast } from "sonner";
import { Player } from "@/components/player";
import { usePlaylistStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";
import { proxiedStreamUrl } from "@/lib/stream";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = use(params);
  const id = decodeURIComponent(rawId);
  const router = useRouter();

  const playlist = usePlaylistStore((s) => s.playlist);
  const m3uUrl = usePlaylistStore((s) => s.m3uUrl);
  const loading = usePlaylistStore((s) => s.loadingPlaylist);
  const isFav = usePlaylistStore((s) => s.favorites.includes(id));
  const toggleFav = usePlaylistStore((s) => s.toggleFavorite);
  const markWatched = usePlaylistStore((s) => s.markWatched);
  const history = usePlaylistStore((s) => s.watchHistory);
  const proxyStreams = usePlaylistStore((s) => s.proxyStreams);

  const channel = useMemo(
    () => playlist?.channels.find((c) => c.id === id),
    [playlist, id]
  );

  const isVod = channel?.type === "movie" || channel?.type === "series";
  const savedEntry = useMemo(
    () => history.find((h) => h.channelId === id),
    [history, id]
  );
  const savedPosition = savedEntry?.position;

  // Resume overlay state — reset on channel change via the render-time "reset
  // state when input changed" pattern instead of an effect.
  const [resumeChoice, setResumeChoice] = useState<"resume" | "restart" | null>(null);
  const [resumeForId, setResumeForId] = useState<string | null>(null);
  if (resumeForId !== id) {
    setResumeForId(id);
    setResumeChoice(null);
  }

  const needsResumePrompt = Boolean(
    isVod && savedPosition && savedPosition > 30
  );
  const showResumeOverlay = needsResumePrompt && resumeChoice === null;

  // Neighbouring channels: prev/next within the same group
  const { prevChannel, nextChannel, position, totalInGroup } = useMemo(() => {
    if (!channel || !playlist) {
      return { prevChannel: null, nextChannel: null, position: 0, totalInGroup: 0 };
    }
    const siblings = playlist.groups[channel.group] ?? [];
    const idx = siblings.findIndex((c) => c.id === channel.id);
    return {
      prevChannel: idx > 0 ? siblings[idx - 1] : siblings[siblings.length - 1],
      nextChannel: idx < siblings.length - 1 ? siblings[idx + 1] : siblings[0],
      position: idx + 1,
      totalInGroup: siblings.length,
    };
  }, [channel, playlist]);

  // For series episodes, prefer prev/next within the show
  const { prevEpisode, nextEpisode } = useMemo(() => {
    if (!channel || !playlist || channel.type !== "series" || !channel.seriesInfo) {
      return { prevEpisode: null, nextEpisode: null };
    }
    const show = playlist.shows[channel.seriesInfo.showSlug];
    if (!show) return { prevEpisode: null, nextEpisode: null };
    const idx = show.episodes.findIndex((e) => e.id === channel.id);
    return {
      prevEpisode: idx > 0 ? show.episodes[idx - 1] : null,
      nextEpisode: idx < show.episodes.length - 1 ? show.episodes[idx + 1] : null,
    };
  }, [channel, playlist]);

  // Mark as watched on first visit to a channel
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!channel) return;
    if (markedRef.current === channel.id) return;
    markedRef.current = channel.id;
    // Don't clobber saved position when just opening the page
    markWatched(channel.id, savedPosition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  // Throttled position save
  const lastSaveRef = useRef(0);
  function onTime(seconds: number, duration: number) {
    if (!channel) return;
    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;
    // Only persist position for VOD with known duration
    if (isVod && Number.isFinite(duration) && duration > 0) {
      markWatched(channel.id, seconds);
    } else {
      markWatched(channel.id);
    }
  }

  const goPrev = useCallback(() => {
    const target = prevEpisode ?? prevChannel;
    if (target) router.push(`/watch/${encodeURIComponent(target.id)}`);
  }, [prevEpisode, prevChannel, router]);

  const goNext = useCallback(() => {
    const target = nextEpisode ?? nextChannel;
    if (target) router.push(`/watch/${encodeURIComponent(target.id)}`);
  }, [nextEpisode, nextChannel, router]);

  // Keyboard shortcuts: prev/next/favorite
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === "ArrowRight" && !e.shiftKey) {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" && !e.shiftKey) {
        e.preventDefault();
        goPrev();
      } else if (e.key.toLowerCase() === "l" && channel) {
        e.preventDefault();
        toggleFav(channel.id);
        toast(isFav ? "Retiré des favoris" : "Ajouté aux favoris", {
          description: channel.name,
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, toggleFav, isFav, channel]);

  if (!m3uUrl) {
    return (
      <EmptyState
        title="Aucune playlist"
        description="Configure ton lien M3U pour pouvoir lire des chaînes."
        ctaLabel="Aller aux paramètres"
        ctaHref="/settings"
        icon="settings"
      />
    );
  }

  if (loading || !playlist) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="h-10 w-10 border-4 border-border border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!channel) {
    return (
      <EmptyState
        title="Chaîne introuvable"
        description="Cette chaîne n'existe plus dans la playlist actuelle."
        ctaLabel="Retour à l'accueil"
        ctaHref="/"
      />
    );
  }

  function onFavClick() {
    if (!channel) return;
    toggleFav(channel.id);
    toast(isFav ? "Retiré des favoris" : "Ajouté aux favoris", {
      description: channel.name,
    });
  }

  const showsSeriesNav = channel.type === "series" && channel.seriesInfo;
  const navTotal = showsSeriesNav
    ? playlist.shows[channel.seriesInfo!.showSlug]?.episodes.length ?? totalInGroup
    : totalInGroup;
  const navPos = showsSeriesNav
    ? (playlist.shows[channel.seriesInfo!.showSlug]?.episodes.findIndex(
        (e) => e.id === channel.id
      ) ?? -1) + 1
    : position;

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-30 p-4 md:p-6 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-10 w-10 grid place-items-center rounded-full bg-black/60 hover:bg-card-hover border border-border transition-colors"
          aria-label="Retour"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="flex items-center gap-3 min-w-0 max-w-md">
          {channel.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={channel.logo}
              alt=""
              referrerPolicy="no-referrer"
              className="h-9 w-9 rounded-md object-contain bg-card p-1"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {channel.name}
              {channel.isFrench ? (
                <span className="ml-2 text-[10px] text-[var(--accent)] font-mono">FR</span>
              ) : null}
            </p>
            <p className="text-xs text-muted truncate">
              {showsSeriesNav ? (
                <Link
                  href={`/series/${encodeURIComponent(channel.seriesInfo!.showSlug)}`}
                  className="hover:text-foreground transition-colors"
                >
                  Série · {channel.seriesInfo!.show}
                </Link>
              ) : (
                channel.group
              )}
              {navTotal > 0 ? ` · ${navPos}/${navTotal}` : ""}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={!prevChannel && !prevEpisode}
            aria-label={showsSeriesNav ? "Épisode précédent" : "Chaîne précédente"}
            className="h-10 w-10 grid place-items-center rounded-full border border-border bg-black/60 hover:bg-card-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={showsSeriesNav ? "Épisode précédent (←)" : "Précédente (←)"}
          >
            <SkipBack size={16} />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!nextChannel && !nextEpisode}
            aria-label={showsSeriesNav ? "Épisode suivant" : "Chaîne suivante"}
            className="h-10 w-10 grid place-items-center rounded-full border border-border bg-black/60 hover:bg-card-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={showsSeriesNav ? "Épisode suivant (→)" : "Suivante (→)"}
          >
            <SkipForward size={16} />
          </button>

          <button
            type="button"
            onClick={onFavClick}
            aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
            className={`h-10 w-10 grid place-items-center rounded-full border transition-colors ${
              isFav
                ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
                : "border-border bg-black/60 hover:bg-card-hover"
            }`}
            title="Favori (L)"
          >
            <Heart size={16} fill={isFav ? "currentColor" : "none"} />
          </button>

          <Link
            href="/"
            className="h-10 px-4 grid place-items-center rounded-full border border-border bg-black/60 hover:bg-card-hover transition-colors text-sm"
          >
            Accueil
          </Link>
        </div>
      </div>

      <div className="flex-1">
        {/* Resume overlay covers the player until user chooses */}
        {showResumeOverlay && savedPosition ? (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/85 backdrop-blur-sm">
            <div className="max-w-md w-full text-center px-6">
              <p className="text-sm text-muted uppercase tracking-widest mb-2">
                Reprendre la lecture ?
              </p>
              <h2 className="text-2xl md:text-3xl font-black mb-1 truncate">
                {channel.name}
              </h2>
              <p className="text-muted text-sm mb-6">
                Tu t&apos;es arrêté à {formatTime(savedPosition)}.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setResumeChoice("resume")}
                  className="inline-flex items-center gap-2 h-12 px-6 rounded-md bg-foreground text-background font-semibold hover:bg-foreground/85 transition-colors"
                >
                  <Play size={16} fill="currentColor" />
                  Reprendre à {formatTime(savedPosition)}
                </button>
                <button
                  type="button"
                  onClick={() => setResumeChoice("restart")}
                  className="inline-flex items-center gap-2 h-12 px-6 rounded-md border border-border bg-card hover:bg-card-hover transition-colors text-sm"
                >
                  <RotateCw size={14} />
                  Recommencer depuis le début
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Render player as soon as we know we don't need to prompt, or once a choice was made */}
        {!needsResumePrompt || resumeChoice !== null ? (
          <Player
            key={`${channel.id}-${resumeChoice ?? "auto"}-${proxyStreams ? "p" : "d"}`}
            src={proxyStreams ? proxiedStreamUrl(channel.url) : channel.url}
            poster={channel.logo}
            startTime={resumeChoice === "resume" ? savedPosition : undefined}
            isVod={isVod}
            onTimeUpdate={onTime}
          />
        ) : null}
      </div>
    </div>
  );
}
