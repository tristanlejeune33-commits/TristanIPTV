"use client";

import { use, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Heart, SkipBack, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Player } from "@/components/player";
import { usePlaylistStore } from "@/lib/store";
import { EmptyState } from "@/components/empty-state";

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

  const channel = useMemo(
    () => playlist?.channels.find((c) => c.id === id),
    [playlist, id]
  );

  // Neighbouring channels for prev/next in the same category
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

  // Mark as watched on mount of a new channel
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!channel) return;
    if (markedRef.current === channel.id) return;
    markedRef.current = channel.id;
    markWatched(channel.id);
  }, [channel, markWatched]);

  // Throttled position save
  const lastSaveRef = useRef(0);
  function onTime(seconds: number) {
    if (!channel) return;
    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;
    markWatched(channel.id, seconds);
  }

  const goPrev = useCallback(() => {
    if (prevChannel) router.push(`/watch/${encodeURIComponent(prevChannel.id)}`);
  }, [prevChannel, router]);

  const goNext = useCallback(() => {
    if (nextChannel) router.push(`/watch/${encodeURIComponent(nextChannel.id)}`);
  }, [nextChannel, router]);

  // Keyboard shortcuts for prev/next + favorite
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
            <p className="text-sm font-semibold truncate">{channel.name}</p>
            <p className="text-xs text-muted truncate">
              {channel.group}
              {totalInGroup > 0 ? ` · ${position}/${totalInGroup}` : ""}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={!prevChannel}
            aria-label="Chaîne précédente"
            className="h-10 w-10 grid place-items-center rounded-full border border-border bg-black/60 hover:bg-card-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Précédente (←)"
          >
            <SkipBack size={16} />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!nextChannel}
            aria-label="Chaîne suivante"
            className="h-10 w-10 grid place-items-center rounded-full border border-border bg-black/60 hover:bg-card-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Suivante (→)"
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
        <Player src={channel.url} poster={channel.logo} onTimeUpdate={onTime} />
      </div>
    </div>
  );
}
