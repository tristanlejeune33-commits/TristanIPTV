"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Heart, SkipBack, SkipForward, RotateCw, Play, Home as HomeIcon } from "lucide-react";
import { toast } from "sonner";
import { Player } from "@/components/player";
import { usePlaylistStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";
import { detectStreamType, proxiedStreamUrl, type StreamType } from "@/lib/stream";
import { useShow, useStream } from "@/lib/hooks";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const AUTOPLAY_COUNTDOWN_SECONDS = 7;

const SuspenseFallback = (
  <div className="fixed inset-0 bg-black grid place-items-center">
    <div className="h-10 w-10 border-4 border-border border-t-[var(--accent)] rounded-full animate-spin" />
  </div>
);

export default function WatchPageWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = use(params);
  const id = decodeURIComponent(rawId);

  // useSearchParams() in WatchPage requires a Suspense boundary on Next.js
  // 15+ otherwise the route 500s during SSR. Resolving params at the wrapper
  // level avoids double-suspending and surfaces errors closer to the source.
  return (
    <Suspense fallback={SuspenseFallback}>
      <WatchPage id={id} />
    </Suspense>
  );
}

function WatchPage({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const isFav = usePlaylistStore((s) => s.favorites.includes(id));
  const toggleFav = usePlaylistStore((s) => s.toggleFavorite);
  const markWatched = usePlaylistStore((s) => s.markWatched);
  const history = usePlaylistStore((s) => s.watchHistory);
  const proxyStreams = usePlaylistStore((s) => s.proxyStreams);
  const globalAudio = usePlaylistStore((s) => s.preferredAudio);
  const globalSubs = usePlaylistStore((s) => s.subtitleMode);

  const audioParam = searchParams.get("audio");
  const subsParam = searchParams.get("subs");
  const preferredAudio: "fr" | "original" =
    audioParam === "fr" || audioParam === "original" ? audioParam : globalAudio;
  const subtitleMode: "off" | "auto" | "always-fr" =
    subsParam === "off" || subsParam === "auto" || subsParam === "always-fr"
      ? subsParam
      : globalSubs;

  const streamState = useStream(id);
  const channel = streamState.data;

  const isVod = channel?.type === "movie" || channel?.type === "series";
  const savedEntry = useMemo(
    () => history.find((h) => h.channelId === id),
    [history, id]
  );
  const savedPosition = savedEntry?.position;

  // Show details for series-specific prev/next + autoplay
  const showSlug = channel?.showSlug ?? null;
  const showState = useShow(showSlug ?? null);
  const show = showState.data;

  const { prevEpisode, nextEpisode } = useMemo(() => {
    if (!channel || !show) return { prevEpisode: null, nextEpisode: null };
    const idx = show.episodes.findIndex((e) => e.id === channel.id);
    if (idx === -1) return { prevEpisode: null, nextEpisode: null };
    return {
      prevEpisode: idx > 0 ? show.episodes[idx - 1] : null,
      nextEpisode: idx < show.episodes.length - 1 ? show.episodes[idx + 1] : null,
    };
  }, [channel, show]);

  // Resume overlay
  const [resumeChoice, setResumeChoice] = useState<"resume" | "restart" | null>(null);
  const [resumeForId, setResumeForId] = useState<string | null>(null);
  if (resumeForId !== id) {
    setResumeForId(id);
    setResumeChoice(null);
  }

  const needsResumePrompt = Boolean(isVod && savedPosition && savedPosition > 30);
  const showResumeOverlay = needsResumePrompt && resumeChoice === null;

  // Mark watched
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!channel) return;
    if (markedRef.current === channel.id) return;
    markedRef.current = channel.id;
    markWatched(channel.id, savedPosition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const lastSaveRef = useRef(0);
  function onTime(seconds: number, duration: number) {
    if (!channel) return;
    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;
    if (isVod && Number.isFinite(duration) && duration > 0) {
      markWatched(channel.id, seconds, duration);
    } else {
      markWatched(channel.id);
    }
  }

  const goPrev = useCallback(() => {
    if (prevEpisode) router.push(`/watch/${encodeURIComponent(prevEpisode.id)}`);
  }, [prevEpisode, router]);

  const goNext = useCallback(() => {
    if (nextEpisode) router.push(`/watch/${encodeURIComponent(nextEpisode.id)}`);
  }, [nextEpisode, router]);

  // Autoplay next episode
  const [autoplayActive, setAutoplayActive] = useState(false);
  const [autoplaySeconds, setAutoplaySeconds] = useState(AUTOPLAY_COUNTDOWN_SECONDS);
  const [autoplayForId, setAutoplayForId] = useState<string | null>(null);
  if (autoplayForId !== id) {
    setAutoplayForId(id);
    setAutoplayActive(false);
    setAutoplaySeconds(AUTOPLAY_COUNTDOWN_SECONDS);
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
    if (channel?.type === "series" && nextEpisode) {
      setAutoplaySeconds(AUTOPLAY_COUNTDOWN_SECONDS);
      setAutoplayActive(true);
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
        e.preventDefault();
        toggleFav(channel.id);
        toast(isFav ? "Retiré des favoris" : "Ajouté aux favoris", {
          description: channel.displayName,
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, toggleFav, isFav, channel]);

  if (streamState.loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="h-10 w-10 border-4 border-border border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    );
  }

  if (streamState.error || !channel) {
    return (
      <EmptyState
        title="Chaîne introuvable"
        description={streamState.error ?? "Cette chaîne n'existe plus dans ton catalogue."}
        ctaLabel="Retour à l'accueil"
        ctaHref="/"
      />
    );
  }

  const streamType: StreamType = detectStreamType(channel.url, !isVod);
  const playerTitle = channel.displayName;
  const seasonLabel = channel.season ? `S${String(channel.season).padStart(2, "0")}` : "";
  const epLabel = channel.episode ? `E${String(channel.episode).padStart(2, "0")}` : "";
  const playerSubtitle = channel.showSlug
    ? `${channel.episodeTitle ?? channel.displayName} · ${seasonLabel}${epLabel} · ${channel.group}`
    : `${channel.group}${channel.isFrench ? " · 🇫🇷" : ""}`;

  function onFavClick() {
    if (!channel) return;
    toggleFav(channel.id);
    toast(isFav ? "Retiré des favoris" : "Ajouté aux favoris", {
      description: channel.displayName,
    });
  }

  const topActions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={goPrev}
        disabled={!prevEpisode}
        className="h-10 w-10 grid place-items-center rounded-full bg-black/50 hover:bg-black/70 border border-white/15 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <SkipBack size={16} />
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={!nextEpisode}
        className="h-10 w-10 grid place-items-center rounded-full bg-black/50 hover:bg-black/70 border border-white/15 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <SkipForward size={16} />
      </button>
      <button
        type="button"
        onClick={onFavClick}
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
        className="h-10 w-10 grid place-items-center rounded-full bg-black/50 hover:bg-black/70 border border-white/15 text-white transition-colors"
      >
        <HomeIcon size={16} />
      </Link>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black">
      <div className="absolute inset-0">
        {showResumeOverlay && savedPosition ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/85 backdrop-blur-sm">
            <div className="max-w-md w-full text-center px-6">
              <p className="text-sm text-muted uppercase tracking-widest mb-2">Reprendre la lecture ?</p>
              <h2 className="text-2xl md:text-3xl font-black mb-1 truncate">{channel.displayName}</h2>
              <p className="text-muted text-sm mb-6">Tu t&apos;es arrêté à {formatTime(savedPosition)}.</p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setResumeChoice("resume")}
                  className="inline-flex items-center gap-2 h-12 px-6 rounded-md bg-foreground text-background font-semibold hover:bg-foreground/85 transition-colors"
                >
                  <Play size={16} fill="currentColor" /> Reprendre
                </button>
                <button
                  type="button"
                  onClick={() => setResumeChoice("restart")}
                  className="inline-flex items-center gap-2 h-12 px-6 rounded-md border border-border bg-card hover:bg-card-hover transition-colors text-sm"
                >
                  <RotateCw size={14} /> Recommencer
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!needsResumePrompt || resumeChoice !== null ? (
          <Player
            key={`${channel.id}-${resumeChoice ?? "auto"}`}
            src={proxyStreams ? proxiedStreamUrl(channel.url) : channel.url}
            streamType={streamType}
            codecHint={`${channel.name} ${channel.group}`}
            langVariant={channel.langVariant as never}
            preferredAudio={preferredAudio}
            subtitleMode={subtitleMode}
            poster={channel.logo ?? undefined}
            startTime={resumeChoice === "resume" ? savedPosition : undefined}
            isVod={isVod}
            title={playerTitle}
            subtitle={playerSubtitle}
            onBack={() => router.back()}
            topActions={topActions}
            onTimeUpdate={onTime}
            onEnded={onPlayerEnded}
          />
        ) : null}

        {autoplayActive && nextEpisode ? (
          <div className="absolute bottom-4 right-4 z-40 max-w-md w-[calc(100%-2rem)] md:w-[26rem]">
            <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 md:p-5">
              <p className="text-[10px] uppercase tracking-widest text-[var(--accent)] font-bold mb-1">
                Épisode suivant dans {autoplaySeconds}…
              </p>
              <p className="text-sm font-semibold truncate">{nextEpisode.displayName}</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/watch/${encodeURIComponent(nextEpisode.id)}`)}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-md bg-foreground text-background font-semibold hover:bg-foreground/85 transition-colors text-sm"
                >
                  <Play size={14} fill="currentColor" /> Lecture immédiate
                </button>
                <button
                  type="button"
                  onClick={() => setAutoplayActive(false)}
                  className="h-10 px-4 rounded-md border border-border text-muted hover:text-foreground hover:bg-card-hover transition-colors text-sm"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
