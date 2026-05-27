"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Radio, Film, Tv, ArrowRight } from "lucide-react";

type Shortcut = {
  href: string;
  label: string;
  description: string;
  count: number;
  Icon: React.ComponentType<{ size?: number }>;
  /** Tailwind classes for background gradient */
  gradient: string;
  /** Border accent on hover */
  ring: string;
};

export function TypeShortcuts({
  liveCount,
  movieCount,
  seriesCount,
}: {
  liveCount: number;
  movieCount: number;
  seriesCount: number;
}) {
  const items: Shortcut[] = [
    {
      href: "/live",
      label: "Chaînes TV",
      description: "Live TV, sport, info, kids…",
      count: liveCount,
      Icon: Radio,
      gradient: "from-[#7f1d1d] via-[#dc2626] to-[#7f1d1d]",
      ring: "hover:ring-[#dc2626]",
    },
    {
      href: "/movies",
      label: "Films",
      description: "Catalogue VOD — les derniers ajoutés en premier",
      count: movieCount,
      Icon: Film,
      gradient: "from-[#1e3a8a] via-[#2563eb] to-[#312e81]",
      ring: "hover:ring-[#2563eb]",
    },
    {
      href: "/series",
      label: "Séries",
      description: "Épisodes regroupés par saison",
      count: seriesCount,
      Icon: Tv,
      gradient: "from-[#581c87] via-[#9333ea] to-[#3b0764]",
      ring: "hover:ring-[#9333ea]",
    },
  ];

  return (
    <section className="px-4 md:px-8 mt-4 md:mt-6 mb-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {items.map((it, i) => {
          const Icon = it.Icon;
          return (
            <motion.div
              key={it.href}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07, ease: "easeOut" }}
            >
              <Link
                href={it.href}
                className={`group relative block aspect-[2.6/1] md:aspect-[3.2/1] rounded-2xl overflow-hidden border border-border bg-gradient-to-br ${it.gradient} ring-0 ring-offset-2 ring-offset-background hover:ring-2 ${it.ring} transition-all`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.18),transparent_60%)]" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />
                <div className="relative h-full p-5 md:p-6 flex flex-col justify-between text-white">
                  <div className="flex items-start justify-between">
                    <div className="h-12 w-12 grid place-items-center rounded-xl bg-white/15 backdrop-blur">
                      <Icon size={22} />
                    </div>
                    <span className="text-xs font-mono bg-black/30 backdrop-blur rounded-full px-2.5 py-1">
                      {it.count}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-2xl md:text-3xl font-black tracking-tight">
                      {it.label}
                    </h3>
                    <p className="text-xs md:text-sm text-white/80 mt-1 flex items-center gap-1.5">
                      {it.description}
                      <ArrowRight
                        size={14}
                        className="transition-transform group-hover:translate-x-1"
                      />
                    </p>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
