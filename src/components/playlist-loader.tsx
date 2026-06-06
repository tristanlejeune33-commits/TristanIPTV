"use client";

import { useEffect, useRef } from "react";
import { usePlaylistStore } from "@/lib/store";
import { fetchMeta, resetCatalogCache } from "@/lib/catalog-client";

/**
 * Boots the catalog by fetching the lightweight `/api/catalog/meta` endpoint
 * — which returns just counts + group metadata, never the full M3U.
 *
 * Pages then fetch the data they actually need on mount via /api/catalog/*
 * endpoints. The huge full-playlist download that used to crash mobile
 * browsers is gone.
 */
export function PlaylistLoader() {
  const m3uUrl = usePlaylistStore((s) => s.m3uUrl);
  const setM3uUrl = usePlaylistStore((s) => s.setM3uUrl);
  const setMeta = usePlaylistStore((s) => s.setMeta);
  const setLoading = usePlaylistStore((s) => s.setLoadingMeta);
  const setProgress = usePlaylistStore((s) => s.setLoadingProgress);
  const setError = usePlaylistStore((s) => s.setMetaError);

  // Hydrate M3U URL from server (env var or saved state) on first mount
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

  // Whenever the M3U URL changes (or on first availability), refresh meta
  const lastUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!m3uUrl) {
      setMeta(null);
      setProgress(null);
      lastUrlRef.current = null;
      return;
    }
    if (lastUrlRef.current === m3uUrl) return;
    lastUrlRef.current = m3uUrl;

    let cancelled = false;
    resetCatalogCache();
    setLoading(true);
    setProgress("Préparation du catalogue…");
    setError(null);

    fetchMeta(true)
      .then((meta) => {
        if (cancelled) return;
        setMeta(meta);
        setProgress(
          `${meta.totalLive} chaînes · ${meta.totalMovies} films · ${meta.totalShows} séries`
        );
        setTimeout(() => {
          if (!cancelled) setProgress(null);
        }, 1500);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [m3uUrl, setMeta, setLoading, setProgress, setError]);

  return null;
}
