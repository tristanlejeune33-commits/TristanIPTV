"use client";

import { useEffect, useRef } from "react";
import { usePlaylistStore } from "@/lib/store";
import { parseM3U } from "@/lib/m3u-parser";

const FETCH_TIMEOUT_MS = 120_000; // 2 min, generous for huge IPTV catalogs

function fmtMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Mounts once at the root layout level.
 * Watches m3uUrl in the store and fetches/parses the playlist whenever it changes.
 *
 * Streaming approach: read the response body in chunks so we can show real
 * download progress on huge playlists. Falls back to a plain text() read if
 * the browser doesn't expose a body reader (older Safari).
 */
export function PlaylistLoader() {
  const m3uUrl = usePlaylistStore((s) => s.m3uUrl);
  const setM3uUrl = usePlaylistStore((s) => s.setM3uUrl);
  const setPlaylist = usePlaylistStore((s) => s.setPlaylist);
  const setLoading = usePlaylistStore((s) => s.setLoadingPlaylist);
  const setError = usePlaylistStore((s) => s.setPlaylistError);
  const setProgress = usePlaylistStore((s) => s.setLoadingProgress);

  // On first mount, hydrate from the server-side store. The server value
  // wins if local is empty — that's how a freshly-opened iPhone picks up
  // the URL pasted on the PC. If both exist and disagree, we prefer the
  // local one (the user might be editing).
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
        // server persistence is best-effort
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
    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    async function load() {
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

        if (!res.ok) {
          throw new Error(`Le serveur a répondu HTTP ${res.status}`);
        }

        const contentLength = parseInt(
          res.headers.get("content-length") ?? "0",
          10
        );

        // Try streaming read for progress; fall back to text() on any failure.
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
                    ? `Téléchargement ${fmtMb(received)} / ${fmtMb(contentLength)}`
                    : `Téléchargement ${fmtMb(received)}`
                );
              }
            }
            setProgress(`Téléchargement terminé (${fmtMb(received)})`);
            await nextTick();
            const blob = new Blob(chunks as unknown as BlobPart[]);
            text = await blob.text();
          } catch {
            // If streaming failed mid-read, fall back to a fresh plain fetch
            setProgress("Téléchargement en cours…");
            const res2 = await fetch(proxied, {
              cache: "no-store",
              signal: controller.signal,
            });
            if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
            text = await res2.text();
          }
        } else {
          // No body reader exposed — go straight to text()
          setProgress("Téléchargement en cours…");
          text = await res.text();
        }

        window.clearTimeout(timeoutId);

        if (cancelled) return;

        if (!text.includes("#EXTM3U") && !text.includes("#EXTINF")) {
          throw new Error("Le fichier ne ressemble pas à une playlist M3U valide");
        }

        setProgress("Analyse de la playlist…");
        await nextTick();

        const parsed = parseM3U(text);

        if (cancelled) return;

        setProgress(
          `${parsed.channels.length} chaînes · ${parsed.groupsSorted.length} catégories`
        );
        setPlaylist(parsed);
      } catch (err) {
        if (cancelled) return;
        const isAbort =
          err instanceof DOMException && err.name === "AbortError";
        if (isAbort) {
          setError(
            `Délai dépassé (${FETCH_TIMEOUT_MS / 1000}s). Le serveur IPTV ne répond pas ou la playlist est trop volumineuse.`
          );
        } else {
          const msg = err instanceof Error ? err.message : "Erreur inconnue";
          setError(
            msg.toLowerCase().includes("load failed") ||
              msg.toLowerCase().includes("network")
              ? `${msg}. Vérifie ta connexion WiFi et réessaie.`
              : msg
          );
        }
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
