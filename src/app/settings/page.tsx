"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { usePlaylistStore } from "@/lib/store";

export default function SettingsPage() {
  const router = useRouter();
  const currentUrl = usePlaylistStore((s) => s.m3uUrl);
  const setM3uUrl = usePlaylistStore((s) => s.setM3uUrl);
  const playlist = usePlaylistStore((s) => s.playlist);
  const loading = usePlaylistStore((s) => s.loadingPlaylist);
  const error = usePlaylistStore((s) => s.playlistError);
  const clearHistory = usePlaylistStore((s) => s.clearHistory);
  const favorites = usePlaylistStore((s) => s.favorites);
  const history = usePlaylistStore((s) => s.watchHistory);

  const [input, setInput] = useState(currentUrl ?? "");

  // Surface async errors as toasts
  useEffect(() => {
    if (error) {
      toast.error("Impossible de charger la playlist", { description: error });
    }
  }, [error]);

  function save() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setM3uUrl(trimmed);
    toast.success("Lien sauvegardé", {
      description: "Chargement de la playlist en cours…",
    });
  }

  function clearAll() {
    setM3uUrl(null);
    setInput("");
    toast("Lien supprimé");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-12">
      <header className="mb-10">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">
          Paramètres
        </h1>
        <p className="text-muted">
          Gère ton lien M3U et tes préférences locales.
        </p>
      </header>

      <section className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-8">
        <h2 className="text-lg font-semibold mb-2">Lien M3U</h2>
        <p className="text-sm text-muted mb-4">
          Colle ici l&apos;URL de ta playlist (ton ami t&apos;a donné un lien qui se
          termine en général par <code className="text-xs bg-background px-1.5 py-0.5 rounded">.m3u</code> ou{" "}
          <code className="text-xs bg-background px-1.5 py-0.5 rounded">.m3u8</code>).
          Le lien est sauvegardé uniquement dans ton navigateur.
        </p>

        <div className="flex flex-col gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://exemple.com/playlist.m3u"
            rows={3}
            className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm font-mono placeholder:text-muted focus:outline-none focus:border-foreground/40"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={!input.trim() || loading}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {loading ? "Chargement…" : "Charger la playlist"}
            </button>

            {currentUrl ? (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-2 h-11 px-4 rounded-md border border-border hover:bg-card-hover text-muted hover:text-foreground transition-colors"
              >
                <Trash2 size={16} />
                Supprimer le lien
              </button>
            ) : null}
          </div>

          {playlist && !loading && !error ? (
            <div className="mt-2 p-4 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-sm space-y-1">
              <p>
                <strong className="text-emerald-300">
                  {playlist.channels.length}
                </strong>{" "}
                chaînes chargées dans{" "}
                <strong className="text-emerald-300">
                  {playlist.groupsSorted.length}
                </strong>{" "}
                catégories.
              </p>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline mt-1"
              >
                Aller à l&apos;accueil <ExternalLink size={12} />
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-8">
        <h2 className="text-lg font-semibold mb-4">Données locales</h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Stat label="Favoris" value={favorites.length} />
          <Stat label="Historique" value={history.length} />
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm("Vider l'historique de lecture ?")) {
              clearHistory();
              toast("Historique vidé");
            }
          }}
          disabled={history.length === 0}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-border hover:bg-card-hover text-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 size={14} />
          Vider l&apos;historique
        </button>
      </section>

      <section className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-8">
        <h2 className="text-lg font-semibold mb-4">Raccourcis clavier</h2>
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <Shortcut keys={["⌘", "K"]} label="Command palette" />
          <Shortcut keys={["Espace"]} label="Lecture / pause" />
          <Shortcut keys={["M"]} label="Couper le son" />
          <Shortcut keys={["F"]} label="Plein écran" />
          <Shortcut keys={["P"]} label="Picture-in-picture" />
          <Shortcut keys={["↑", "↓"]} label="Volume" />
          <Shortcut keys={["←", "→"]} label="Chaîne précédente / suivante" />
          <Shortcut keys={["L"]} label="Ajouter / retirer favori" />
        </div>
      </section>

      <section className="text-sm text-muted">
        <p className="mb-2 font-semibold text-foreground">Note importante</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>
            Le lien M3U et tes préférences restent dans ton navigateur (rien
            n&apos;est envoyé à un serveur tiers).
          </li>
          <li>
            La playlist est récupérée via le proxy interne{" "}
            <code className="text-xs bg-card px-1.5 py-0.5 rounded">/api/m3u</code>{" "}
            pour éviter les blocages CORS.
          </li>
          <li>
            Les flux vidéo eux sont lus directement par ton navigateur (hls.js).
          </li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-background border border-border rounded-lg p-4">
      <p className="text-xs uppercase tracking-widest text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold font-mono">{value}</p>
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-background border border-border rounded-md">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="text-xs bg-card border border-border rounded px-1.5 py-0.5 font-mono"
          >
            {k}
          </kbd>
        ))}
      </span>
    </div>
  );
}
