"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Channel, ParsedPlaylist } from "./m3u-parser";

export type WatchEntry = {
  channelId: string;
  lastWatchedAt: number;
  /** seconds — useful for VOD only */
  position?: number;
};

type PlaylistState = {
  // Settings
  m3uUrl: string | null;
  setM3uUrl: (url: string | null) => void;

  /** Route every stream through /api/hls to bypass CORS / UA blocks. Default: true. */
  proxyStreams: boolean;
  setProxyStreams: (v: boolean) => void;

  // Loaded playlist (not persisted — re-fetched on app load)
  playlist: ParsedPlaylist | null;
  setPlaylist: (p: ParsedPlaylist | null) => void;

  loadingPlaylist: boolean;
  setLoadingPlaylist: (v: boolean) => void;

  /** Human-readable progress while the playlist is being fetched/parsed. */
  loadingProgress: string | null;
  setLoadingProgress: (msg: string | null) => void;

  playlistError: string | null;
  setPlaylistError: (msg: string | null) => void;

  // Preferences
  favorites: string[];
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;

  // Continue watching (last 30, sorted by recency)
  watchHistory: WatchEntry[];
  markWatched: (channelId: string, position?: number) => void;
  removeFromHistory: (channelId: string) => void;
  clearHistory: () => void;
};

export const usePlaylistStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
      m3uUrl: null,
      setM3uUrl: (url) => set({ m3uUrl: url }),

      proxyStreams: true,
      setProxyStreams: (v) => set({ proxyStreams: v }),

      playlist: null,
      setPlaylist: (p) => set({ playlist: p }),

      loadingPlaylist: false,
      setLoadingPlaylist: (v) => set({ loadingPlaylist: v }),

      loadingProgress: null,
      setLoadingProgress: (msg) => set({ loadingProgress: msg }),

      playlistError: null,
      setPlaylistError: (msg) => set({ playlistError: msg }),

      favorites: [],
      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((f) => f !== id)
            : [...s.favorites, id],
        })),
      isFavorite: (id) => get().favorites.includes(id),

      watchHistory: [],
      markWatched: (channelId, position) =>
        set((s) => {
          const filtered = s.watchHistory.filter(
            (e) => e.channelId !== channelId
          );
          const next: WatchEntry = {
            channelId,
            lastWatchedAt: Date.now(),
            position,
          };
          return { watchHistory: [next, ...filtered].slice(0, 30) };
        }),
      removeFromHistory: (channelId) =>
        set((s) => ({
          watchHistory: s.watchHistory.filter(
            (e) => e.channelId !== channelId
          ),
        })),
      clearHistory: () => set({ watchHistory: [] }),
    }),
    {
      name: "netflix-iptv-store",
      partialize: (s) => ({
        m3uUrl: s.m3uUrl,
        proxyStreams: s.proxyStreams,
        favorites: s.favorites,
        watchHistory: s.watchHistory,
      }),
    }
  )
);

/** Selector helper — get channel by id from currently loaded playlist */
export function useChannelById(id: string | undefined): Channel | undefined {
  return usePlaylistStore((s) =>
    id ? s.playlist?.channels.find((c) => c.id === id) : undefined
  );
}
