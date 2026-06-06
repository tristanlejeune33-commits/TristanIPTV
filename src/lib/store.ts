import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CatalogMeta } from "./catalog-client";

export type WatchEntry = {
  channelId: string;
  lastWatchedAt: number;
  position?: number;
  duration?: number;
};

type State = {
  /** Currently configured M3U URL. Hydrated from /api/m3u-url on first mount. */
  m3uUrl: string | null;
  setM3uUrl: (url: string | null) => void;

  /** Lightweight catalog meta fetched from /api/catalog/meta. */
  meta: CatalogMeta | null;
  setMeta: (m: CatalogMeta | null) => void;

  loadingMeta: boolean;
  setLoadingMeta: (v: boolean) => void;

  loadingProgress: string | null;
  setLoadingProgress: (msg: string | null) => void;

  metaError: string | null;
  setMetaError: (msg: string | null) => void;

  proxyStreams: boolean;
  setProxyStreams: (v: boolean) => void;

  preferredAudio: "fr" | "original";
  setPreferredAudio: (v: "fr" | "original") => void;

  subtitleMode: "off" | "auto" | "always-fr";
  setSubtitleMode: (v: "off" | "auto" | "always-fr") => void;

  favorites: string[];
  toggleFavorite: (channelId: string) => void;

  watchHistory: WatchEntry[];
  markWatched: (channelId: string, position?: number, duration?: number) => void;
  removeFromHistory: (channelId: string) => void;
  clearHistory: () => void;

  recentSearches: string[];
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
};

export const usePlaylistStore = create<State>()(
  persist(
    (set) => ({
      m3uUrl: null,
      setM3uUrl: (url) => set({ m3uUrl: url }),

      meta: null,
      setMeta: (m) => set({ meta: m }),

      loadingMeta: false,
      setLoadingMeta: (v) => set({ loadingMeta: v }),

      loadingProgress: null,
      setLoadingProgress: (msg) => set({ loadingProgress: msg }),

      metaError: null,
      setMetaError: (msg) => set({ metaError: msg }),

      proxyStreams: true,
      setProxyStreams: (v) => set({ proxyStreams: v }),

      preferredAudio: "fr",
      setPreferredAudio: (v) => set({ preferredAudio: v }),

      subtitleMode: "auto",
      setSubtitleMode: (v) => set({ subtitleMode: v }),

      favorites: [],
      toggleFavorite: (channelId) =>
        set((s) => ({
          favorites: s.favorites.includes(channelId)
            ? s.favorites.filter((id) => id !== channelId)
            : [channelId, ...s.favorites].slice(0, 500),
        })),

      watchHistory: [],
      markWatched: (channelId, position, duration) =>
        set((s) => {
          const prev = s.watchHistory.find((e) => e.channelId === channelId);
          const filtered = s.watchHistory.filter((e) => e.channelId !== channelId);
          const next: WatchEntry = {
            channelId,
            lastWatchedAt: Date.now(),
            position: position ?? prev?.position,
            duration: duration ?? prev?.duration,
          };
          return { watchHistory: [next, ...filtered].slice(0, 30) };
        }),
      removeFromHistory: (channelId) =>
        set((s) => ({
          watchHistory: s.watchHistory.filter((e) => e.channelId !== channelId),
        })),
      clearHistory: () => set({ watchHistory: [] }),

      recentSearches: [],
      addRecentSearch: (query) =>
        set((s) => {
          const q = query.trim();
          if (!q) return s;
          const next = [q, ...s.recentSearches.filter((r) => r !== q)].slice(0, 8);
          return { recentSearches: next };
        }),
      clearRecentSearches: () => set({ recentSearches: [] }),
    }),
    {
      name: "netflix-iptv-store",
      partialize: (s) => ({
        m3uUrl: s.m3uUrl,
        proxyStreams: s.proxyStreams,
        preferredAudio: s.preferredAudio,
        subtitleMode: s.subtitleMode,
        favorites: s.favorites,
        watchHistory: s.watchHistory,
        recentSearches: s.recentSearches,
      }),
    }
  )
);
