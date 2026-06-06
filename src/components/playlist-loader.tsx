"use client";

import { useEffect, useRef } from "react";
import { usePlaylistStore } from "@/lib/store";
import { parseM3U } from "@/lib/m3u-parser";
import {
  clearCachedPlaylist,
  getCachedPlaylist,
  setCachedPlaylist,
} from "@/lib/playlist-cache";

const FETCH_TIMEOUT_MS = 180_000; // 3 min — generous for slow 4G / large playlists

function fmtMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Boot the playlist for the app:
 *
 *   1. Hydrate the M3U URL from the server-side store on first mount.
 *   2. On URL change: try the IndexedDB cache. If hit, paint the catalog
 *      instantly and stop. If miss, run one full visible fetch and save
 *      the result.
 *
 * No automatic background refresh — the previous "refresh after 12h" logic
 * could re-fire in edge cases on TV browsers, producing the "downloads in
 * a loop" bug. The user can refresh explicitly via /settings → Réessayer
 * (which clears the cache for that URL and re-runs the loader).
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

  // Track which URL is currently being processed so React Strict Mode (dev) or
  // any double-mount can't kick off two concurrent loads of the same URL.
  const activeUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!m3uUrl) {
      setPlaylist(null);
      setProgress(null);
      activeUrlRef.current = null;
      return;
    }

    // Already loading or loaded this exact URL on this mount — bail.
    if (activeUrlRef.current === m3uUrl) return;
    activeUrlRef.current = m3uUrl;

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS
    );

    async function load() {
      // 1. Cache fast path — ONLY trust non-empty caches. A previous broken
      //    run (e.g. mis-configured server filter) may have poisoned the IDB
      //    with a 0-channel playlist; skip it and re-fetch.
      const cached = await getCachedPlaylist(m3uUrl!);
      if (cancelled) return;
      if (cached && cached.playlist.channels.length > 0) {
        setPlaylist(cached.playlist);
        setError(null);
        setLoading(false);
        setProgress(null);
        window.clearTimeout(timeoutId);
        return;
      }
      if (cached) {
        // Empty cache — actively clear it so future starts don't fight it
        clearCachedPlaylist(m3uUrl!).catch(() => {});
      }

      // 2. No cache — full visible load
      setLoading(true);
      setError(null);
      setProgress("Connexion au serveur…");

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
              if (Date.now() - lastUpdate > 250) {
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

        setProgress("Analyse de la playlist…");
        await nextTick();

        const parsed = parseM3U(text);
        if (cancelled) return;

        // Empty playlists are always a configuration error — fail loud
        // instead of caching them and showing "Playlist vide" forever.
        if (parsed.channels.length === 0) {
          throw new Error(
            "Playlist vide après filtrage. Vérifie les variables d'environnement M3U_EXCLUDE / M3U_INCLUDE / M3U_SERIES_INCLUDE sur Vercel — elles filtrent probablement tout."
          );
        }

        setProgress(
          `${parsed.channels.length} chaînes · ${parsed.groupsSorted.length} catégories`
        );
        setPlaylist(parsed);

        // Persist for future instant boots — fire-and-forget, only when non-empty
        setCachedPlaylist(m3uUrl!, parsed).catch(() => {});
      } catch (err) {
        if (cancelled) return;
        const isAbort =
          err instanceof DOMException && err.name === "AbortError";
        const msg = isAbort
          ? `Délai dépassé (${FETCH_TIMEOUT_MS / 1000}s)`
          : err instanceof Error
            ? err.message
            : "Erreur inconnue";
        setError(
          msg.toLowerCase().includes("load failed") ||
            msg.toLowerCase().includes("network")
            ? `${msg}. Vérifie ta connexion WiFi et réessaie.`
            : msg
        );
        setPlaylist(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setTimeout(() => {
            if (!cancelled) setProgress(null);
          }, 1500);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [m3uUrl, setPlaylist, setLoading, setError, setProgress]);

  return null;
}
