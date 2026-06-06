/**
 * Server-side M3U filtering, extracted so both `/api/m3u` and the new
 * `/api/catalog/*` endpoints share the exact same rules.
 *
 * Configured via env vars:
 *   M3U_INCLUDE          — global allow-list keywords (any match keeps)
 *   M3U_EXCLUDE          — global deny-list (any match drops); default = adult
 *   M3U_LIVE_INCLUDE     — extra allow-list for live entries
 *   M3U_MOVIE_INCLUDE    — extra allow-list for movies
 *   M3U_SERIES_INCLUDE   — extra allow-list for series episodes
 */

const DEFAULT_EXCLUDE =
  "xxx,porn,adult,18+,erotic,erotique,adulte,for_adults,brazzers";

export function parseKeywords(value: string | undefined): string[] {
  if (!value) return [];
  // Split on comma / semicolon / newline ONLY. Pipe `|` is part of group
  // prefixes ("FR|", "AL|") and must survive.
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export type EntryType = "live" | "movie" | "series";

const SERIES_KEYWORDS = ["serie", "series", "séries", "épisode", "episode"];
const MOVIE_KEYWORDS = [
  "film",
  "movie",
  "cinéma",
  "cinema",
  "vod",
  "affiche",
  "4k",
  "uhd",
];

export function detectType(extinf: string): EntryType {
  const lower = extinf.toLowerCase();
  if (SERIES_KEYWORDS.some((kw) => lower.includes(kw))) return "series";
  // S01E01 / 1x05 pattern → series even if group didn't say so
  if (/\bs\d{1,3}\s*[\.xee]\s*\d{1,3}\b/i.test(lower)) return "series";
  if (MOVIE_KEYWORDS.some((kw) => lower.includes(kw))) return "movie";
  return "live";
}

export type Predicate = (extinf: string) => boolean;

export function buildFilterPredicate(): Predicate {
  const globalInclude = parseKeywords(process.env.M3U_INCLUDE);
  const globalExclude = parseKeywords(
    process.env.M3U_EXCLUDE ?? DEFAULT_EXCLUDE
  );
  const liveInclude = parseKeywords(process.env.M3U_LIVE_INCLUDE);
  const movieInclude = parseKeywords(process.env.M3U_MOVIE_INCLUDE);
  const seriesInclude = parseKeywords(process.env.M3U_SERIES_INCLUDE);

  return (extinf: string) => {
    const lower = extinf.toLowerCase();

    if (globalExclude.length > 0 && globalExclude.some((k) => lower.includes(k))) {
      return false;
    }
    if (globalInclude.length > 0 && !globalInclude.some((k) => lower.includes(k))) {
      return false;
    }

    const type = detectType(extinf);
    if (type === "series" && seriesInclude.length > 0) {
      return seriesInclude.some((k) => lower.includes(k));
    }
    if (type === "movie" && movieInclude.length > 0) {
      return movieInclude.some((k) => lower.includes(k));
    }
    if (type === "live" && liveInclude.length > 0) {
      return liveInclude.some((k) => lower.includes(k));
    }

    return true;
  };
}

export type FilterStats = {
  kept: number;
  dropped: number;
  byType: Record<EntryType, { kept: number; dropped: number }>;
};

export function filterM3U(
  text: string,
  shouldKeep: Predicate
): { filtered: string; stats: FilterStats } {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let pendingExtinf: string | null = null;
  let pendingDirectives: string[] = [];
  let pendingPasses = true;
  let pendingType: EntryType = "live";
  const stats: FilterStats = {
    kept: 0,
    dropped: 0,
    byType: {
      live: { kept: 0, dropped: 0 },
      movie: { kept: 0, dropped: 0 },
      series: { kept: 0, dropped: 0 },
    },
  };

  function flush(urlLine: string | null) {
    if (pendingExtinf && pendingPasses && urlLine) {
      out.push(pendingExtinf);
      out.push(...pendingDirectives);
      out.push(urlLine);
      stats.kept++;
      stats.byType[pendingType].kept++;
    } else if (pendingExtinf) {
      stats.dropped++;
      stats.byType[pendingType].dropped++;
    } else if (urlLine) {
      out.push(urlLine);
    }
    pendingExtinf = null;
    pendingDirectives = [];
    pendingPasses = true;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("#EXTM3U")) {
      out.push(line);
      continue;
    }

    if (trimmed.startsWith("#EXTINF")) {
      if (pendingExtinf) {
        stats.dropped++;
        stats.byType[pendingType].dropped++;
        pendingExtinf = null;
        pendingDirectives = [];
      }
      pendingExtinf = line;
      pendingType = detectType(line);
      pendingPasses = shouldKeep(line);
      continue;
    }

    if (trimmed.startsWith("#")) {
      if (pendingExtinf) pendingDirectives.push(line);
      else out.push(line);
      continue;
    }

    flush(line);
  }

  if (pendingExtinf) {
    stats.dropped++;
    stats.byType[pendingType].dropped++;
  }

  return { filtered: out.join("\n"), stats };
}
