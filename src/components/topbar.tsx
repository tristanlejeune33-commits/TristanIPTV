"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Search,
  Settings,
  Heart,
  Home as HomeIcon,
  Layers,
  Command as CmdIcon,
  Radio,
  Film,
  Tv,
} from "lucide-react";

const PRIMARY_NAV = [
  { href: "/", label: "Accueil", icon: HomeIcon },
  { href: "/live", label: "Live TV", icon: Radio },
  { href: "/movies", label: "Films", icon: Film },
  { href: "/series", label: "Séries", icon: Tv },
  { href: "/browse", label: "Parcourir", icon: Layers },
  { href: "/favorites", label: "Favoris", icon: Heart },
] as const;

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Hide topbar on the player page for an immersive view
  if (pathname?.startsWith("/watch/")) return null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-md border-b border-border"
          : "bg-gradient-to-b from-black/80 to-transparent"
      }`}
    >
      <div className="mx-auto max-w-[1600px] px-4 md:px-8 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-[var(--accent)] font-black text-2xl leading-none tracking-tighter">
            TRISTAN
          </span>
          <span className="text-xs text-muted hidden md:inline-block uppercase tracking-widest font-mono">
            IPTV
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 text-sm">
          {PRIMARY_NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-full transition-colors ${
                  active
                    ? "text-foreground bg-card"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <form onSubmit={onSubmit} className="ml-auto flex items-center gap-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="bg-card/80 border border-border rounded-full h-9 pl-9 pr-16 text-sm w-40 md:w-64 focus:outline-none focus:border-foreground/40 transition-colors placeholder:text-muted"
            />
            <kbd className="hidden md:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-1 text-[10px] text-muted bg-background border border-border rounded px-1.5 py-0.5 pointer-events-none">
              <CmdIcon size={10} />K
            </kbd>
          </div>
          <Link
            href="/settings"
            aria-label="Paramètres"
            className="h-9 w-9 grid place-items-center rounded-full border border-border hover:bg-card-hover transition-colors"
          >
            <Settings size={16} />
          </Link>
        </form>
      </div>

      {/* Mobile + tablet horizontal nav */}
      <nav className="lg:hidden flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-border bg-background/80 backdrop-blur-md px-4 py-2 text-xs">
        {PRIMARY_NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0 transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={14} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
