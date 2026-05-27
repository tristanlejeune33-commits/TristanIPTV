"use client";

import { use, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Heart } from "lucide-react";
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

  // Mark as watched on mount
  const markedRef = useRef(false);
  useEffect(() => {
    if (!channel || markedRef.current) return;
    markedRef.current = true;
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

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-30 p-4 md:p-6 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-10 w-10 grid place-items-center rounded-full bg-black/60 hover:bg-card-hover border border-border transition-colors"
          aria-label="Retour"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="flex items-center gap-3 min-w-0">
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
            <p className="text-xs text-muted truncate">{channel.group}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => toggleFav(channel.id)}
          aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
          className={`ml-auto h-10 w-10 grid place-items-center rounded-full border transition-colors ${
            isFav
              ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
              : "border-border bg-black/60 hover:bg-card-hover"
          }`}
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

      <div className="flex-1">
        <Player
          src={channel.url}
          poster={channel.logo}
          onTimeUpdate={onTime}
        />
      </div>
    </div>
  );
}
