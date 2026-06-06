"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Search,
  Settings,
  Heart,
  Home as HomeIcon,
  Layers,
  Trash2,
  Tv,
  Radio,
  Film,
} from "lucide-react";
import { toast } from "sonner";
import { usePlaylistStore } from "@/lib/store";
import { useSearch } from "@/lib/hooks";
import { getChannelInitials, getFallbackGradient } from "@/lib/colors";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const clearHistory = usePlaylistStore((s) => s.clearHistory);

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) setQuery("");
          return !o;
        });
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  const { data: results } = useSearch(query, 8);

  function closePalette() {
    setOpen(false);
  }
  function go(href: string) {
    closePalette();
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm grid place-items-start pt-[10vh] px-4"
      onClick={closePalette}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
      >
        <Command label="Command palette" shouldFilter={false} className="flex flex-col">
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <Search size={16} className="text-muted shrink-0" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Rechercher une chaîne, une série, une catégorie…"
              className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-muted"
            />
            <kbd className="hidden md:inline-flex items-center gap-1 text-[10px] text-muted bg-background border border-border rounded px-1.5 py-0.5">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
              Aucun résultat
            </Command.Empty>

            <Section heading="Navigation">
              <Item icon={<HomeIcon size={14} />} label="Accueil" onSelect={() => go("/")} />
              <Item icon={<Radio size={14} />} label="Chaînes en direct" onSelect={() => go("/live")} />
              <Item icon={<Film size={14} />} label="Films" onSelect={() => go("/movies")} />
              <Item icon={<Tv size={14} />} label="Séries" onSelect={() => go("/series")} />
              <Item icon={<Layers size={14} />} label="Parcourir" onSelect={() => go("/browse")} />
              <Item icon={<Heart size={14} />} label="Favoris" onSelect={() => go("/favorites")} />
              <Item icon={<Settings size={14} />} label="Paramètres" onSelect={() => go("/settings")} />
            </Section>

            {results && results.live.length > 0 ? (
              <Section heading="Chaînes">
                {results.live.map((c) => (
                  <ChannelItem
                    key={c.id}
                    name={c.displayName}
                    sub={c.group}
                    isFrench={c.isFrench}
                    seedId={c.id}
                    onSelect={() => go(`/watch/${encodeURIComponent(c.id)}`)}
                    icon={<Radio size={14} className="text-muted" />}
                  />
                ))}
              </Section>
            ) : null}

            {results && results.movies.length > 0 ? (
              <Section heading="Films">
                {results.movies.map((c) => (
                  <ChannelItem
                    key={c.id}
                    name={c.displayName}
                    sub={c.group}
                    isFrench={c.isFrench}
                    seedId={c.id}
                    onSelect={() => go(`/watch/${encodeURIComponent(c.id)}`)}
                    icon={<Film size={14} className="text-muted" />}
                  />
                ))}
              </Section>
            ) : null}

            {results && results.shows.length > 0 ? (
              <Section heading="Séries">
                {results.shows.map((s) => (
                  <ChannelItem
                    key={s.showSlug}
                    name={s.show}
                    sub={`${s.episodeCount} épisode${s.episodeCount > 1 ? "s" : ""}`}
                    isFrench={s.isFrench}
                    seedId={s.showSlug}
                    onSelect={() => go(`/series/${encodeURIComponent(s.showSlug)}`)}
                    icon={<Tv size={14} className="text-muted" />}
                  />
                ))}
              </Section>
            ) : null}

            <Section heading="Actions">
              <Item
                icon={<Trash2 size={14} />}
                label="Vider l'historique de lecture"
                onSelect={() => {
                  clearHistory();
                  setOpen(false);
                  toast("Historique vidé");
                }}
                danger
              />
            </Section>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="text-[10px] uppercase tracking-widest text-muted px-2 py-1 mt-2"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  icon,
  label,
  onSelect,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <Command.Item
      value={label}
      onSelect={onSelect}
      className={`flex items-center gap-3 px-3 py-2 rounded-md aria-selected:bg-card-hover cursor-pointer ${
        danger ? "text-red-300" : ""
      }`}
    >
      <span className="text-muted">{icon}</span>
      <span className="text-sm">{label}</span>
    </Command.Item>
  );
}

function ChannelItem({
  name,
  sub,
  isFrench,
  seedId,
  onSelect,
  icon,
}: {
  name: string;
  sub: string;
  isFrench: boolean;
  seedId: string;
  onSelect: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Command.Item
      value={`${name}-${seedId}`}
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2 rounded-md aria-selected:bg-card-hover cursor-pointer"
    >
      <div
        className="h-8 w-8 rounded grid place-items-center shrink-0 text-[10px] font-bold text-white"
        style={{ background: getFallbackGradient(seedId) }}
      >
        {getChannelInitials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate flex items-center gap-1.5">
          {name}
          {isFrench ? <span className="text-[var(--accent)] text-[10px]">FR</span> : null}
        </p>
        <p className="text-xs text-muted truncate">{sub}</p>
      </div>
      {icon}
    </Command.Item>
  );
}
