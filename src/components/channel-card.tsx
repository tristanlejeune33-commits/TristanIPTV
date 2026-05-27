"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Play, Heart } from "lucide-react";
import type { Channel } from "@/lib/m3u-parser";
import { usePlaylistStore } from "@/lib/store";

export function ChannelCard({
  channel,
  size = "md",
}: {
  channel: Channel;
  size?: "sm" | "md" | "lg";
}) {
  const isFav = usePlaylistStore((s) => s.favorites.includes(channel.id));
  const toggleFav = usePlaylistStore((s) => s.toggleFavorite);

  const dims = {
    sm: "w-40 h-24",
    md: "w-56 h-32",
    lg: "w-72 h-40",
  }[size];

  return (
    <motion.div
      whileHover={{ scale: 1.06, zIndex: 10 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group relative shrink-0"
    >
      <Link
        href={`/watch/${encodeURIComponent(channel.id)}`}
        className={`${dims} relative block overflow-hidden rounded-lg border border-border bg-card`}
      >
        {channel.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.logo}
            alt={channel.name}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-contain p-3 bg-gradient-to-br from-card to-[#0d0d0d]"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a]">
            <span className="text-2xl font-black text-muted">
              {channel.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        <div className="absolute inset-0 flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-foreground text-background grid place-items-center">
              <Play size={14} fill="currentColor" />
            </div>
            <button
              type="button"
              aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
              onClick={(e) => {
                e.preventDefault();
                toggleFav(channel.id);
              }}
              className={`h-8 w-8 rounded-full border grid place-items-center transition-colors ${
                isFav
                  ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
                  : "border-border bg-background/60 text-foreground hover:bg-background"
              }`}
            >
              <Heart size={14} fill={isFav ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </Link>

      <div className="mt-2 px-1">
        <p className="text-sm font-medium truncate" title={channel.name}>
          {channel.name}
        </p>
        <p className="text-xs text-muted truncate">{channel.group}</p>
      </div>
    </motion.div>
  );
}
