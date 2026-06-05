"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Play, Info } from "lucide-react";
import type { Channel } from "@/lib/m3u-parser";
import { ChannelThumbnail } from "./channel-thumbnail";

export function Hero({ channel }: { channel: Channel }) {
  return (
    <section className="relative h-[68vh] min-h-[460px] w-full overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        {channel.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.logo}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-30 scale-125"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a0e0e] via-[#0a0a0a] to-[#0a0a0a]" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>

      <div className="relative h-full mx-auto max-w-[1600px] px-4 md:px-12 flex items-end pb-16 md:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex items-end gap-6 max-w-3xl"
        >
          <div className="hidden md:block w-32 h-32 rounded-xl overflow-hidden border border-border shrink-0 shadow-2xl">
            <ChannelThumbnail channel={channel} className="w-full h-full" />
          </div>

          <div>
            <p className="uppercase tracking-[0.3em] text-xs text-[var(--accent)] font-semibold mb-3">
              À l&apos;affiche · {channel.group}
            </p>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4 drop-shadow-2xl">
              {channel.displayName}
            </h1>
            <p className="text-muted text-base md:text-lg mb-8 max-w-xl">
              {channel.country ? `Diffusion ${channel.country}. ` : "Diffusion en direct. "}
              {channel.language ? `Audio ${channel.language}. ` : ""}
              Cliquez sur lecture pour démarrer le stream maintenant.
            </p>

            <div className="flex items-center gap-3">
              <Link
                href={`/watch/${encodeURIComponent(channel.id)}`}
                className="inline-flex items-center gap-2 h-12 px-7 rounded-md bg-foreground text-background font-semibold hover:bg-foreground/85 transition-colors"
              >
                <Play size={18} fill="currentColor" />
                Lecture
              </Link>
              <Link
                href={`/category/${encodeURIComponent(channel.group)}`}
                className="inline-flex items-center gap-2 h-12 px-7 rounded-md bg-card/70 backdrop-blur border border-border text-foreground font-semibold hover:bg-card transition-colors"
              >
                <Info size={18} />
                Plus de chaînes
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
