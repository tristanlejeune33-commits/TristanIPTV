"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Tv } from "lucide-react";
import { ChannelThumbnail } from "./channel-thumbnail";
import type { ShowGroup } from "@/lib/m3u-parser";

export function ShowCard({ show }: { show: ShowGroup }) {
  // Use the first episode's logo as the show poster
  const poster = show.episodes[0];

  return (
    <motion.div
      whileHover={{ scale: 1.05, zIndex: 10 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group relative shrink-0"
    >
      <Link
        href={`/series/${encodeURIComponent(show.showSlug)}`}
        className="w-44 md:w-48 aspect-[2/3] relative block overflow-hidden rounded-lg border border-border bg-card"
      >
        <ChannelThumbnail channel={poster} className="absolute inset-0 w-full h-full" />

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-100 md:opacity-60 group-hover:opacity-100 transition-opacity duration-200" />

        <div className="absolute inset-0 flex flex-col justify-end p-3">
          <p className="text-sm font-semibold drop-shadow line-clamp-2">
            {show.show}
          </p>
          <p className="text-[11px] text-muted mt-1 flex items-center gap-1.5">
            <Tv size={11} />
            {show.episodes.length} épisode{show.episodes.length > 1 ? "s" : ""}
            {show.isFrench ? <span className="text-[var(--accent)] ml-1">FR</span> : null}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
