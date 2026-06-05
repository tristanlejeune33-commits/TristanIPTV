"use client";

import { motion } from "framer-motion";
import { Loader2, Tv, Film, Radio } from "lucide-react";

/**
 * Fullscreen overlay shown while we're fetching/parsing the M3U playlist for
 * the first time. Big logo + animated stages + live progress text so the user
 * never wonders "est-ce que ça plante ?" — they always see what step is in
 * progress.
 */
export function FullLoadingScreen({ progress }: { progress: string | null }) {
  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center px-6">
      {/* Subtle animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-50">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[var(--accent)] blur-[140px] opacity-30 animate-pulse" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-blue-600 blur-[140px] opacity-20 animate-pulse [animation-delay:1s]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative text-center max-w-md w-full"
      >
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="grid grid-cols-2 gap-1.5">
            <span className="text-[var(--accent)] font-black text-3xl leading-none tracking-tighter">
              LE
            </span>
            <span className="text-foreground font-black text-3xl leading-none tracking-tighter">
              JEUNE
            </span>
          </div>
          <span className="text-xs text-muted uppercase tracking-widest font-mono">
            IPTV
          </span>
        </div>

        {/* Three pulsing icons that suggest content types */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <PulseIcon Icon={Radio} delay={0} />
          <PulseIcon Icon={Film} delay={0.2} />
          <PulseIcon Icon={Tv} delay={0.4} />
        </div>

        {/* Spinner */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
          <p className="text-sm font-semibold uppercase tracking-widest text-muted">
            Préparation de votre catalogue
          </p>
        </div>

        {/* Live progress text */}
        <p className="font-mono text-base text-foreground min-h-[1.5em]">
          {progress ?? "Initialisation…"}
        </p>

        <p className="text-xs text-muted mt-8">
          Une grosse playlist peut prendre jusqu&apos;à 1 minute la première
          fois. Les chargements suivants seront instantanés.
        </p>
      </motion.div>
    </div>
  );
}

function PulseIcon({
  Icon,
  delay,
}: {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  delay: number;
}) {
  return (
    <motion.div
      animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.6, repeat: Infinity, delay, ease: "easeInOut" }}
      className="h-12 w-12 grid place-items-center rounded-xl bg-card border border-border"
    >
      <Icon size={20} className="text-muted" />
    </motion.div>
  );
}
