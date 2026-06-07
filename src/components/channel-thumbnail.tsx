"use client";

import { useState } from "react";
import { Film, Tv, Radio } from "lucide-react";
import { getChannelInitials, getFallbackGradient } from "@/lib/colors";
import { proxiedImageUrl } from "@/lib/stream";
import type { Channel } from "@/lib/m3u-parser";

/**
 * Channel thumbnail with a robust fallback chain:
 *
 *   1. Try /api/img proxy (Vercel handles caching + bypasses Referer/UA
 *      hotlink protection — and crucially, doesn't burn Chrome's ~6
 *      per-host socket limit on the IPTV image CDN, which was causing
 *      ERR_CONNECTION_CLOSED cascades that crashed the page when 50+
 *      thumbnails tried to load at once).
 *   2. On error, render a deterministic gradient + initials + a tiny
 *      content-type icon — branded, not a broken image.
 *
 * We intentionally DON'T try the direct upstream first anymore. Going via
 * Vercel adds maybe 50ms on cache miss but is dramatically more reliable
 * for big playlists.
 */
export function ChannelThumbnail({
  channel,
  className = "",
}: {
  channel: Channel;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (channel.logo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxiedImageUrl(channel.logo)}
        alt={channel.displayName}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        className={`object-contain p-3 bg-gradient-to-br from-card to-[#0d0d0d] ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  const TypeIcon =
    channel.type === "movie" ? Film : channel.type === "series" ? Tv : Radio;

  return (
    <div
      className={`relative grid place-items-center ${className}`}
      style={{ background: getFallbackGradient(channel.id) }}
    >
      <span className="text-2xl font-black text-white/95 tracking-tight drop-shadow">
        {getChannelInitials(channel.displayName)}
      </span>
      <TypeIcon
        size={14}
        className="absolute bottom-2 right-2 text-white/50"
      />
    </div>
  );
}
