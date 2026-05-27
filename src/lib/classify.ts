/**
 * Classification heuristics for an IPTV channel/item:
 * - Detect content type (live TV channel / movie / series episode)
 * - Detect French content (priority for the FR audience)
 * - Extract series metadata (show name, season, episode) from VOD entries
 *
 * IPTV M3U playlists are messy and unstandardized — these heuristics are
 * deliberately broad and based on patterns observed across major providers.
 */

export type ContentType = "live" | "movie" | "series" | "unknown";

export type SeriesInfo = {
  show: string;
  /** Slug for routing — stable across episodes of the same show */
  showSlug: string;
  season?: number;
  episode?: number;
};

export type Classification = {
  type: ContentType;
  isFrench: boolean;
  seriesInfo: SeriesInfo | null;
  /** Production year extracted from title (e.g. "Inception (2010)") if present */
  year: number | null;
};

// --- French detection --------------------------------------------------------

const FRENCH_GROUP_PATTERNS = [
  /\b(fr|fra|france|french|français|francais)\b/i,
  /\|fr\|/i,
  /\[fr\]/i,
  /\(fr\)/i,
];

const FRENCH_CHANNEL_PATTERNS = [
  /\btf1\b/i,
  /\bm6\b/i,
  /\bfrance\s*[2-5o]\b/i,
  /\bfrance\s*info\b/i,
  /\bc\s*8\b/i,
  /\bcstar\b/i,
  /\bgulli\b/i,
  /\bnrj\s*12\b/i,
  /\btmc\b/i,
  /\btfx\b/i,
  /\bw9\b/i,
  /\b6ter\b/i,
  /\barte\b/i,
  /\bbfm\b/i,
  /\bcnews\b/i,
  /\blci\b/i,
  /\bcanal\+/i,
  /\bocs\b/i,
  /\bparis\s*premiere\b/i,
  /\brmc\b/i,
  /\bequipe\b/i,
  /\beurosport\b/i,
];

export function isFrenchChannel(input: {
  name: string;
  group: string;
  country?: string;
  language?: string;
}): boolean {
  const country = (input.country ?? "").toLowerCase();
  if (country === "fr" || country.includes("france")) return true;

  const lang = (input.language ?? "").toLowerCase();
  if (lang === "fr" || lang === "fra" || lang.includes("french") || lang.includes("français") || lang.includes("francais")) {
    return true;
  }

  for (const re of FRENCH_GROUP_PATTERNS) {
    if (re.test(input.group)) return true;
  }

  for (const re of FRENCH_CHANNEL_PATTERNS) {
    if (re.test(input.name)) return true;
  }

  return false;
}

// --- Content type detection --------------------------------------------------

const SERIES_GROUP_KEYWORDS = ["serie", "séries", "series", "tv show", "shows", "épisode"];
const MOVIE_GROUP_KEYWORDS = ["film", "movie", "cinéma", "cinema", "vod"];
const LIVE_GROUP_KEYWORDS = ["live", "direct", "chaîne", "chaine", "tv ", "iptv", "channel", "news", "sport", "info", "kids", "musique", "music"];

function groupContainsAny(group: string, keywords: string[]): boolean {
  const g = group.toLowerCase();
  return keywords.some((kw) => g.includes(kw));
}

function looksLikeVodUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0];
  return /\.(mp4|mkv|avi|mov|webm|ts)$/.test(u) && !u.endsWith("/index.ts");
}

function looksLikeHlsUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0];
  return u.endsWith(".m3u8") || u.includes(".m3u8?");
}

export function detectType(input: {
  name: string;
  group: string;
  url: string;
}): ContentType {
  // 1. Group title is the strongest signal in IPTV playlists
  if (groupContainsAny(input.group, SERIES_GROUP_KEYWORDS)) return "series";
  if (groupContainsAny(input.group, MOVIE_GROUP_KEYWORDS)) return "movie";

  // 2. URL extension as fallback for VOD
  if (looksLikeVodUrl(input.url)) {
    // VOD with episode pattern in name → series
    if (extractSeriesInfo(input.name)) return "series";
    return "movie";
  }

  // 3. HLS or live-keyword group → live channel
  if (looksLikeHlsUrl(input.url) || groupContainsAny(input.group, LIVE_GROUP_KEYWORDS)) {
    return "live";
  }

  // 4. Default to live (most IPTV content is live)
  return "live";
}

// --- Series episode parsing --------------------------------------------------

const SERIES_PATTERNS: { re: RegExp; show: number; season?: number; episode?: number }[] = [
  // "Show Name S01 E05" / "Show Name S01E05" / "Show Name s01.e05"
  { re: /^(.*?)\s*[-–|·]?\s*[Ss](\d{1,3})\s*[\.xEe]\s*(\d{1,3})\b/, show: 1, season: 2, episode: 3 },
  // "Show Name 1x05"
  { re: /^(.*?)\s*[-–|·]?\s*(\d{1,2})\s*x\s*(\d{1,3})\b/, show: 1, season: 2, episode: 3 },
  // "Show Name - Saison 1 Episode 5" / "Season 1 Episode 5"
  { re: /^(.*?)\s*[-–|·]?\s*(?:saison|season)\s*(\d{1,3})\s*[-–|·]?\s*(?:episode|épisode|ep)\s*(\d{1,3})\b/i, show: 1, season: 2, episode: 3 },
  // "Show Name - Episode 5" (no season)
  { re: /^(.*?)\s*[-–|·]\s*(?:episode|épisode|ep)\s*(\d{1,3})\b/i, show: 1, episode: 2 },
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "show";
}

export function extractSeriesInfo(name: string): SeriesInfo | null {
  for (const p of SERIES_PATTERNS) {
    const m = name.match(p.re);
    if (m) {
      const rawShow = (m[p.show] ?? "").trim().replace(/[-–|·]+$/, "").trim();
      if (!rawShow) continue;
      const season = p.season ? parseInt(m[p.season] ?? "", 10) : undefined;
      const episode = p.episode ? parseInt(m[p.episode] ?? "", 10) : undefined;
      return {
        show: rawShow,
        showSlug: slugify(rawShow),
        season: Number.isFinite(season) ? season : undefined,
        episode: Number.isFinite(episode) ? episode : undefined,
      };
    }
  }
  return null;
}

// --- Combined ---------------------------------------------------------------

const YEAR_REGEX = /(?:^|[\s\(\[\.\-])((?:19|20)\d{2})(?:[\s\)\]\.\-]|$)/;

/** Extract a 4-digit production year from a title if it looks plausible. */
export function extractYear(name: string): number | null {
  const now = new Date().getFullYear();
  const m = name.match(YEAR_REGEX);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  if (!Number.isFinite(y)) return null;
  if (y < 1920 || y > now + 1) return null;
  return y;
}

export function classify(input: {
  name: string;
  group: string;
  url: string;
  country?: string;
  language?: string;
}): Classification {
  const type = detectType(input);
  const seriesInfo = type === "series" ? extractSeriesInfo(input.name) : null;
  return {
    type,
    isFrench: isFrenchChannel(input),
    seriesInfo,
    year: type === "movie" || type === "series" ? extractYear(input.name) : null,
  };
}

/**
 * Build a stable sort comparator that puts French items first, then by name.
 */
export function frenchFirst<T extends { isFrench: boolean; name: string }>(a: T, b: T): number {
  if (a.isFrench && !b.isFrench) return -1;
  if (!a.isFrench && b.isFrench) return 1;
  return a.name.localeCompare(b.name, "fr");
}
