"use client";

import { useEffect } from "react";
import { usePlaylistStore } from "@/lib/store";
import { parseM3U } from "@/lib/m3u-parser";

const FETCH_TIMEOUT_MS = 90_000; // 90s to give very large playlists / slow IPTV providers a chance

function fmtMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

/** Yield to the browser so the UI can paint between heavy steps. */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Mounts once at the root layout level.
 * Watches m3uUrl in the store and fetches/parses the playlist whenever it changes.
 * Streams the response with progress reporting so Safari iOS users don't stare
 * at a frozen spinner on multi-MB playlists.
 */
export function PlaylistLoader() {
  const m3uUrl = usePlaylistStore((s) => s.m3uUrl);
  const setPlaylist = usePlaylistStore((s) => s.setPlaylist);
  const setLoading = usePlaylistStore((s) => s.setLoadingPlaylist);
  const setError = usePlaylistStore((s) => s.setPlaylistError);
  const setProgress = usePlaylistStore((s) => s.setLoadingProgress);

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

      try {
        const proxied = `/api/m3u?url=${encodeURIComponent(m3uUrl!)}`;
        const res = await fetch(proxied, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Le serveur a répondu HTTP ${res.status}`);
        }

        // Stream the body so we can show real download progress
        const reader = res.body?.getReader();
        const contentLength = parseInt(
          res.headers.get("content-length") ?? "0",
          10
        );

        let text: string;
        if (reader) {
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
            // Throttle UI updates so we don't re-render on every chunk
            if (Date.now() - lastUpdate > 250) {
              lastUpdate = Date.now();
              setProgress(
                contentLength > 0
                  ? `Téléchargement ${fmtMb(received)} / ${fmtMb(contentLength)}`
                  : `Téléchargement ${fmtMb(received)}`
              );
            }
          }
          setProgress(`Téléchargement ${fmtMb(received)} — terminé`);
          // Concatenate chunks to text on the next tick to let UI paint
          await nextTick();
          // Cast: Uint8Array is a valid BlobPart at runtime; TS lib types are
          // too strict about ArrayBufferLike vs ArrayBuffer here.
          const blob = new Blob(chunks as unknown as BlobPart[]);
          text = await blob.text();
        } else {
          // Fallback (no streaming API)
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
            `Délai dépassé (${FETCH_TIMEOUT_MS / 1000}s). Le serveur IPTV ne répond pas ou la playlist est trop grosse.`
          );
        } else {
          setError(err instanceof Error ? err.message : "Erreur inconnue");
        }
        setPlaylist(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
          // Keep the success message briefly, then clear
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
