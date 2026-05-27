"use client";

import { memo, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { ChannelCard } from "./channel-card";
import type { Channel } from "@/lib/m3u-parser";

function RailImpl({
  title,
  channels,
  href,
  size = "md",
}: {
  title: string;
  channels: Channel[];
  href?: string;
  size?: "sm" | "md" | "lg";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scroll(dir: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8 * dir;
    el.scrollBy({ left: amount, behavior: "smooth" });
  }

  if (channels.length === 0) return null;

  return (
    <section className="py-4 md:py-6">
      <div className="px-4 md:px-8 flex items-center justify-between mb-3">
        <h2 className="text-lg md:text-xl font-semibold tracking-tight">
          {href ? (
            <Link
              href={href}
              className="inline-flex items-center gap-2 group hover:text-[var(--accent)] transition-colors"
            >
              {title}
              <ArrowRight
                size={16}
                className="opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all"
              />
            </Link>
          ) : (
            title
          )}
        </h2>
        <span className="text-xs text-muted hidden md:inline-block">
          {channels.length} chaîne{channels.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="relative group/rail">
        <button
          type="button"
          onClick={() => scroll(-1)}
          aria-label="Précédent"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 h-12 w-12 grid place-items-center bg-background/80 backdrop-blur border border-border rounded-full opacity-0 group-hover/rail:opacity-100 transition-opacity ml-2"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          onClick={() => scroll(1)}
          aria-label="Suivant"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 h-12 w-12 grid place-items-center bg-background/80 backdrop-blur border border-border rounded-full opacity-0 group-hover/rail:opacity-100 transition-opacity mr-2"
        >
          <ChevronRight size={20} />
        </button>

        <div
          ref={scrollerRef}
          className="flex gap-3 md:gap-4 px-4 md:px-8 pb-6 overflow-x-auto no-scrollbar scroll-smooth"
        >
          {channels.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} size={size} />
          ))}
        </div>
      </div>
    </section>
  );
}

export const Rail = memo(RailImpl);
