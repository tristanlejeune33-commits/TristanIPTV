"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePlaylistStore } from "@/lib/store";
import { parseM3U } from "@/lib/m3u-parser";
import {
  formatCacheAge,
  getCachedPlaylist,
  setCachedPlaylist,
} from "@/lib/playlist-cache";

const FETCH_TIMEOUT_MS = 120_000;
const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12h — background refresh hint

function fmtMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Boot the playlist for the app:
 *
 *   1. Hydrate the M3U URL from the server-side store (the env-var default
 *      means a fresh device opens with the right URL pre-filled).
 *   2. Read the IndexedDB cache for that URL — if present, paint the catalog
 *      INSTANTLY (no network, no parsing).
 *   3. In the background, refetch + reparse the M3U so the next session has
 *      fresh data. A silent toast lets the user know when it succeeded.
 *
 * The fast path means TV browsers (Chromecast / Fire TV) never sit on the
 * loading screen on subsequent opens — they always have the catalog ready,
 * even right after a cold start.
 */
export function PlaylistLoader() {
  const m3uUrl = usePlaylistStore((s) => s.m3uUrl);
  const setM3uUrl = usePlaylistStore((s) => s.setM3uUrl);
  const setPlaylist = usePlaylistStore((s) => s.setPlaylist);
  const setLoading = usePlaylistStore((s) => s.setLoadingPlaylist);
  const setError = usePlaylistStore((s) => s.setPlaylistError);
  const setProgress = usePlaylistStore((s) => s.setLoadingProgress);

  // Server-side URL hydration (env default / saved state)
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/m3u-url", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { m3uUrl: string | null };
        if (data.m3uUrl && !usePlaylistStore.getState().m3uUrl) {
          setM3uUrl(data.m3uUrl);
        }
      } catch {
        // best-effort
      }
    })();
  }, [setM3uUrl]);

  useEffect(() => {
    if (!m3uUrl) {
      setPlaylist(null);
      setProgress(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS
    );

    async function bootFromCache(): Promise<boolean> {
      const cached = await getCachedPlaylist(m3uUrl!);
      if (cancelled || !cached) return false;
      setPlaylist(cached.playlist);
      setError(null);
      setLoading(false);
      setProgress(null);
      return true;
    }

    async function fetchFresh(silent: boolean): Promise<void> {
      if (!silent) {
        setLoading(true);
        setError(null);
        setProgress("Connexion au serveur…");
      }
      let text: string;
      try {
        const proxied = `/api/m3u?url=${encodeURIComponent(m3uUrl!)}`;
        const res = await fetch(proxied, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Le serveur a répondu HTTP ${res.status}`);

        const contentLength = parseInt(
          res.headers.get("content-length") ?? "0",
          10
        );
        const reader = res.body?.getReader();
        if (reader) {
          try {
            const chunks: Uint8Array[] = [];
            let received = 0;
            let lastUpdate = 0;
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (cancelled) {
                reader.cancel().catch(() => {});
                return;
              }
              chunks.push(value);
              received += value.length;
              if (!silent && Date.now() - lastUpdate > 250) {
                lastUpdate = Date.now();
                setProgress(
                  contentLength > 0
                    ? `Téléchargement ${fmtMb(received)} / ${fmtMb(
                        contentLength
                      )}`
                    : `Téléchargement ${fmtMb(received)}`
                );
              }
            }
            if (!silent)
              setProgress(`Téléchargement terminé (${fmtMb(received)})`);
            await nextTick();
            const blob = new Blob(chunks as unknown as BlobPart[]);
            text = await blob.text();
          } catch {
            const res2 = await fetch(proxied, {
              cache: "no-store",
              signal: controller.signal,
            });
            if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
            text = await res2.text();
          }
        } else {
          text = await res.text();
        }

        window.clearTimeout(timeoutId);
        if (cancelled) return;

        if (!text.includes("#EXTM3U") && !text.includes("#EXTINF")) {
          throw new Error(
            "Le fichier ne ressemble pas à une playlist M3U valide"
          );
        }

        if (!silent) setProgress("Analyse de la playlist…");
        await nextTick();

        const parsed = parseM3U(text);
        if (cancelled) return;

        if (!silent) {
          setProgress(
            `${parsed.channels.length} chaînes · ${parsed.groupsSorted.length} catégories`
          );
        }
        setPlaylist(parsed);
        setError(null);

        // Persist to cache for the next cold start
        setCachedPlaylist(m3uUrl!, parsed).catch(() => {});

        if (silent) {
          toast.success("Catalogue mis à jour", {
            description: `${parsed.channels.length} chaînes · ${parsed.groupsSorted.length} catégories`,
            duration: 2500,
          });
        }
      } catch (err) {
        if (cancelled) return;
        const isAbort =
          err instanceof DOMException && err.name === "AbortError";
        const msg = isAbort
          ? `Délai dépassé (${FETCH_TIMEOUT_MS / 1000}s)`
          : err instanceof Error
            ? err.message
            : "Erreur inconnue";

        if (silent) {
          // Don't disrupt the user — they're already watching the cached
          // catalog. Just log a soft notice.
          toast.warning("Mise à jour échouée", {
            description: msg,
            duration: 3000,
          });
        } else {
          setError(
            msg.toLowerCase().includes("load failed") ||
              msg.toLowerCase().includes("network")
              ? `${msg}. Vérifie ta connexion WiFi et réessaie.`
              : msg
          );
          setPlaylist(null);
        }
      } finally {
        if (!cancelled && !silent) {
          setLoading(false);
          setTimeout(() => {
            if (!cancelled) setProgress(null);
          }, 1500);
        }
      }
    }

    (async () => {
      const cached = await getCachedPlaylist(m3uUrl!);
      const hasCache = await bootFromCache();
      if (hasCache && cached) {
        // Got the fast path. Now refresh in background only if the cache
        // is stale enough to be worth the work.
        const stale = Date.now() - cached.timestamp > STALE_AFTER_MS;
        if (stale) {
          toast(`Mise à jour du catalogue (${formatCacheAge(cached.timestamp)})`, {
            duration: 2000,
          });
          fetchFresh(true);
        }
      } else {
        // Cold start with no cache — full visible load
        await fetchFresh(false);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [m3uUrl, setPlaylist, setLoading, setError, setProgress]);

  return null;
}
