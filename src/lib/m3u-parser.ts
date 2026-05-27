import { classify, type ContentType, type SeriesInfo } from "./classify";

/**
 * M3U / M3U8 playlist parser tailored for IPTV playlists.
 * Handles `#EXTINF` attributes (tvg-id, tvg-name, tvg-logo, group-title, tvg-country, tvg-language)
 * and the optional `#EXTGRP` directive.
 *
 * Each channel is enriched with a classification (live/movie/series) and a French flag,
 * computed once at parse time.
 */

export type Channel = {
  /** Stable id derived from tvg-id or generated from URL */
  id: string;
  name: string;
  logo?: string;
  group: string;
  url: string;
  tvgId?: string;
  country?: string;
  language?: string;

  // --- Computed at parse time
  type: ContentType;
  isFrench: boolean;
  seriesInfo: SeriesInfo | null;
  /** Production year extracted from title if any */
  year: number | null;
  /** Original index in the M3U playlist (used as a recency tie-breaker) */
  orderIndex: number;
};

export type ShowGroup = {
  show: string;
  showSlug: string;
  isFrench: boolean;
  group: string;
  /** Sorted by season then episode */
  episodes: Channel[];
  /** Most recent year across all episodes (used for "latest first" sorting) */
  latestYear: number | null;
  /** Smallest orderIndex of episodes (newer M3U entries usually come first) */
  firstOrderIndex: number;
};

export type ParsedPlaylist = {
  channels: Channel[];

  /** All groups, group-title → channels */
  groups: Record<string, Channel[]>;
  /** Groups sorted by FR-first then channel count desc */
  groupsSorted: string[];

  liveChannels: Channel[];
  movieChannels: Channel[];
  /** Individual series episodes (raw) */
  seriesEpisodes: Channel[];
  /** Episodes grouped by show */
  shows: Record<string, ShowGroup>;
  /** Show slugs sorted FR-first then alphabetical */
  showsSorted: string[];
};

const ATTR_REGEX = /([\w-]+)="([^"]*)"/g;

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null;
  while ((match = ATTR_REGEX.exec(line)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h << 5) - h + url.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

export function parseM3U(text: string): ParsedPlaylist {
  const lines = text.split(/\r?\n/);
  const channels: Channel[] = [];

  let pendingName: string | null = null;
  let pendingAttrs: Record<string, string> = {};
  let pendingGroup: string | null = null;
  let orderCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXTM3U")) continue;

    if (line.startsWith("#EXTINF")) {
      const commaIdx = line.indexOf(",");
      const head = commaIdx >= 0 ? line.slice(0, commaIdx) : line;
      const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : "";

      pendingAttrs = parseAttributes(head);
      pendingName = name || pendingAttrs["tvg-name"] || "Sans nom";
      continue;
    }

    if (line.startsWith("#EXTGRP:")) {
      pendingGroup = line.slice("#EXTGRP:".length).trim();
      continue;
    }

    if (line.startsWith("#")) continue;

    const url = line;
    const name = pendingName ?? "Sans nom";
    const group = pendingAttrs["group-title"] || pendingGroup || "Non classé";
    const tvgId = pendingAttrs["tvg-id"];
    const logo = pendingAttrs["tvg-logo"];
    const country = pendingAttrs["tvg-country"];
    const language = pendingAttrs["tvg-language"];

    const baseId = tvgId && tvgId.length > 0 ? slugify(tvgId) : slugify(name);
    const id = `${baseId || "ch"}-${hashUrl(url)}`;

    const classification = classify({ name, group, url, country, language });

    channels.push({
      id,
      name,
      logo: logo || undefined,
      group,
      url,
      tvgId: tvgId || undefined,
      country: country || undefined,
      language: language || undefined,
      type: classification.type,
      isFrench: classification.isFrench,
      seriesInfo: classification.seriesInfo,
      year: classification.year,
      orderIndex: orderCounter++,
    });

    pendingName = null;
    pendingAttrs = {};
    pendingGroup = null;
  }

  // Dedupe by id (last wins)
  const byId = new Map<string, Channel>();
  for (const ch of channels) byId.set(ch.id, ch);
  const dedup = Array.from(byId.values());

  // Groups
  const groups: Record<string, Channel[]> = {};
  for (const ch of dedup) {
    if (!groups[ch.group]) groups[ch.group] = [];
    groups[ch.group].push(ch);
  }
  // Sort each group's channels (FR first, then by name)
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => {
      if (a.isFrench !== b.isFrench) return a.isFrench ? -1 : 1;
      return a.name.localeCompare(b.name, "fr");
    });
  }
  const groupsSorted = Object.keys(groups).sort((a, b) => {
    const aFr = groups[a].some((c) => c.isFrench);
    const bFr = groups[b].some((c) => c.isFrench);
    if (aFr !== bFr) return aFr ? -1 : 1;
    return groups[b].length - groups[a].length;
  });

  // By type
  const liveChannels = dedup.filter((c) => c.type === "live");

  // VOD: latest releases first (year desc, then original M3U order — IPTV providers
  // typically push new additions at the top of their lists, so a lower orderIndex
  // is more recent).
  const movieChannels = dedup
    .filter((c) => c.type === "movie")
    .sort((a, b) => {
      if (a.isFrench !== b.isFrench) return a.isFrench ? -1 : 1;
      const ya = a.year ?? -1;
      const yb = b.year ?? -1;
      if (ya !== yb) return yb - ya;
      return a.orderIndex - b.orderIndex;
    });
  const seriesEpisodes = dedup.filter((c) => c.type === "series");

  // Shows index
  const shows: Record<string, ShowGroup> = {};
  for (const ep of seriesEpisodes) {
    const info = ep.seriesInfo;
    const showName = info?.show ?? ep.name;
    const showSlug = info?.showSlug ?? slugify(ep.name);
    if (!shows[showSlug]) {
      shows[showSlug] = {
        show: showName,
        showSlug,
        isFrench: ep.isFrench,
        group: ep.group,
        episodes: [],
        latestYear: ep.year,
        firstOrderIndex: ep.orderIndex,
      };
    }
    const g = shows[showSlug];
    g.episodes.push(ep);
    if (ep.isFrench) g.isFrench = true;
    if (ep.year && (g.latestYear === null || ep.year > g.latestYear)) g.latestYear = ep.year;
    if (ep.orderIndex < g.firstOrderIndex) g.firstOrderIndex = ep.orderIndex;
  }
  for (const slug of Object.keys(shows)) {
    shows[slug].episodes.sort((a, b) => {
      const sa = a.seriesInfo?.season ?? 0;
      const sb = b.seriesInfo?.season ?? 0;
      if (sa !== sb) return sa - sb;
      const ea = a.seriesInfo?.episode ?? 0;
      const eb = b.seriesInfo?.episode ?? 0;
      return ea - eb;
    });
  }
  // Shows: French first, then latest year desc, then earliest M3U appearance
  const showsSorted = Object.keys(shows).sort((a, b) => {
    const A = shows[a];
    const B = shows[b];
    if (A.isFrench !== B.isFrench) return A.isFrench ? -1 : 1;
    const ya = A.latestYear ?? -1;
    const yb = B.latestYear ?? -1;
    if (ya !== yb) return yb - ya;
    return A.firstOrderIndex - B.firstOrderIndex;
  });

  return {
    channels: dedup,
    groups,
    groupsSorted,
    liveChannels,
    movieChannels,
    seriesEpisodes,
    shows,
    showsSorted,
  };
}

/** Heuristic: does the URL look like an HLS stream? */
export function isHlsUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0];
  return u.endsWith(".m3u8") || u.includes(".m3u8");
}
