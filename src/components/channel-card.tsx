"use client";

import { memo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Play, Heart } from "lucide-react";
import { toast } from "sonner";
import type { Channel } from "@/lib/m3u-parser";
import { usePlaylistStore } from "@/lib/store";
import { ChannelThumbnail } from "./channel-thumbnail";

function ChannelCardImpl({
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

  function onFavClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    toggleFav(channel.id);
    toast(isFav ? "Retiré des favoris" : "Ajouté aux favoris", {
      description: channel.name,
    });
  }

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
        <ChannelThumbnail channel={channel} className="absolute inset-0 w-full h-full" />

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        <div className="absolute inset-0 flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-foreground text-background grid place-items-center">
              <Play size={14} fill="currentColor" />
            </div>
            <button
              type="button"
              aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
              onClick={onFavClick}
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

        {/* Always-visible small badges (FR / year) */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          {channel.isFrench ? (
            <span className="text-[10px] font-bold bg-[var(--accent)] text-white px-1.5 py-0.5 rounded">
              FR
            </span>
          ) : null}
          {channel.year ? (
            <span className="text-[10px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded backdrop-blur">
              {channel.year}
            </span>
          ) : null}
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

export const ChannelCard = memo(ChannelCardImpl);
