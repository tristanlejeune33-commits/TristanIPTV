"use client";

import { useState } from "react";
import { getChannelInitials, getFallbackGradient } from "@/lib/colors";
import type { Channel } from "@/lib/m3u-parser";

export function ChannelThumbnail({
  channel,
  className = "",
}: {
  channel: Channel;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(channel.logo) && !failed;

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={channel.logo}
        alt={channel.name}
        referrerPolicy="no-referrer"
        loading="lazy"
        className={`object-contain p-3 ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`grid place-items-center ${className}`}
      style={{ background: getFallbackGradient(channel.id) }}
    >
      <span className="text-2xl font-black text-white/90 tracking-tight drop-shadow">
        {getChannelInitials(channel.name)}
      </span>
    </div>
  );
}
