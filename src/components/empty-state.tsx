"use client";

import Link from "next/link";
import { Tv, Settings } from "lucide-react";

export function EmptyState({
  title,
  description,
  ctaLabel,
  ctaHref,
  icon = "tv",
}: {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  icon?: "tv" | "settings";
}) {
  const Icon = icon === "settings" ? Settings : Tv;
  return (
    <div className="min-h-[60vh] grid place-items-center px-6">
      <div className="text-center max-w-md">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-card border border-border grid place-items-center mb-6">
          <Icon size={28} className="text-muted" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">{title}</h2>
        <p className="text-muted mb-6">{description}</p>
        {ctaLabel && ctaHref ? (
          <Link
            href={ctaHref}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold transition-colors"
          >
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
