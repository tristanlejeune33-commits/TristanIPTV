"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { usePlaylistStore } from "@/lib/store";
import { getChannelInitials, getFallbackGradient } from "@/lib/colors";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const playlist = usePlaylistStore((s) => s.playlist);
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

  function closePalette() {
    setOpen(false);
  }

  const channels = useMemo(() => {
    if (!playlist) return [];
    if (!query.trim()) return playlist.channels.slice(0, 8);
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return playlist.channels
      .filter((c) => {
        const hay = `${c.name} ${c.group}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 12);
  }, [playlist, query]);

  const groups = useMemo(() => {
    if (!playlist) return [];
    if (!query.trim()) return playlist.groupsSorted.slice(0, 6);
    const q = query.toLowerCase();
    return playlist.groupsSorted.filter((g) => g.toLowerCase().includes(q)).slice(0, 6);
  }, [playlist, query]);

  function go(href: string) {
    closePalette();
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm grid place-items-start pt-[12vh] px-4"
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
              placeholder="Rechercher une chaîne, une catégorie, une action…"
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

            <Command.Group heading="Navigation" className="text-xs uppercase tracking-widest text-muted px-2 py-1">
              <Item icon={<HomeIcon size={14} />} label="Accueil" onSelect={() => go("/")} />
              <Item icon={<Layers size={14} />} label="Parcourir les catégories" onSelect={() => go("/browse")} />
              <Item icon={<Heart size={14} />} label="Mes favoris" onSelect={() => go("/favorites")} />
              <Item icon={<Settings size={14} />} label="Paramètres" onSelect={() => go("/settings")} />
            </Command.Group>

            {channels.length > 0 ? (
              <Command.Group heading="Chaînes" className="text-xs uppercase tracking-widest text-muted px-2 py-1 mt-2">
                {channels.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`channel-${c.id}-${c.name}`}
                    onSelect={() => go(`/watch/${encodeURIComponent(c.id)}`)}
                    className="flex items-center gap-3 px-3 py-2 rounded-md aria-selected:bg-card-hover cursor-pointer"
                  >
                    <div
                      className="h-8 w-8 rounded grid place-items-center shrink-0 text-[10px] font-bold text-white"
                      style={{ background: getFallbackGradient(c.id) }}
                    >
                      {getChannelInitials(c.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{c.name}</p>
                      <p className="text-xs text-muted truncate">{c.group}</p>
                    </div>
                    <Tv size={14} className="text-muted" />
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {groups.length > 0 ? (
              <Command.Group heading="Catégories" className="text-xs uppercase tracking-widest text-muted px-2 py-1 mt-2">
                {groups.map((g) => (
                  <Command.Item
                    key={g}
                    value={`group-${g}`}
                    onSelect={() => go(`/category/${encodeURIComponent(g)}`)}
                    className="flex items-center gap-3 px-3 py-2 rounded-md aria-selected:bg-card-hover cursor-pointer"
                  >
                    <Layers size={14} className="text-muted" />
                    <span className="text-sm flex-1">{g}</span>
                    <span className="text-xs text-muted">
                      {playlist?.groups[g]?.length ?? 0}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            <Command.Group heading="Actions" className="text-xs uppercase tracking-widest text-muted px-2 py-1 mt-2">
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
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border text-[11px] text-muted">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="bg-background border border-border rounded px-1.5 py-0.5">↑↓</kbd>
                naviguer
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-background border border-border rounded px-1.5 py-0.5">↵</kbd>
                ouvrir
              </span>
            </div>
            <span className="flex items-center gap-1">
              <kbd className="bg-background border border-border rounded px-1.5 py-0.5">⌘K</kbd>
              fermer
            </span>
          </div>
        </Command>
      </div>
    </div>
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
