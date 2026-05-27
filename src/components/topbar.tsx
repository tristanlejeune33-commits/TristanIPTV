"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, Settings, Heart, Home as HomeIcon, Layers, Command as CmdIcon } from "lucide-react";

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
      <div className="mx-auto max-w-[1600px] px-4 md:px-8 h-16 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-[var(--accent)] font-black text-2xl tracking-tighter">
            NETFLIX
          </span>
          <span className="text-xs text-muted hidden md:inline-block uppercase tracking-widest">
            IPTV
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm">
          <NavLink href="/" active={pathname === "/"} icon={<HomeIcon size={16} />}>
            Accueil
          </NavLink>
          <NavLink href="/browse" active={pathname === "/browse"} icon={<Layers size={16} />}>
            Parcourir
          </NavLink>
          <NavLink
            href="/favorites"
            active={pathname === "/favorites"}
            icon={<Heart size={16} />}
          >
            Mes favoris
          </NavLink>
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
              placeholder="Rechercher une chaîne…"
              className="bg-card/80 border border-border rounded-full h-9 pl-9 pr-16 text-sm w-48 md:w-72 focus:outline-none focus:border-foreground/40 transition-colors placeholder:text-muted"
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

      {/* Mobile bottom-nav alternative kept inside topbar on small screens */}
      <nav className="md:hidden flex items-center justify-around border-t border-border bg-background/80 backdrop-blur-md text-xs">
        <MobileNavLink href="/" active={pathname === "/"} icon={<HomeIcon size={16} />} label="Accueil" />
        <MobileNavLink href="/browse" active={pathname === "/browse"} icon={<Layers size={16} />} label="Parcourir" />
        <MobileNavLink href="/favorites" active={pathname === "/favorites"} icon={<Heart size={16} />} label="Favoris" />
        <MobileNavLink href="/settings" active={pathname === "/settings"} icon={<Settings size={16} />} label="Réglages" />
      </nav>
    </header>
  );
}

function NavLink({
  href,
  children,
  active,
  icon,
}: {
  href: string;
  children: React.ReactNode;
  active: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-2 rounded-full transition-colors ${
        active
          ? "text-foreground bg-card"
          : "text-muted hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

function MobileNavLink({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex-1 py-2 flex flex-col items-center gap-0.5 ${
        active ? "text-foreground" : "text-muted"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
