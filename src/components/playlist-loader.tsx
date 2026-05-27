"use client";

import { useEffect } from "react";
import { usePlaylistStore } from "@/lib/store";
import { parseM3U } from "@/lib/m3u-parser";

/**
 * Mounts once at the root layout level.
 * Watches m3uUrl in the store and fetches/parses the playlist whenever it changes.
 */
export function PlaylistLoader() {
  const m3uUrl = usePlaylistStore((s) => s.m3uUrl);
  const setPlaylist = usePlaylistStore((s) => s.setPlaylist);
  const setLoading = usePlaylistStore((s) => s.setLoadingPlaylist);
  const setError = usePlaylistStore((s) => s.setPlaylistError);

  useEffect(() => {
    if (!m3uUrl) {
      setPlaylist(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const proxied = `/api/m3u?url=${encodeURIComponent(m3uUrl!)}`;
        const res = await fetch(proxied, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const text = await res.text();
        if (!text.includes("#EXTM3U") && !text.includes("#EXTINF")) {
          throw new Error("Le fichier ne ressemble pas à un M3U valide");
        }
        const parsed = parseM3U(text);
        if (cancelled) return;
        setPlaylist(parsed);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur inconnue");
        setPlaylist(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [m3uUrl, setPlaylist, setLoading, setError]);

  return null;
}
