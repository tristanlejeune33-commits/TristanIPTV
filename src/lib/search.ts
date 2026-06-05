import Fuse from "fuse.js";
import type { Channel, ParsedPlaylist, ShowGroup } from "./m3u-parser";

export type SearchableItem =
  | { kind: "channel"; item: Channel }
  | { kind: "show"; item: ShowGroup }
  | { kind: "group"; name: string };

export type SearchHit = {
  item: SearchableItem;
  /** 0 = perfect, 1 = no match. Fuse's score. */
  score: number;
};

export type GroupedResults = {
  live: Channel[];
  movies: Channel[];
  shows: ShowGroup[];
  groups: string[];
  total: number;
};

/**
 * Build a Fuse index over all searchable items in a playlist.
 *
 * Single index across types (vs. one per type) so we get a unified relevance
 * ranking, then we split by kind for display. Fuse keys are tuned for IPTV:
 * displayName and name carry most signal, group helps when users search by
 * theme ("sport", "cinéma").
 */
export function buildSearchIndex(playlist: ParsedPlaylist): Fuse<SearchableItem> {
  const items: SearchableItem[] = [];

  for (const ch of playlist.channels) {
    items.push({ kind: "channel", item: ch });
  }
  for (const slug of playlist.showsSorted) {
    items.push({ kind: "show", item: playlist.shows[slug] });
  }
  for (const g of playlist.groupsSorted) {
    items.push({ kind: "group", name: g });
  }

  return new Fuse<SearchableItem>(items, {
    keys: [
      { name: "item.displayName", weight: 1.0 },
      { name: "item.name", weight: 0.7 },
      { name: "item.show", weight: 1.0 }, // for ShowGroup
      { name: "item.group", weight: 0.4 },
      { name: "name", weight: 0.6 }, // for group entries
    ],
    threshold: 0.4, // forgiving — handles typos
    distance: 100,
    minMatchCharLength: 2,
    ignoreLocation: true,
    includeScore: true,
  });
}

export function groupResults(hits: SearchHit[], limitPerSection = 30): GroupedResults {
  const live: Channel[] = [];
  const movies: Channel[] = [];
  const shows: ShowGroup[] = [];
  const groups: string[] = [];
  const seenShowSlugs = new Set<string>();

  for (const hit of hits) {
    const it = hit.item;
    if (it.kind === "channel") {
      if (it.item.type === "live" && live.length < limitPerSection) {
        live.push(it.item);
      } else if (it.item.type === "movie" && movies.length < limitPerSection) {
        movies.push(it.item);
      } else if (it.item.type === "series" && shows.length < limitPerSection) {
        // Promote individual episode hits to their show
        const slug = it.item.seriesInfo?.showSlug;
        if (slug && !seenShowSlugs.has(slug)) {
          seenShowSlugs.add(slug);
        }
      }
    } else if (it.kind === "show") {
      if (!seenShowSlugs.has(it.item.showSlug) && shows.length < limitPerSection) {
        shows.push(it.item);
        seenShowSlugs.add(it.item.showSlug);
      }
    } else if (it.kind === "group" && groups.length < limitPerSection) {
      groups.push(it.name);
    }
  }

  return {
    live,
    movies,
    shows,
    groups,
    total: live.length + movies.length + shows.length + groups.length,
  };
}

/** Returns suggestion strings for the empty/no-match state. */
export function getSearchSuggestions(playlist: ParsedPlaylist): string[] {
  const out = new Set<string>();
  // Top French live channels by name
  for (const c of playlist.liveChannels.filter((c) => c.isFrench).slice(0, 6)) {
    out.add(c.name.split(/\s+/).slice(0, 2).join(" "));
  }
  // Top groups
  for (const g of playlist.groupsSorted.slice(0, 4)) {
    out.add(g);
  }
  return Array.from(out).slice(0, 8);
}
