"use client";

import { useState } from "react";
import { Film, Tv, Radio } from "lucide-react";
import { getChannelInitials, getFallbackGradient } from "@/lib/colors";
import { proxiedImageUrl } from "@/lib/stream";
import type { Channel } from "@/lib/m3u-parser";

/**
 * Channel thumbnail with a robust fallback chain:
 *
 *   1. Try the original logo URL directly (cheapest path — browser may have
 *      it cached, or the host might allow direct hotlinking)
 *   2. On error, retry through our /api/img proxy (bypasses Referer/UA
 *      hotlink protection that 90% of IPTV providers enable)
 *   3. On second error, render a deterministic gradient + initials + a tiny
 *      content-type icon — branded, not a broken image
 */
export function ChannelThumbnail({
  channel,
  className = "",
}: {
  channel: Channel;
  className?: string;
}) {
  const [stage, setStage] = useState<"direct" | "proxy" | "fallback">(
    channel.logo ? "direct" : "fallback"
  );

  if (stage !== "fallback" && channel.logo) {
    const src = stage === "direct" ? channel.logo : proxiedImageUrl(channel.logo);
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={channel.displayName}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        className={`object-contain p-3 bg-gradient-to-br from-card to-[#0d0d0d] ${className}`}
        onError={() => {
          setStage((s) => (s === "direct" ? "proxy" : "fallback"));
        }}
      />
    );
  }

  // Final fallback: branded gradient + cleaned-name initials + content icon
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
