"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2, ExternalLink, Shield, Subtitles, Languages } from "lucide-react";
import { toast } from "sonner";
import { usePlaylistStore } from "@/lib/store";
import { clearCachedPlaylist } from "@/lib/playlist-cache";

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
  const proxyStreams = usePlaylistStore((s) => s.proxyStreams);
  const setProxyStreams = usePlaylistStore((s) => s.setProxyStreams);
  const progress = usePlaylistStore((s) => s.loadingProgress);
  const preferredAudio = usePlaylistStore((s) => s.preferredAudio);
  const setPreferredAudio = usePlaylistStore((s) => s.setPreferredAudio);
  const subtitleMode = usePlaylistStore((s) => s.subtitleMode);
  const setSubtitleMode = usePlaylistStore((s) => s.setSubtitleMode);

  const [input, setInput] = useState(currentUrl ?? "");

  // Surface async errors as toasts
  useEffect(() => {
    if (error) {
      toast.error("Impossible de charger la playlist", { description: error });
    }
  }, [error]);

  async function save() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setM3uUrl(trimmed);
    // Best-effort server-side save so other devices on the same LAN
    // (iPhone, autre PC) la récupèrent automatiquement au chargement.
    try {
      await fetch("/api/m3u-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ m3uUrl: trimmed }),
      });
    } catch {
      // ignore — localStorage already has the value
    }
    toast.success("Lien sauvegardé", {
      description: "Visible depuis tes autres appareils sur le même WiFi",
    });
  }

  async function retry() {
    if (!currentUrl) return;
    // Wipe the cached parsed playlist so the loader pulls a fresh M3U
    await clearCachedPlaylist(currentUrl);
    // Force a re-run of the loader by toggling the URL
    setM3uUrl(null);
    setTimeout(() => setM3uUrl(currentUrl), 50);
    toast("Nouvelle tentative…", {
      description: "Cache vidé, téléchargement frais en cours",
    });
  }

  async function clearAll() {
    setM3uUrl(null);
    setInput("");
    try {
      await fetch("/api/m3u-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ m3uUrl: null }),
      });
    } catch {
      // ignore
    }
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
              <>
                <button
                  type="button"
                  onClick={retry}
                  disabled={loading}
                  className="inline-flex items-center gap-2 h-11 px-4 rounded-md border border-border bg-card hover:bg-card-hover transition-colors disabled:opacity-40"
                >
                  <Loader2 size={16} className={loading ? "animate-spin" : ""} />
                  Réessayer
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center gap-2 h-11 px-4 rounded-md border border-border hover:bg-card-hover text-muted hover:text-foreground transition-colors"
                >
                  <Trash2 size={16} />
                  Supprimer le lien
                </button>
              </>
            ) : null}
          </div>

          {loading && progress ? (
            <div className="mt-2 p-4 rounded-md bg-card border border-border text-sm flex items-center gap-3">
              <div className="h-4 w-4 border-2 border-border border-t-[var(--accent)] rounded-full animate-spin" />
              <span className="font-mono text-muted">{progress}</span>
            </div>
          ) : null}

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
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Shield size={18} /> Lecture des chaînes
        </h2>
        <p className="text-sm text-muted mb-4">
          Beaucoup de fournisseurs IPTV bloquent les requêtes directes du
          navigateur (CORS, User-Agent filtré). Le proxy fait passer le flux
          par notre serveur local — c&apos;est ce qui permet aux flux qui
          tournaient en boucle de démarrer.
        </p>

        <label className="flex items-start gap-3 p-4 rounded-lg border border-border bg-background cursor-pointer hover:bg-card-hover transition-colors">
          <input
            type="checkbox"
            checked={proxyStreams}
            onChange={(e) => {
              setProxyStreams(e.target.checked);
              toast(
                e.target.checked
                  ? "Proxy stream activé"
                  : "Proxy stream désactivé"
              );
            }}
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
          />
          <div className="flex-1">
            <p className="text-sm font-semibold">
              Faire passer les flux par le proxy{" "}
              <span className="text-[var(--accent)] text-xs">(recommandé)</span>
            </p>
            <p className="text-xs text-muted mt-1">
              Active si une chaîne charge en boucle sans démarrer. Désactive
              uniquement si tu sais que ton fournisseur autorise le navigateur
              directement (rare).
            </p>
          </div>
        </label>
      </section>

      <section className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-8">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Languages size={18} /> Langue par défaut (films &amp; séries)
        </h2>
        <p className="text-sm text-muted mb-4">
          Quand un film ou un épisode propose plusieurs pistes audio, le
          player sélectionne celle-ci automatiquement.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <RadioCard
            label="🇫🇷 Français (VF)"
            description="Doublage français si dispo"
            active={preferredAudio === "fr"}
            onClick={() => {
              setPreferredAudio("fr");
              toast("Audio par défaut : Français");
            }}
          />
          <RadioCard
            label="🎬 Version originale"
            description="Garde la langue d'origine"
            active={preferredAudio === "original"}
            onClick={() => {
              setPreferredAudio("original");
              toast("Audio par défaut : Version originale");
            }}
          />
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-8">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Subtitles size={18} /> Sous-titres par défaut
        </h2>
        <p className="text-sm text-muted mb-4">
          Comportement automatique des sous-titres à l&apos;ouverture d&apos;un film
          ou épisode.
        </p>
        <div className="grid md:grid-cols-3 gap-3">
          <RadioCard
            label="Désactivés"
            description="Jamais de sous-titres"
            active={subtitleMode === "off"}
            onClick={() => {
              setSubtitleMode("off");
              toast("Sous-titres : désactivés");
            }}
          />
          <RadioCard
            label="Auto (VOSTFR)"
            description="Activés uniquement pour les chaînes VOSTFR"
            active={subtitleMode === "auto"}
            onClick={() => {
              setSubtitleMode("auto");
              toast("Sous-titres : auto (VOSTFR)");
            }}
            recommended
          />
          <RadioCard
            label="Toujours en français"
            description="Active la piste FR si dispo, partout"
            active={subtitleMode === "always-fr"}
            onClick={() => {
              setSubtitleMode("always-fr");
              toast("Sous-titres : toujours en français");
            }}
          />
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

function RadioCard({
  label,
  description,
  active,
  onClick,
  recommended,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
  recommended?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 rounded-lg border transition-all ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/10"
          : "border-border bg-background hover:bg-card-hover"
      }`}
      aria-pressed={active}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold">{label}</span>
        {recommended ? (
          <span className="text-[10px] uppercase tracking-widest text-[var(--accent)] font-bold">
            Reco
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted">{description}</p>
    </button>
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
