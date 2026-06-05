"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, SkipBack, SkipForward, RotateCw, Play, Home as HomeIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Player } from "@/components/player";
import { usePlaylistStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";
import { detectStreamType, proxiedStreamUrl, type StreamType } from "@/lib/stream";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const AUTOPLAY_COUNTDOWN_SECONDS = 7;

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
  const preferredAudio = usePlaylistStore((s) => s.preferredAudio);
  const subtitleMode = usePlaylistStore((s) => s.subtitleMode);

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

  // Resume overlay — reset on id change via render-time pattern
  const [resumeChoice, setResumeChoice] = useState<"resume" | "restart" | null>(null);
  const [resumeForId, setResumeForId] = useState<string | null>(null);
  if (resumeForId !== id) {
    setResumeForId(id);
    setResumeChoice(null);
  }

  // Local overrides triggered by the player's error UI (try without proxy /
  // force the HLS engine). Reset on channel change.
  const [overrideProxy, setOverrideProxy] = useState<boolean | null>(null);
  const [overrideStreamType, setOverrideStreamType] = useState<StreamType | null>(null);
  const [overrideForId, setOverrideForId] = useState<string | null>(null);
  if (overrideForId !== id) {
    setOverrideForId(id);
    setOverrideProxy(null);
    setOverrideStreamType(null);
  }
  const effectiveProxy = overrideProxy ?? proxyStreams;
  const computedStreamType = channel
    ? detectStreamType(channel.url, !isVod)
    : "hls";
  const effectiveStreamType = overrideStreamType ?? computedStreamType;

  const needsResumePrompt = Boolean(isVod && savedPosition && savedPosition > 30);
  const showResumeOverlay = needsResumePrompt && resumeChoice === null;

  // Group neighbours (live)
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

  // For series, prev/next is across the show's episodes
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

  // Mark as watched on first visit
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!channel) return;
    if (markedRef.current === channel.id) return;
    markedRef.current = channel.id;
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

  // --- Autoplay next episode for series ---
  const [autoplayActive, setAutoplayActive] = useState(false);
  const [autoplaySeconds, setAutoplaySeconds] = useState(AUTOPLAY_COUNTDOWN_SECONDS);

  // Reset autoplay state when channel changes (render-time pattern)
  const [autoplayForId, setAutoplayForId] = useState<string | null>(null);
  if (autoplayForId !== id) {
    setAutoplayForId(id);
    setAutoplayActive(false);
    setAutoplaySeconds(AUTOPLAY_COUNTDOWN_SECONDS);
  }

  function startAutoplayCountdown() {
    if (!nextEpisode) return;
    setAutoplaySeconds(AUTOPLAY_COUNTDOWN_SECONDS);
    setAutoplayActive(true);
  }

  useEffect(() => {
    if (!autoplayActive || !nextEpisode) return;
    if (autoplaySeconds <= 0) {
      router.push(`/watch/${encodeURIComponent(nextEpisode.id)}`);
      return;
    }
    const id = window.setTimeout(() => setAutoplaySeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [autoplayActive, autoplaySeconds, nextEpisode, router]);

  function onPlayerEnded() {
    // Auto-advance only inside a series and if there's a next episode
    if (channel?.type === "series" && nextEpisode) {
      startAutoplayCountdown();
    }
  }

  // Keyboard shortcuts
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
        // Only when not typing — already filtered above. Toggle favorite.
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
  const totalEpisodes = showsSeriesNav
    ? playlist.shows[channel.seriesInfo!.showSlug]?.episodes.length ?? totalInGroup
    : totalInGroup;
  const episodeNumber = showsSeriesNav
    ? (playlist.shows[channel.seriesInfo!.showSlug]?.episodes.findIndex(
        (e) => e.id === channel.id
      ) ?? -1) + 1
    : position;

  const seasonLabel = channel.seriesInfo?.season
    ? `S${String(channel.seriesInfo.season).padStart(2, "0")}`
    : "";
  const epLabel = channel.seriesInfo?.episode
    ? `E${String(channel.seriesInfo.episode).padStart(2, "0")}`
    : "";

  const playerTitle = channel.name;
  const playerSubtitle = showsSeriesNav
    ? `${channel.seriesInfo!.show} · ${seasonLabel}${epLabel} · ${channel.group}`
    : `${channel.group}${totalEpisodes > 0 ? ` · ${episodeNumber}/${totalEpisodes}` : ""}${
        channel.isFrench ? " · 🇫🇷" : ""
      }`;

  const topActions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={goPrev}
        disabled={!prevChannel && !prevEpisode}
        aria-label={showsSeriesNav ? "Épisode précédent" : "Chaîne précédente"}
        className="h-10 w-10 grid place-items-center rounded-full bg-black/50 hover:bg-black/70 border border-white/15 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title="Précédent (←)"
      >
        <SkipBack size={16} />
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={!nextChannel && !nextEpisode}
        aria-label={showsSeriesNav ? "Épisode suivant" : "Chaîne suivante"}
        className="h-10 w-10 grid place-items-center rounded-full bg-black/50 hover:bg-black/70 border border-white/15 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title="Suivant (→)"
      >
        <SkipForward size={16} />
      </button>
      <button
        type="button"
        onClick={onFavClick}
        aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
        title="Favori (L)"
        className={`h-10 w-10 grid place-items-center rounded-full border transition-colors ${
          isFav
            ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
            : "border-white/15 bg-black/50 hover:bg-black/70 text-white"
        }`}
      >
        <Heart size={16} fill={isFav ? "currentColor" : "none"} />
      </button>
      <Link
        href="/"
        aria-label="Accueil"
        title="Accueil"
        className="h-10 w-10 grid place-items-center rounded-full bg-black/50 hover:bg-black/70 border border-white/15 text-white transition-colors"
      >
        <HomeIcon size={16} />
      </Link>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black">
      <div className="absolute inset-0">
        {/* Resume overlay */}
        {showResumeOverlay && savedPosition ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/85 backdrop-blur-sm">
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
            key={`${channel.id}-${resumeChoice ?? "auto"}-${effectiveProxy ? "p" : "d"}-${effectiveStreamType}`}
            src={effectiveProxy ? proxiedStreamUrl(channel.url) : channel.url}
            streamType={effectiveStreamType}
            codecHint={`${channel.name} ${channel.group}`}
            langVariant={channel.langVariant}
            preferredAudio={preferredAudio}
            subtitleMode={subtitleMode}
            poster={channel.logo}
            startTime={resumeChoice === "resume" ? savedPosition : undefined}
            isVod={isVod}
            title={playerTitle}
            subtitle={playerSubtitle}
            onBack={() => router.back()}
            topActions={topActions}
            onTimeUpdate={onTime}
            onEnded={onPlayerEnded}
            onTryDirect={() => {
              setOverrideProxy(!effectiveProxy);
              toast(
                effectiveProxy
                  ? "Tentative directe (sans proxy)…"
                  : "Tentative via proxy…"
              );
            }}
            onForceHls={() => {
              setOverrideStreamType("hls");
              toast("Tentative avec moteur HLS…");
            }}
          />
        ) : null}

        {/* Autoplay next episode overlay */}
        {autoplayActive && nextEpisode ? (
          <div className="absolute bottom-4 right-4 md:bottom-8 md:right-8 z-40 max-w-md w-[calc(100%-2rem)] md:w-[26rem]">
            <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 md:p-5">
              <div className="flex items-start gap-3">
                {nextEpisode.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={nextEpisode.logo}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-16 w-24 rounded-md object-cover bg-background shrink-0"
                  />
                ) : (
                  <div className="h-16 w-24 rounded-md bg-background shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--accent)] font-bold mb-1">
                    Épisode suivant dans {autoplaySeconds}…
                  </p>
                  <p className="text-sm font-semibold truncate">{nextEpisode.name}</p>
                  <p className="text-xs text-muted truncate">
                    {nextEpisode.seriesInfo?.season
                      ? `S${String(nextEpisode.seriesInfo.season).padStart(2, "0")}`
                      : ""}
                    {nextEpisode.seriesInfo?.episode
                      ? ` E${String(nextEpisode.seriesInfo.episode).padStart(2, "0")}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoplayActive(false)}
                  aria-label="Annuler"
                  className="h-8 w-8 grid place-items-center rounded-full hover:bg-card-hover text-muted hover:text-foreground transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/watch/${encodeURIComponent(nextEpisode.id)}`)}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-md bg-foreground text-background font-semibold hover:bg-foreground/85 transition-colors text-sm"
                >
                  <Play size={14} fill="currentColor" />
                  Lecture immédiate
                </button>
                <button
                  type="button"
                  onClick={() => setAutoplayActive(false)}
                  className="h-10 px-4 rounded-md border border-border text-muted hover:text-foreground hover:bg-card-hover transition-colors text-sm"
                >
                  Annuler
                </button>
              </div>
              {/* Progress bar of the countdown */}
              <div className="mt-3 h-1 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] transition-[width] duration-1000 linear"
                  style={{
                    width: `${
                      ((AUTOPLAY_COUNTDOWN_SECONDS - autoplaySeconds) /
                        AUTOPLAY_COUNTDOWN_SECONDS) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
